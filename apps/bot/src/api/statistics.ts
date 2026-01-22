import { FastifyInstance } from 'fastify';
import { eq, desc, sql, and, isNotNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { connectionManager } from '../connections/manager.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('statistics');

// Fetch channel data from Kick's unofficial v2 API (no auth required)
async function getKickChannelData(channelSlug: string): Promise<any | null> {
  try {
    const response = await fetch(`https://kick.com/api/v2/channels/${channelSlug}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'KaoticBot/1.0',
      },
    });

    if (!response.ok) {
      log.warn({ status: response.status, channelSlug }, 'Kick v2 API request failed');
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    log.error({ error, channelSlug }, 'Failed to fetch from Kick v2 API');
    return null;
  }
}

export async function registerStatisticsRoutes(app: FastifyInstance) {
  // Overview statistics
  app.get('/api/statistics/overview', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;

    // Check if currently live via connection manager
    const status = connectionManager.getStatus(account.id);
    const botConnected = status?.status === 'connected';

    // Get current/active stream session (no endedAt means still live)
    const currentStream = db.select()
      .from(schema.streamSessions)
      .where(and(
        eq(schema.streamSessions.accountId, account.id),
        sql`${schema.streamSessions.endedAt} IS NULL`
      ))
      .orderBy(desc(schema.streamSessions.startedAt))
      .limit(1)
      .get();

    // Fetch real data from Kick v2 API
    let followerCount = 0;
    let isLive = false;
    let liveStreamData = null;

    if (account.kickChannelSlug) {
      const channelData = await getKickChannelData(account.kickChannelSlug);
      
      if (channelData) {
        followerCount = channelData.followers_count || 0;
        
        // Check if actually streaming via Kick API
        if (channelData.livestream) {
          isLive = true;
          liveStreamData = {
            title: channelData.livestream.session_title || 'Untitled Stream',
            category: channelData.livestream.categories?.[0]?.name || 'Unknown',
            viewers: channelData.livestream.viewer_count || 0,
            startedAt: channelData.livestream.created_at,
          };
        }
      }
    }

    // Get total streams count
    const streamsResult = db.select({
      count: sql<number>`COUNT(*)`
    })
      .from(schema.streamSessions)
      .where(eq(schema.streamSessions.accountId, account.id))
      .get();
    const totalStreams = streamsResult?.count ?? 0;

    // Get total stream time and messages
    const totalsResult = db.select({
      totalTime: sql<number>`COALESCE(SUM(CASE WHEN ${schema.streamSessions.endedAt} IS NOT NULL THEN (${schema.streamSessions.endedAt} - ${schema.streamSessions.startedAt}) ELSE 0 END), 0)`,
      totalMessages: sql<number>`COALESCE(SUM(${schema.streamSessions.totalMessages}), 0)`,
      avgPeakViewers: sql<number>`COALESCE(AVG(${schema.streamSessions.peakViewers}), 0)`
    })
      .from(schema.streamSessions)
      .where(eq(schema.streamSessions.accountId, account.id))
      .get();

    // Calculate total stream time in seconds
    const totalStreamTime = Math.floor((totalsResult?.totalTime ?? 0) / 1000);
    const totalMessages = totalsResult?.totalMessages ?? 0;
    const avgPeakViewers = Math.round(totalsResult?.avgPeakViewers ?? 0);

    return {
      isLive,
      currentStream: liveStreamData || (currentStream ? {
        title: currentStream.title || 'Untitled Stream',
        category: currentStream.category || 'Unknown',
        viewers: currentStream.peakViewers || 0,
        startedAt: currentStream.startedAt?.toISOString(),
      } : null),
      followerCount,
      totalStreams,
      totalStreamTime,
      totalMessages,
      avgPeakViewers,
    };
  });

  // Recent streams
  app.get('/api/statistics/streams', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const query = request.query as { limit?: string };
    const limit = Math.min(parseInt(query.limit || '5', 10), 50);

    const streams = db.select()
      .from(schema.streamSessions)
      .where(eq(schema.streamSessions.accountId, account.id))
      .orderBy(desc(schema.streamSessions.startedAt))
      .limit(limit)
      .all();

    return streams.map(stream => {
      // Calculate duration in seconds
      let duration = 0;
      if (stream.startedAt && stream.endedAt) {
        duration = Math.floor((stream.endedAt.getTime() - stream.startedAt.getTime()) / 1000);
      }

      return {
        id: stream.id,
        title: stream.title || 'Untitled Stream',
        category: stream.category || 'Unknown',
        duration,
        peakViewers: stream.peakViewers || 0,
        totalMessages: stream.totalMessages || 0,
        uniqueChatters: stream.uniqueChatters || 0,
        newFollowers: stream.newFollowers || 0,
        startedAt: stream.startedAt?.toISOString(),
        endedAt: stream.endedAt?.toISOString(),
      };
    });
  });

  // Category breakdown
  app.get('/api/statistics/categories', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;

    const categories = db.select({
      category: schema.streamSessions.category,
      streamCount: sql<number>`COUNT(*)`,
      avgViewers: sql<number>`COALESCE(AVG(${schema.streamSessions.peakViewers}), 0)`,
      totalMessages: sql<number>`COALESCE(SUM(${schema.streamSessions.totalMessages}), 0)`,
    })
      .from(schema.streamSessions)
      .where(eq(schema.streamSessions.accountId, account.id))
      .groupBy(schema.streamSessions.category)
      .orderBy(desc(sql`COUNT(*)`))
      .all();

    return categories.map(cat => ({
      category: cat.category || 'Unknown',
      streamCount: cat.streamCount,
      avgViewers: Math.round(cat.avgViewers),
      totalMessages: cat.totalMessages,
    }));
  });

  // Recent followers
  app.get('/api/statistics/followers', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const query = request.query as { limit?: string };
    const limit = Math.min(parseInt(query.limit || '10', 10), 100);

    const localFollowers = db.select({
      username: schema.channelUsers.username,
      displayName: schema.channelUsers.displayName,
      followedAt: schema.channelUsers.followedAt,
    })
      .from(schema.channelUsers)
      .where(and(
        eq(schema.channelUsers.accountId, account.id),
        eq(schema.channelUsers.isFollower, true),
        isNotNull(schema.channelUsers.followedAt)
      ))
      .orderBy(desc(schema.channelUsers.followedAt))
      .limit(limit)
      .all();

    if (localFollowers.length > 0) {
      return localFollowers.map(f => ({
        username: f.displayName || f.username,
        followedAt: f.followedAt?.toISOString(),
      }));
    }

    return [];
  });

  // Current live stream stats
  app.get('/api/statistics/live', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;

    // Check Kick API for live status
    if (account.kickChannelSlug) {
      const channelData = await getKickChannelData(account.kickChannelSlug);
      
      if (channelData?.livestream) {
        const ls = channelData.livestream;
        return {
          isLive: true,
          stats: {
            title: ls.session_title || 'Untitled Stream',
            category: ls.categories?.[0]?.name || 'Unknown',
            viewers: ls.viewer_count || 0,
            duration: ls.duration || 0,
            startedAt: ls.created_at,
          },
        };
      }
    }

    return { isLive: false };
  });

  log.info('Statistics routes registered');
}
