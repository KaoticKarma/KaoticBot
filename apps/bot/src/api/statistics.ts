import { FastifyInstance } from 'fastify';
import { eq, desc, sql, and, isNotNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { connectionManager } from '../connections/manager.js';
import { kickApi } from '../kick/api.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('statistics');

export async function registerStatisticsRoutes(app: FastifyInstance) {
  // Overview statistics
  app.get('/api/statistics/overview', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;

    log.info({ 
      accountId: account.id,
      channelSlug: account.kickChannelSlug,
      channelId: account.kickChannelId,
    }, 'Statistics overview requested');

    // Check if currently live
    const status = connectionManager.getStatus(account.id);
    const isLive = status?.status === 'connected';

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

    // Fetch real follower count from Kick API
    let followerCount = 0;
    
    log.info({ channelSlug: account.kickChannelSlug }, 'Attempting to fetch channel from Kick API');
    
    if (account.kickChannelSlug) {
      try {
        log.info({ channelSlug: account.kickChannelSlug }, 'Calling kickApi.getChannel...');
        const channelData = await kickApi.getChannel(account.kickChannelSlug, account.accessToken);
        
        log.info({ 
          channelSlug: account.kickChannelSlug, 
          channelData: JSON.stringify(channelData),
          hasData: !!channelData
        }, 'Kick API getChannel response');
        
        if (channelData) {
          // Log all keys to see what's available
          log.info({ keys: Object.keys(channelData) }, 'Channel data keys');
          
          // Kick API returns follower count in different possible locations
          followerCount = channelData.followers_count 
            || channelData.followersCount 
            || channelData.follower_count
            || channelData.followers
            || 0;
          
          log.info({ 
            channelSlug: account.kickChannelSlug, 
            followerCount,
            raw_followers_count: channelData.followers_count,
            raw_followersCount: channelData.followersCount,
          }, 'Extracted follower count');
        } else {
          log.warn({ channelSlug: account.kickChannelSlug }, 'No channel data returned from Kick API');
        }
      } catch (error) {
        log.error({ error, channelSlug: account.kickChannelSlug }, 'Failed to fetch channel from Kick API');
      }
    } else {
      log.warn({ accountId: account.id }, 'No channel slug available for account');
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
      currentStream: currentStream ? {
        title: currentStream.title || 'Untitled Stream',
        category: currentStream.category || 'Unknown',
        viewers: currentStream.peakViewers || 0,
        startedAt: currentStream.startedAt?.toISOString(),
      } : null,
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

    const status = connectionManager.getStatus(account.id);
    if (!status || status.status !== 'connected') {
      return { isLive: false };
    }

    const currentStream = db.select()
      .from(schema.streamSessions)
      .where(and(
        eq(schema.streamSessions.accountId, account.id),
        sql`${schema.streamSessions.endedAt} IS NULL`
      ))
      .orderBy(desc(schema.streamSessions.startedAt))
      .limit(1)
      .get();

    if (!currentStream) {
      return { isLive: true, stats: null };
    }

    const now = new Date();
    const duration = currentStream.startedAt 
      ? Math.floor((now.getTime() - currentStream.startedAt.getTime()) / 1000)
      : 0;

    return {
      isLive: true,
      stats: {
        title: currentStream.title || 'Untitled Stream',
        category: currentStream.category || 'Unknown',
        duration,
        peakViewers: currentStream.peakViewers || 0,
        totalMessages: currentStream.totalMessages || 0,
        uniqueChatters: currentStream.uniqueChatters || 0,
        newFollowers: currentStream.newFollowers || 0,
        startedAt: currentStream.startedAt?.toISOString(),
      },
    };
  });

  log.info('Statistics routes registered');
}
