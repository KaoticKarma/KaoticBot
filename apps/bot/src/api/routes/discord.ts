// api/routes/discord.ts
// API routes for Discord notification settings

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { testWebhook, sendGoLiveNotification, sendOfflineNotification } from '../../discord/service.js';
import { onStreamLive, onStreamOffline, getCurrentSessionStats, isStreamLive } from '../../stats/tracker.js';
import { createChildLogger } from '../../utils/logger.js';

const log = createChildLogger('discord-api');

// Track the last test message for simulate offline
let lastTestMessageId: string | null = null;
let lastTestStartTime: Date | null = null;

interface DiscordSettingsBody {
  webhookUrl: string;
  pingEveryone?: boolean;
  customMessage?: string;
  goLiveEnabled?: boolean;
  offlineEnabled?: boolean;
  embedColor?: string;
  offlineColor?: string;
}

export async function discordRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Get Discord settings
  fastify.get('/api/discord/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const results = db.select().from(schema.discordSettings).all();
      const settings = results[0];
      
      if (!settings) {
        return {
          id: null,
          webhookUrl: '',
          pingEveryone: true,
          customMessage: 'Come hang out! 🎮',
          goLiveEnabled: true,
          offlineEnabled: true,
          embedColor: '#53fc18',
          offlineColor: '#ff6b6b',
        };
      }
      
      // Mask webhook URL for security
      const maskedUrl = settings.webhookUrl 
        ? `${'*'.repeat(50)}${settings.webhookUrl.slice(-8)}`
        : '';
      
      return {
        ...settings,
        webhookUrl: maskedUrl,
        hasWebhook: !!settings.webhookUrl,
      };
    } catch (error) {
      log.error({ error }, 'Failed to get Discord settings');
      reply.status(500).send({ error: 'Failed to get settings' });
    }
  });
  
  // Save Discord settings
  fastify.post('/api/discord/settings', async (request: FastifyRequest<{ Body: DiscordSettingsBody }>, reply: FastifyReply) => {
    try {
      const body = request.body;
      
      // Validate webhook URL if provided
      if (body.webhookUrl && !body.webhookUrl.startsWith('https://discord.com/api/webhooks/') && !body.webhookUrl.includes('*')) {
        return reply.status(400).send({ error: 'Invalid Discord webhook URL' });
      }
      
      const existing = db.select().from(schema.discordSettings).all();
      const existingSettings = existing[0];
      
      if (existingSettings) {
        const updateData: any = {
          pingEveryone: body.pingEveryone ?? true,
          customMessage: body.customMessage || 'Come hang out! 🎮',
          goLiveEnabled: body.goLiveEnabled ?? true,
          offlineEnabled: body.offlineEnabled ?? true,
          embedColor: body.embedColor || '#53fc18',
          offlineColor: body.offlineColor || '#ff6b6b',
          updatedAt: new Date(),
        };
        
        if (body.webhookUrl && !body.webhookUrl.includes('*')) {
          updateData.webhookUrl = body.webhookUrl;
        }
        
        db.update(schema.discordSettings)
          .set(updateData)
          .where(eq(schema.discordSettings.id, existingSettings.id))
          .run();
        
        return { success: true, message: 'Settings updated' };
      } else {
        if (!body.webhookUrl || body.webhookUrl.includes('*')) {
          return reply.status(400).send({ error: 'Webhook URL is required' });
        }
        
        db.insert(schema.discordSettings).values({
          webhookUrl: body.webhookUrl,
          pingEveryone: body.pingEveryone ?? true,
          customMessage: body.customMessage || 'Come hang out! 🎮',
          goLiveEnabled: body.goLiveEnabled ?? true,
          offlineEnabled: body.offlineEnabled ?? true,
          embedColor: body.embedColor || '#53fc18',
          offlineColor: body.offlineColor || '#ff6b6b',
          createdAt: new Date(),
          updatedAt: new Date(),
        }).run();
        
        return { success: true, message: 'Settings saved' };
      }
    } catch (error) {
      log.error({ error }, 'Failed to save Discord settings');
      reply.status(500).send({ error: 'Failed to save settings' });
    }
  });
  
  // Test go-live notification (sends real notification, tracks message ID)
  fastify.post('/api/discord/test-live', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const results = db.select().from(schema.discordSettings).all();
      const settings = results[0];
      
      if (!settings?.webhookUrl) {
        return reply.status(400).send({ error: 'No webhook URL configured. Please save settings first.' });
      }
      
      const result = await sendGoLiveNotification(settings, {
        title: 'Test Stream - Late Night Chaos! 🎮',
        category: 'Just Chatting',
        viewerCount: 100,
      });
      
      if (result) {
        // Store for simulate offline
        lastTestMessageId = result.messageId;
        lastTestStartTime = new Date();
        
        return { 
          success: true, 
          message: 'Test go-live notification sent!',
          messageId: result.messageId,
        };
      } else {
        return reply.status(400).send({ error: 'Failed to send notification' });
      }
    } catch (error) {
      log.error({ error }, 'Failed to test go-live');
      reply.status(500).send({ error: 'Failed to test notification' });
    }
  });
  
  // Simulate offline - edits the test message or ends real session
  fastify.post('/api/discord/trigger-offline', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check if there's a real live session
      if (isStreamLive()) {
        await onStreamOffline();
        return { success: true, message: 'Stream offline event triggered' };
      }
      
      // Otherwise, edit the test message
      if (!lastTestMessageId) {
        return reply.status(400).send({ error: 'No test message to update. Send a Go-Live notification first.' });
      }
      
      const results = db.select().from(schema.discordSettings).all();
      const settings = results[0];
      
      if (!settings?.webhookUrl) {
        return reply.status(400).send({ error: 'No webhook URL configured' });
      }
      
      // Calculate fake duration
      const duration = lastTestStartTime 
        ? Date.now() - lastTestStartTime.getTime()
        : 2 * 60 * 60 * 1000; // Default 2 hours
      
      const success = await sendOfflineNotification(settings, {
        messageId: lastTestMessageId,
        duration,
        peakViewers: 247,
        totalMessages: 1543,
        uniqueChatters: 89,
        newFollowers: 12,
        newSubs: 3,
        giftedSubs: 7,
        title: 'Test Stream - Late Night Chaos! 🎮',
        category: 'Just Chatting',
      });
      
      if (success) {
        lastTestMessageId = null;
        lastTestStartTime = null;
        return { success: true, message: 'Test message updated to offline!' };
      } else {
        return reply.status(400).send({ error: 'Failed to update message' });
      }
    } catch (error) {
      log.error({ error }, 'Failed to trigger offline');
      reply.status(500).send({ error: 'Failed to trigger event' });
    }
  });
  
  // Manually trigger go-live (for real stream simulation)
  fastify.post('/api/discord/trigger-live', async (request: FastifyRequest<{ Body: { title?: string; category?: string } }>, reply: FastifyReply) => {
    try {
      const { title = 'Testing Stream', category = 'Just Chatting' } = request.body || {};
      
      await onStreamLive({
        title,
        category,
        viewerCount: 0,
      });
      
      return { success: true, message: 'Stream live event triggered' };
    } catch (error) {
      log.error({ error }, 'Failed to trigger live');
      reply.status(500).send({ error: 'Failed to trigger event' });
    }
  });
  
  // Get current stream status
  fastify.get('/api/discord/stream-status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const isLive = isStreamLive();
      const stats = getCurrentSessionStats();
      
      return {
        isLive,
        stats: stats ? {
          ...stats,
          durationFormatted: formatDuration(stats.duration),
        } : null,
      };
    } catch (error) {
      log.error({ error }, 'Failed to get stream status');
      reply.status(500).send({ error: 'Failed to get status' });
    }
  });
  
  // Get stream session history
  fastify.get('/api/discord/sessions', async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
    try {
      const limit = parseInt(request.query.limit || '10');
      
      const sessions = db.select()
        .from(schema.streamSessions)
        .limit(limit)
        .all();
      
      return sessions.map(session => ({
        ...session,
        duration: session.endedAt && session.startedAt 
          ? (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime())
          : null,
      }));
    } catch (error) {
      log.error({ error }, 'Failed to get sessions');
      reply.status(500).send({ error: 'Failed to get sessions' });
    }
  });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

export default discordRoutes;
