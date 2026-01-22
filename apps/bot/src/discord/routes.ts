// discord/routes.ts
// API routes for Discord bot configuration

import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { discordSettings, accounts } from '../db/schema.js';
import { 
  initializeDiscordBot, 
  isDiscordReady, 
  testDiscordConnection,
  getBotGuilds,
  getGuildChannels,
  getGuildRoles,
  getBotInviteUrl
} from './service.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('discord-routes');

export async function registerDiscordRoutes(app: FastifyInstance) {
  
  // Get Discord bot status and invite URL
  app.get('/api/discord/status', async (request, reply) => {
    const isReady = isDiscordReady();
    const inviteUrl = getBotInviteUrl();
    const guilds = getBotGuilds();
    
    return reply.send({
      connected: isReady,
      inviteUrl,
      guilds,
    });
  });
  
  // Get channels for a specific guild
  app.get<{ Params: { guildId: string } }>('/api/discord/guilds/:guildId/channels', async (request, reply) => {
    const { guildId } = request.params;
    
    if (!isDiscordReady()) {
      return reply.status(503).send({ error: 'Discord bot not connected' });
    }
    
    const channels = await getGuildChannels(guildId);
    return reply.send({ channels });
  });
  
  // Get roles for a specific guild
  app.get<{ Params: { guildId: string } }>('/api/discord/guilds/:guildId/roles', async (request, reply) => {
    const { guildId } = request.params;
    
    if (!isDiscordReady()) {
      return reply.status(503).send({ error: 'Discord bot not connected' });
    }
    
    const roles = await getGuildRoles(guildId);
    return reply.send({ roles });
  });
  
  // Get user's Discord settings
  app.get('/api/discord/settings', async (request, reply) => {
    const accountId = (request as any).accountId;
    
    if (!accountId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    
    const [settings] = await db
      .select()
      .from(discordSettings)
      .where(eq(discordSettings.accountId, accountId))
      .limit(1);
    
    if (!settings) {
      // Return defaults if no settings exist
      return reply.send({
        guildId: null,
        channelId: null,
        pingEveryone: true,
        pingRoleId: null,
        customMessage: 'Come hang out! 🎮',
        goLiveEnabled: true,
        offlineEnabled: true,
        embedColor: '#53fc18',
        offlineColor: '#ff6b6b',
      });
    }
    
    return reply.send(settings);
  });
  
  // Update user's Discord settings
  app.patch<{
    Body: {
      guildId?: string | null;
      channelId?: string | null;
      pingEveryone?: boolean;
      pingRoleId?: string | null;
      customMessage?: string;
      goLiveEnabled?: boolean;
      offlineEnabled?: boolean;
      embedColor?: string;
      offlineColor?: string;
    }
  }>('/api/discord/settings', async (request, reply) => {
    const accountId = (request as any).accountId;
    
    if (!accountId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    
    const updates = request.body;
    
    // Check if settings exist
    const [existing] = await db
      .select()
      .from(discordSettings)
      .where(eq(discordSettings.accountId, accountId))
      .limit(1);
    
    if (existing) {
      // Update existing
      await db
        .update(discordSettings)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(discordSettings.accountId, accountId));
    } else {
      // Insert new
      await db.insert(discordSettings).values({
        accountId,
        ...updates,
      });
    }
    
    // Fetch and return updated settings
    const [updated] = await db
      .select()
      .from(discordSettings)
      .where(eq(discordSettings.accountId, accountId))
      .limit(1);
    
    return reply.send(updated);
  });
  
  // Test Discord connection
  app.post('/api/discord/test', async (request, reply) => {
    const accountId = (request as any).accountId;
    
    if (!accountId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    
    if (!isDiscordReady()) {
      return reply.status(503).send({ error: 'Discord bot not connected' });
    }
    
    // Get user's settings
    const [settings] = await db
      .select()
      .from(discordSettings)
      .where(eq(discordSettings.accountId, accountId))
      .limit(1);
    
    if (!settings || !settings.guildId || !settings.channelId) {
      return reply.status(400).send({ 
        error: 'Discord not configured. Please select a server and channel first.' 
      });
    }
    
    const success = await testDiscordConnection({
      guildId: settings.guildId,
      channelId: settings.channelId,
    });
    
    if (success) {
      return reply.send({ success: true, message: 'Test message sent successfully!' });
    } else {
      return reply.status(500).send({ 
        error: 'Failed to send test message. Make sure the bot has access to the selected channel.' 
      });
    }
  });
  
  // Initialize Discord bot on startup (called from main server)
  app.get('/api/discord/init', async (request, reply) => {
    const success = await initializeDiscordBot();
    
    if (success) {
      return reply.send({ success: true, message: 'Discord bot initialized' });
    } else {
      return reply.status(500).send({ error: 'Failed to initialize Discord bot' });
    }
  });
}
