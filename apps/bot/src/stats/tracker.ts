// stats/tracker.ts - Multi-tenant stream statistics tracker
import { db, schema } from '../db/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { sendGoLiveNotification, sendOfflineNotification } from '../discord/service.js';
import { captureStreamScreenshot, cleanupOldScreenshots } from '../discord/screenshot.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('stats-tracker');

interface AccountSession {
  sessionId: number;
  accountId: number;
  startedAt: Date;
  title: string;
  category: string;
  peakViewers: number;
  totalMessages: number;
  uniqueChatters: Set<string>;
  viewerSamples: number[];
  newFollowers: number;
  newSubs: number;
  giftedSubs: number;
  discordMessageId?: string;
  discordChannelId?: string;
  screenshotPath?: string;
}

const activeSessions = new Map<number, AccountSession>();

export interface StreamLiveData {
  title: string;
  category: string;
  viewerCount?: number;
  streamId?: string;
  thumbnailUrl?: string;
}

export async function onStreamLive(accountId: number, data: StreamLiveData): Promise<void> {
  log.info({ accountId, title: data.title, category: data.category }, 'Stream went live!');
  
  if (activeSessions.has(accountId)) {
    log.warn({ accountId }, 'Already tracking session for this account');
    return;
  }
  
  try {
    await cleanupOldScreenshots();
    
    let screenshotPath: string | undefined;
    try {
      screenshotPath = await captureStreamScreenshot();
    } catch (error) {
      log.warn({ error }, 'Failed to capture screenshot');
    }
    
    const result = db.insert(schema.streamSessions).values({
      accountId,
      streamId: data.streamId,
      startedAt: new Date(),
      title: data.title,
      category: data.category,
      thumbnailUrl: data.thumbnailUrl,
      screenshotPath,
      peakViewers: data.viewerCount || 0,
      totalMessages: 0,
      uniqueChatters: 0,
      newFollowers: 0,
      newSubs: 0,
      giftedSubs: 0,
    }).run();
    
    const sessionId = Number(result.lastInsertRowid);
    
    const session: AccountSession = {
      sessionId,
      accountId,
      startedAt: new Date(),
      title: data.title,
      category: data.category,
      peakViewers: data.viewerCount || 0,
      totalMessages: 0,
      uniqueChatters: new Set(),
      viewerSamples: data.viewerCount ? [data.viewerCount] : [],
      newFollowers: 0,
      newSubs: 0,
      giftedSubs: 0,
      screenshotPath,
    };
    
    activeSessions.set(accountId, session);
    
    const settings = db.select().from(schema.discordSettings).where(eq(schema.discordSettings.accountId, accountId)).get();
    
    if (settings?.guildId && settings?.channelId && settings.goLiveEnabled) {
      try {
        const discordResult = await sendGoLiveNotification(settings, {
          title: data.title,
          category: data.category,
          viewerCount: data.viewerCount,
          screenshotPath,
        });
        
        if (discordResult) {
          session.discordMessageId = discordResult.messageId;
          session.discordChannelId = discordResult.channelId;
          
          db.update(schema.streamSessions)
            .set({ discordMessageId: discordResult.messageId, discordChannelId: discordResult.channelId })
            .where(eq(schema.streamSessions.id, sessionId))
            .run();
        }
      } catch (error) {
        log.error({ error, accountId }, 'Failed to send Discord notification');
      }
    }
    
    log.info({ sessionId, accountId }, 'Stream session started');
  } catch (error) {
    log.error({ error, accountId }, 'Failed to handle stream live');
    throw error;
  }
}

export async function onStreamOffline(accountId: number): Promise<void> {
  log.info({ accountId }, 'Stream went offline!');
  
  const session = activeSessions.get(accountId);
  if (!session) {
    log.warn({ accountId }, 'No active session to finalize');
    return;
  }
  
  try {
    const endedAt = new Date();
    const duration = endedAt.getTime() - session.startedAt.getTime();
    
    const avgViewers = session.viewerSamples.length > 0
      ? Math.round(session.viewerSamples.reduce((a, b) => a + b, 0) / session.viewerSamples.length)
      : 0;
    
    db.update(schema.streamSessions)
      .set({
        endedAt,
        peakViewers: session.peakViewers,
        totalMessages: session.totalMessages,
        uniqueChatters: session.uniqueChatters.size,
        newFollowers: session.newFollowers,
        newSubs: session.newSubs,
        giftedSubs: session.giftedSubs,
      })
      .where(eq(schema.streamSessions.id, session.sessionId))
      .run();
    
    const settings = db.select().from(schema.discordSettings).where(eq(schema.discordSettings.accountId, accountId)).get();
    
    if (settings?.guildId && settings?.channelId && settings.offlineEnabled && session.discordMessageId) {
      try {
        await sendOfflineNotification(settings, {
          messageId: session.discordMessageId,
          duration,
          peakViewers: session.peakViewers,
          avgViewers,
          totalMessages: session.totalMessages,
          uniqueChatters: session.uniqueChatters.size,
          newFollowers: session.newFollowers,
          newSubs: session.newSubs,
          giftedSubs: session.giftedSubs,
          title: session.title,
          category: session.category,
          screenshotPath: session.screenshotPath,
        });
      } catch (error) {
        log.error({ error, accountId }, 'Failed to send Discord offline notification');
      }
    }
    
    log.info({ sessionId: session.sessionId, accountId, duration: Math.floor(duration / 1000), peakViewers: session.peakViewers, avgViewers }, 'Stream session ended');
    
    activeSessions.delete(accountId);
  } catch (error) {
    log.error({ error, accountId }, 'Failed to handle stream offline');
    throw error;
  }
}

export function onChatMessage(accountId: number, oderId: string, username: string): void {
  const session = activeSessions.get(accountId);
  if (!session) return;
  
  session.totalMessages++;
  session.uniqueChatters.add(oderId);
  
  if (session.totalMessages % 50 === 0) {
    db.update(schema.streamSessions)
      .set({ totalMessages: session.totalMessages, uniqueChatters: session.uniqueChatters.size })
      .where(eq(schema.streamSessions.id, session.sessionId))
      .run();
  }
}

export function onViewerCountUpdate(accountId: number, count: number): void {
  const session = activeSessions.get(accountId);
  if (!session) return;
  
  session.viewerSamples.push(count);
  if (session.viewerSamples.length > 360) session.viewerSamples.shift();
  
  if (count > session.peakViewers) {
    session.peakViewers = count;
    db.update(schema.streamSessions).set({ peakViewers: count }).where(eq(schema.streamSessions.id, session.sessionId)).run();
  }
}

export function onNewFollower(accountId: number, username: string, oderId: number): void {
  const existingUser = db.select()
    .from(schema.channelUsers)
    .where(and(eq(schema.channelUsers.accountId, accountId), eq(schema.channelUsers.kickUserId, oderId)))
    .get();
  
  if (existingUser) {
    db.update(schema.channelUsers)
      .set({ isFollower: true, followedAt: new Date(), lastSeen: new Date() })
      .where(eq(schema.channelUsers.id, existingUser.id))
      .run();
  } else {
    db.insert(schema.channelUsers)
      .values({ accountId, kickUserId: oderId, username, isFollower: true, followedAt: new Date() })
      .run();
  }
  
  const session = activeSessions.get(accountId);
  if (session) {
    session.newFollowers++;
    db.update(schema.streamSessions).set({ newFollowers: session.newFollowers }).where(eq(schema.streamSessions.id, session.sessionId)).run();
  }
}

export function onNewSub(accountId: number): void {
  const session = activeSessions.get(accountId);
  if (!session) return;
  session.newSubs++;
  db.update(schema.streamSessions).set({ newSubs: session.newSubs }).where(eq(schema.streamSessions.id, session.sessionId)).run();
}

export function onGiftedSub(accountId: number, amount: number = 1): void {
  const session = activeSessions.get(accountId);
  if (!session) return;
  session.giftedSubs += amount;
  db.update(schema.streamSessions).set({ giftedSubs: session.giftedSubs }).where(eq(schema.streamSessions.id, session.sessionId)).run();
}

export function getCurrentSessionStats(accountId: number) {
  const session = activeSessions.get(accountId);
  if (!session) return null;
  
  const avgViewers = session.viewerSamples.length > 0
    ? Math.round(session.viewerSamples.reduce((a, b) => a + b, 0) / session.viewerSamples.length)
    : 0;
  
  return {
    isLive: true,
    duration: Date.now() - session.startedAt.getTime(),
    peakViewers: session.peakViewers,
    avgViewers,
    totalMessages: session.totalMessages,
    uniqueChatters: session.uniqueChatters.size,
    newFollowers: session.newFollowers,
    newSubs: session.newSubs,
    giftedSubs: session.giftedSubs,
    title: session.title,
    category: session.category,
  };
}

export function isStreamLive(accountId: number): boolean {
  return activeSessions.has(accountId);
}

export function getRecentSessions(accountId: number, limit: number = 5) {
  return db.select()
    .from(schema.streamSessions)
    .where(eq(schema.streamSessions.accountId, accountId))
    .orderBy(desc(schema.streamSessions.startedAt))
    .limit(limit)
    .all();
}

export function getCategoryStats(accountId: number) {
  const sessions = db.select().from(schema.streamSessions).where(eq(schema.streamSessions.accountId, accountId)).all();
  
  const categoryMap = new Map<string, { category: string; streamCount: number; totalDuration: number; totalViewers: number; totalMessages: number; peakViewers: number }>();
  
  for (const session of sessions) {
    const category = session.category || 'Unknown';
    const existing = categoryMap.get(category) || { category, streamCount: 0, totalDuration: 0, totalViewers: 0, totalMessages: 0, peakViewers: 0 };
    
    const duration = session.endedAt ? new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime() : 0;
    
    existing.streamCount++;
    existing.totalDuration += duration;
    existing.totalViewers += session.peakViewers || 0;
    existing.totalMessages += session.totalMessages || 0;
    existing.peakViewers = Math.max(existing.peakViewers, session.peakViewers || 0);
    
    categoryMap.set(category, existing);
  }
  
  return Array.from(categoryMap.values())
    .map(cat => ({
      ...cat,
      avgViewers: cat.streamCount > 0 ? Math.round(cat.totalViewers / cat.streamCount) : 0,
      avgDuration: cat.streamCount > 0 ? Math.round(cat.totalDuration / cat.streamCount) : 0,
    }))
    .sort((a, b) => b.streamCount - a.streamCount);
}

export function getRecentFollowers(accountId: number, limit: number = 10) {
  return db.select()
    .from(schema.channelUsers)
    .where(and(eq(schema.channelUsers.accountId, accountId), eq(schema.channelUsers.isFollower, true)))
    .orderBy(desc(schema.channelUsers.followedAt))
    .limit(limit)
    .all();
}

export function getFollowerCount(accountId: number): number {
  const result = db.select()
    .from(schema.channelUsers)
    .where(and(eq(schema.channelUsers.accountId, accountId), eq(schema.channelUsers.isFollower, true)))
    .all();
  return result.length;
}

export function initializeTracker(): void {
  log.info('Multi-tenant stats tracker initialized');
}
