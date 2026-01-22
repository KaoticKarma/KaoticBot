// stats/tracker.ts
// Tracks stream statistics and manages Discord notifications

import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { sendGoLiveNotification, sendOfflineNotification } from '../discord/service.js';
import { captureStreamScreenshot, cleanupOldScreenshots } from '../discord/screenshot.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('stats-tracker');

// In-memory tracking for current session
let currentSession: {
  sessionId: number;
  startedAt: Date;
  title: string;
  category: string;
  peakViewers: number;
  totalMessages: number;
  uniqueChatters: Set<string>;
  newFollowers: number;
  newSubs: number;
  giftedSubs: number;
  discordMessageId?: string;
  discordChannelId?: string;
  screenshotPath?: string;
} | null = null;

// Track if stream is currently live
let streamIsLive = false;

export interface StreamLiveData {
  title: string;
  category: string;
  viewerCount?: number;
  streamId?: string;
  thumbnailUrl?: string;
}

export async function onStreamLive(data: StreamLiveData): Promise<void> {
  log.info('Stream went live! Starting session tracking...');
  
  try {
    // Cleanup old screenshots
    await cleanupOldScreenshots();
    
    // Capture screenshot
    let screenshotPath: string | undefined;
    try {
      screenshotPath = await captureStreamScreenshot();
      log.info({ screenshotPath }, 'Screenshot captured');
    } catch (error) {
      log.warn({ error }, 'Failed to capture screenshot, continuing without it');
    }
    
    // Create stream session in database
    const result = db.insert(schema.streamSessions).values({
      streamId: data.streamId,
      startedAt: new Date(),
      title: data.title,
      category: data.category,
      thumbnailUrl: data.thumbnailUrl,
      screenshotPath: screenshotPath,
      peakViewers: data.viewerCount || 0,
      totalMessages: 0,
      uniqueChatters: 0,
      newFollowers: 0,
      newSubs: 0,
      giftedSubs: 0,
    }).run();
    
    const sessionId = Number(result.lastInsertRowid);
    
    // Initialize in-memory tracking
    currentSession = {
      sessionId,
      startedAt: new Date(),
      title: data.title,
      category: data.category,
      peakViewers: data.viewerCount || 0,
      totalMessages: 0,
      uniqueChatters: new Set<string>(),
      newFollowers: 0,
      newSubs: 0,
      giftedSubs: 0,
      screenshotPath,
    };
    
    streamIsLive = true;
    
    // Get Discord settings and send notification
    const discordSettings = db.select().from(schema.discordSettings).all();
    const settings = discordSettings[0];
    
    if (settings?.webhookUrl && settings.goLiveEnabled) {
      try {
        const discordResult = await sendGoLiveNotification(settings, {
          title: data.title,
          category: data.category,
          viewerCount: data.viewerCount,
          screenshotPath,
        });
        
        if (discordResult) {
          currentSession.discordMessageId = discordResult.messageId;
          currentSession.discordChannelId = discordResult.channelId;
          
          // Update database with Discord message info
          db.update(schema.streamSessions)
            .set({
              discordMessageId: discordResult.messageId,
              discordChannelId: discordResult.channelId,
            })
            .where(eq(schema.streamSessions.id, sessionId))
            .run();
          
          log.info({ messageId: discordResult.messageId }, 'Discord go-live notification sent');
        }
      } catch (error) {
        log.error({ error }, 'Failed to send Discord notification');
      }
    }
    
    log.info({ sessionId }, 'Stream session started');
  } catch (error) {
    log.error({ error }, 'Failed to handle stream live event');
    throw error;
  }
}

export async function onStreamOffline(): Promise<void> {
  log.info('Stream went offline! Finalizing session...');
  
  if (!currentSession) {
    log.warn('No active session to finalize');
    return;
  }
  
  try {
    const endedAt = new Date();
    const duration = endedAt.getTime() - currentSession.startedAt.getTime();
    
    // Update database with final stats
    db.update(schema.streamSessions)
      .set({
        endedAt,
        peakViewers: currentSession.peakViewers,
        totalMessages: currentSession.totalMessages,
        uniqueChatters: currentSession.uniqueChatters.size,
        newFollowers: currentSession.newFollowers,
        newSubs: currentSession.newSubs,
        giftedSubs: currentSession.giftedSubs,
      })
      .where(eq(schema.streamSessions.id, currentSession.sessionId))
      .run();
    
    // Get Discord settings and send offline notification
    const discordSettings = db.select().from(schema.discordSettings).all();
    const settings = discordSettings[0];
    
    if (settings?.webhookUrl && settings.offlineEnabled && currentSession.discordMessageId) {
      try {
        await sendOfflineNotification(settings, {
          messageId: currentSession.discordMessageId,
          duration,
          peakViewers: currentSession.peakViewers,
          totalMessages: currentSession.totalMessages,
          uniqueChatters: currentSession.uniqueChatters.size,
          newFollowers: currentSession.newFollowers,
          newSubs: currentSession.newSubs,
          giftedSubs: currentSession.giftedSubs,
          title: currentSession.title,
          category: currentSession.category,
          screenshotPath: currentSession.screenshotPath,
        });
        
        log.info('Discord offline notification sent');
      } catch (error) {
        log.error({ error }, 'Failed to send Discord offline notification');
      }
    }
    
    log.info({
      sessionId: currentSession.sessionId,
      duration: Math.floor(duration / 1000),
      peakViewers: currentSession.peakViewers,
      totalMessages: currentSession.totalMessages,
      uniqueChatters: currentSession.uniqueChatters.size,
    }, 'Stream session ended');
    
    // Clear session
    currentSession = null;
    streamIsLive = false;
  } catch (error) {
    log.error({ error }, 'Failed to handle stream offline event');
    throw error;
  }
}

export function onChatMessage(userId: string, username: string): void {
  if (!currentSession) return;
  
  currentSession.totalMessages++;
  currentSession.uniqueChatters.add(userId);
  
  // Periodically sync to database (every 50 messages)
  if (currentSession.totalMessages % 50 === 0) {
    db.update(schema.streamSessions)
      .set({
        totalMessages: currentSession.totalMessages,
        uniqueChatters: currentSession.uniqueChatters.size,
      })
      .where(eq(schema.streamSessions.id, currentSession.sessionId))
      .run();
  }
}

export function onViewerCountUpdate(count: number): void {
  if (!currentSession) return;
  
  if (count > currentSession.peakViewers) {
    currentSession.peakViewers = count;
    
    db.update(schema.streamSessions)
      .set({ peakViewers: count })
      .where(eq(schema.streamSessions.id, currentSession.sessionId))
      .run();
  }
}

export function onNewFollower(): void {
  if (!currentSession) return;
  
  currentSession.newFollowers++;
  
  db.update(schema.streamSessions)
    .set({ newFollowers: currentSession.newFollowers })
    .where(eq(schema.streamSessions.id, currentSession.sessionId))
    .run();
}

export function onNewSub(): void {
  if (!currentSession) return;
  
  currentSession.newSubs++;
  
  db.update(schema.streamSessions)
    .set({ newSubs: currentSession.newSubs })
    .where(eq(schema.streamSessions.id, currentSession.sessionId))
    .run();
}

export function onGiftedSub(amount: number = 1): void {
  if (!currentSession) return;
  
  currentSession.giftedSubs += amount;
  
  db.update(schema.streamSessions)
    .set({ giftedSubs: currentSession.giftedSubs })
    .where(eq(schema.streamSessions.id, currentSession.sessionId))
    .run();
}

export function getCurrentSessionStats(): {
  duration: number;
  peakViewers: number;
  totalMessages: number;
  uniqueChatters: number;
  newFollowers: number;
  newSubs: number;
  giftedSubs: number;
  title: string;
  category: string;
} | null {
  if (!currentSession) return null;
  
  return {
    duration: Date.now() - currentSession.startedAt.getTime(),
    peakViewers: currentSession.peakViewers,
    totalMessages: currentSession.totalMessages,
    uniqueChatters: currentSession.uniqueChatters.size,
    newFollowers: currentSession.newFollowers,
    newSubs: currentSession.newSubs,
    giftedSubs: currentSession.giftedSubs,
    title: currentSession.title,
    category: currentSession.category,
  };
}

export function isStreamLive(): boolean {
  return streamIsLive;
}

export function initializeTracker(): void {
  log.info('Stats tracker initialized');
}
