import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { generateAuthUrl, exchangeCode, generateBotAuthUrl, isBotAuthState, getBotConfig } from '../auth/oauth.js';
import { requireAuth, createSession, deleteSession, setSessionCookie, clearSessionCookie, SESSION_COOKIE, type AuthenticatedRequest } from '../auth/middleware.js';
import { kickApi } from '../kick/api.js';
import { db, schema } from '../db/index.js';
import { eq, and, desc, isNull, or } from 'drizzle-orm';
import { createChildLogger } from '../utils/logger.js';
import { alertsManager } from '../alerts/manager.js';
import { initializeTracker } from '../stats/tracker.js';
import { registerStatisticsRoutes } from './statistics.js';
import { connectionManager } from '../connections/manager.js';
import { isDiscordReady, testDiscordConnection, getBotGuilds, getGuildChannels, getGuildRoles, getBotInviteUrl } from '../discord/service.js';
import { isAIEnabled, setAIEnabled, getAIConfig } from '../ai/service.js';
import { readFileSync, createWriteStream, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pipeline } from 'stream/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const log = createChildLogger('api');

let timerManagerInstance: any = null;
let botInstance: any = null;

export function setTimerManager(manager: any) { timerManagerInstance = manager; log.info('Timer manager connected'); }
export function setBotInstance(bot: any) { botInstance = bot; log.info('Bot instance connected'); }
export function setConnectionManager(manager: typeof connectionManager) { log.info('Connection manager connected'); }

// Generate a URL-safe token
function generateWidgetToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

// Get or create widget token for an account
function getOrCreateWidgetToken(accountId: number): string {
  let existing = db.select().from(schema.widgetTokens).where(eq(schema.widgetTokens.accountId, accountId)).get();
  if (existing) return existing.token;
  
  const token = generateWidgetToken();
  db.insert(schema.widgetTokens).values({ accountId, token }).run();
  return token;
}

export async function startServer() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(fastifyMultipart, { 
    limits: { 
      fileSize: 100 * 1024 * 1024,  // 100MB max
      files: 1,
    },
    // Optimize for larger files - higher water mark = larger chunks = faster
    attachFieldsToBody: false,
  });
  
  const alertsDir = join(__dirname, '../../data/alerts');
  if (!existsSync(alertsDir)) mkdirSync(alertsDir, { recursive: true });
  const screenshotsDir = join(process.cwd(), 'data', 'screenshots');
  if (!existsSync(screenshotsDir)) mkdirSync(screenshotsDir, { recursive: true });
  const clipsDir = join(process.cwd(), 'data', 'clips');
  if (!existsSync(clipsDir)) mkdirSync(clipsDir, { recursive: true });
  
  try { await app.register(fastifyStatic, { root: alertsDir, prefix: '/alerts/media/' }); }
  catch (error) { log.warn({ error }, 'Static file serving disabled'); }

  try { await app.register(fastifyStatic, { root: clipsDir, prefix: '/clips/media/', decorateReply: false }); }
  catch (error) { log.warn({ error }, 'Clips static file serving disabled'); }

  // Health Check
  app.get('/health', async () => ({ status: 'ok', authenticated: kickApi.isAuthenticated() }));

  // Auth Routes
  app.get('/auth/login', async (request, reply) => {
    const { url, state } = generateAuthUrl();
    reply.setCookie('oauth_state', state, { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/' });
    return reply.redirect(url);
  });

  app.get('/auth/bot/login', async (request, reply) => {
    const { url, state } = generateBotAuthUrl();
    reply.setCookie('oauth_state', state, { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/' });
    return reply.redirect(url);
  });

  app.get('/api/bot/config', async () => {
    const botCfg = getBotConfig();
    if (!botCfg) return { configured: false, message: 'Bot account not configured. Visit /auth/bot/login to authenticate.' };
    return { configured: true, botUsername: botCfg.botUsername, botUserId: botCfg.botUserId, tokenExpiresAt: botCfg.tokenExpiresAt, updatedAt: botCfg.updatedAt };
  });

  app.get('/auth/callback', async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };
    const storedState = request.cookies.oauth_state;
    reply.clearCookie('oauth_state');
    if (!code || !state || state !== storedState) return reply.status(400).send({ error: 'Invalid OAuth callback' });
    const isBot = isBotAuthState(state);
    const result = await exchangeCode(code, state);
    if (!result) return reply.status(400).send({ error: 'Authentication failed' });
    if (isBot) {
      const dashboardUrl = config.NODE_ENV === 'production' ? '/' : 'http://localhost:5173/';
      return reply.redirect(dashboardUrl + '?bot_auth=success');
    }
    const sessionId = await createSession(result.accountId);
    setSessionCookie(reply, sessionId, config.NODE_ENV === 'production');
    const dashboardUrl = config.NODE_ENV === 'production' ? '/' : 'http://localhost:5173/';
    return reply.redirect(dashboardUrl + '?auth=success');
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    return { id: account.id, kickUserId: account.kickUserId, username: account.kickUsername, displayName: account.kickDisplayName, email: account.kickEmail, profilePic: account.kickProfilePic, channelId: account.kickChannelId, chatroomId: account.kickChatroomId, channelSlug: account.kickChannelSlug, subscriptionTier: account.subscriptionTier, botEnabled: account.botEnabled };
  });

  app.get('/api/auth/status', async (request) => {
    const sessionId = request.cookies[SESSION_COOKIE];
    if (sessionId) {
      const session = db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).get();
      if (session) {
        const account = db.select().from(schema.accounts).where(eq(schema.accounts.id, session.accountId)).get();
        if (account) return { authenticated: true, user: { id: account.id, username: account.kickUsername, profilePic: account.kickProfilePic } };
      }
    }
    return { authenticated: false, user: null };
  });

  app.post('/api/auth/update-channel', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const { chatroomId, channelId } = request.body as { chatroomId?: number; channelId?: number };
    if (!chatroomId) return { success: false, error: 'chatroomId is required' };
    try {
      db.update(schema.accounts).set({ kickChatroomId: chatroomId, kickChannelId: channelId || account.kickChannelId, updatedAt: new Date() }).where(eq(schema.accounts.id, account.id)).run();
      return { success: true };
    } catch (error) { return { success: false, error: 'Failed to update channel info' }; }
  });

  app.post('/auth/logout', async (request, reply) => {
    const sessionId = request.cookies[SESSION_COOKIE];
    if (sessionId) deleteSession(sessionId);
    clearSessionCookie(reply);
    return { success: true };
  });

  // Bot Control Routes
  app.post('/api/bot/enable', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    if (!account.kickChannelId || !account.kickChatroomId) return reply.code(400).send({ success: false, error: 'No channel found.' });
    if (!connectionManager.isBotConfigured()) return reply.code(400).send({ success: false, error: 'Bot account not configured.' });
    const existing = connectionManager.getStatus(account.id);
    if (existing && existing.status === 'connected') return { success: true, message: 'Bot already enabled', status: existing };
    try {
      const connected = await connectionManager.connectChannel(account.id);
      if (connected) {
        if (botInstance && botInstance.setupAccountHandlers) botInstance.setupAccountHandlers(account.id);
        return { success: true, message: 'Bot enabled', status: connectionManager.getStatus(account.id) };
      }
      return reply.code(500).send({ success: false, error: 'Failed to connect.' });
    } catch (error) { return reply.code(500).send({ success: false, error: 'An error occurred' }); }
  });

  app.post('/api/bot/disable', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    try {
      if (botInstance && botInstance.cleanupAccountHandlers) botInstance.cleanupAccountHandlers(account.id);
      await connectionManager.disconnectChannel(account.id);
      return { success: true, message: 'Bot disabled' };
    } catch (error) { return { success: false, error: 'An error occurred' }; }
  });

  app.get('/api/bot/status', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const status = connectionManager.getStatus(account.id);
    const botConfigured = connectionManager.isBotConfigured();
    if (!status) return { enabled: false, status: 'disconnected', channelSlug: account.kickChannelSlug, hasChannel: !!(account.kickChannelId && account.kickChatroomId), botConfigured };
    return { enabled: status.status === 'connected', status: status.status, channelSlug: status.channelSlug, connectedAt: status.connectedAt, messageCount: status.messageCount, lastError: status.lastError, hasChannel: true, botConfigured };
  });

  app.post('/api/bot/test-message', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const body = request.body as { message?: string };
    const status = connectionManager.getStatus(account.id);
    if (!status || status.status !== 'connected') return reply.code(400).send({ success: false, error: 'Bot is not enabled' });
    return await connectionManager.sendMessage(account.id, body.message || 'Test from KaoticBot! 🤖');
  });

  // Commands API
  app.get('/api/commands', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    return db.select().from(schema.commands).where(or(eq(schema.commands.accountId, account.id), isNull(schema.commands.accountId))).orderBy(schema.commands.name).all();
  });

  app.get('/api/commands/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const command = db.select().from(schema.commands).where(and(eq(schema.commands.id, parseInt(id, 10)), or(eq(schema.commands.accountId, account.id), isNull(schema.commands.accountId)))).get();
    if (!command) return reply.code(404).send({ error: 'Command not found' });
    return command;
  });

  app.post('/api/commands', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const body = request.body as { name: string; response: string; cooldown?: number; userLevel?: string; aliases?: string[] };
    if (!body.name || !body.response) return reply.code(400).send({ error: 'Name and response required' });
    const existing = db.select().from(schema.commands).where(and(eq(schema.commands.accountId, account.id), eq(schema.commands.name, body.name.toLowerCase()))).get();
    if (existing) return reply.code(400).send({ error: 'Command already exists' });
    const result = db.insert(schema.commands).values({ accountId: account.id, name: body.name.toLowerCase(), response: body.response, cooldown: body.cooldown || 5, userLevel: (body.userLevel as any) || 'everyone', aliases: body.aliases || [], enabled: true, usageCount: 0 }).run();
    return db.select().from(schema.commands).where(eq(schema.commands.id, Number(result.lastInsertRowid))).get();
  });

  app.patch('/api/commands/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const existing = db.select().from(schema.commands).where(and(eq(schema.commands.id, parseInt(id, 10)), or(eq(schema.commands.accountId, account.id), isNull(schema.commands.accountId)))).get();
    if (!existing) return reply.code(404).send({ error: 'Command not found' });
    if (existing.accountId === null) {
      const result = db.insert(schema.commands).values({ accountId: account.id, name: body.name?.toLowerCase() || existing.name, response: body.response ?? existing.response, cooldown: body.cooldown ?? existing.cooldown, userLevel: (body.userLevel as any) ?? existing.userLevel, aliases: body.aliases ?? existing.aliases, enabled: body.enabled ?? existing.enabled, usageCount: 0 }).run();
      return db.select().from(schema.commands).where(eq(schema.commands.id, Number(result.lastInsertRowid))).get();
    }
    db.update(schema.commands).set({ name: body.name?.toLowerCase() ?? existing.name, response: body.response ?? existing.response, cooldown: body.cooldown ?? existing.cooldown, userLevel: (body.userLevel as any) ?? existing.userLevel, aliases: body.aliases ?? existing.aliases, enabled: body.enabled ?? existing.enabled, updatedAt: new Date() }).where(eq(schema.commands.id, parseInt(id, 10))).run();
    return db.select().from(schema.commands).where(eq(schema.commands.id, parseInt(id, 10))).get();
  });

  app.delete('/api/commands/:id', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const result = db.delete(schema.commands).where(and(eq(schema.commands.id, parseInt(id, 10)), eq(schema.commands.accountId, account.id))).run();
    return { success: result.changes > 0 };
  });

  // Timers API
  app.get('/api/timers', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    return db.select().from(schema.timers).where(or(eq(schema.timers.accountId, account.id), isNull(schema.timers.accountId))).all();
  });

  app.post('/api/timers', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const body = request.body as { name: string; message: string; interval?: number; minChatLines?: number; enabled?: boolean };
    if (!body.name || !body.message) return reply.code(400).send({ error: 'Name and message required' });
    const result = db.insert(schema.timers).values({ accountId: account.id, name: body.name, message: body.message, interval: body.interval || 300, minChatLines: body.minChatLines || 5, enabled: body.enabled ?? true }).run();
    if (timerManagerInstance) timerManagerInstance.reload();
    return db.select().from(schema.timers).where(eq(schema.timers.id, Number(result.lastInsertRowid))).get();
  });

  app.patch('/api/timers/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const existing = db.select().from(schema.timers).where(and(eq(schema.timers.id, parseInt(id, 10)), or(eq(schema.timers.accountId, account.id), isNull(schema.timers.accountId)))).get();
    if (!existing) return reply.code(404).send({ error: 'Timer not found' });
    db.update(schema.timers).set({ name: body.name ?? existing.name, message: body.message ?? existing.message, interval: body.interval ?? existing.interval, minChatLines: body.minChatLines ?? existing.minChatLines, enabled: body.enabled ?? existing.enabled }).where(eq(schema.timers.id, parseInt(id, 10))).run();
    if (timerManagerInstance) timerManagerInstance.reload();
    return db.select().from(schema.timers).where(eq(schema.timers.id, parseInt(id, 10))).get();
  });

  app.delete('/api/timers/:id', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    db.delete(schema.timers).where(and(eq(schema.timers.id, parseInt(id, 10)), eq(schema.timers.accountId, account.id))).run();
    if (timerManagerInstance) timerManagerInstance.reload();
    return { success: true };
  });

  // ============================================
  // Widget Token API
  // ============================================

  app.get('/api/widget/token', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const token = getOrCreateWidgetToken(account.id);
    return { token, widgetUrl: `/alerts/overlay?token=${token}` };
  });

  app.post('/api/widget/token/regenerate', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const newToken = generateWidgetToken();
    
    const existing = db.select().from(schema.widgetTokens).where(eq(schema.widgetTokens.accountId, account.id)).get();
    if (existing) {
      db.update(schema.widgetTokens).set({ token: newToken, updatedAt: new Date() }).where(eq(schema.widgetTokens.accountId, account.id)).run();
    } else {
      db.insert(schema.widgetTokens).values({ accountId: account.id, token: newToken }).run();
    }
    
    return { token: newToken, widgetUrl: `/alerts/overlay?token=${newToken}` };
  });

  // ============================================
  // Custom Widget Configs API (Advanced Settings)
  // ============================================

  // List all custom widget configs for account
  app.get('/api/widgets', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const widgets = db.select().from(schema.widgetConfigs).where(eq(schema.widgetConfigs.accountId, account.id)).all();
    return widgets.map(w => ({
      ...w,
      alertTypes: JSON.parse(w.alertTypes),
      widgetUrl: `/alerts/overlay?token=${w.token}`,
    }));
  });

  // Create new custom widget config
  app.post('/api/widgets', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const body = request.body as { name: string; alertTypes: string[] };
    
    if (!body.name || !body.alertTypes || !Array.isArray(body.alertTypes)) {
      return reply.code(400).send({ error: 'Name and alertTypes array required' });
    }
    
    const token = generateWidgetToken();
    const result = db.insert(schema.widgetConfigs).values({
      accountId: account.id,
      token,
      name: body.name,
      alertTypes: JSON.stringify(body.alertTypes),
    }).run();
    
    const widget = db.select().from(schema.widgetConfigs).where(eq(schema.widgetConfigs.id, Number(result.lastInsertRowid))).get();
    return {
      ...widget,
      alertTypes: JSON.parse(widget!.alertTypes),
      widgetUrl: `/alerts/overlay?token=${token}`,
    };
  });

  // Update custom widget config
  app.patch('/api/widgets/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; alertTypes?: string[] };
    
    const existing = db.select().from(schema.widgetConfigs)
      .where(and(eq(schema.widgetConfigs.id, parseInt(id, 10)), eq(schema.widgetConfigs.accountId, account.id)))
      .get();
    
    if (!existing) return reply.code(404).send({ error: 'Widget config not found' });
    
    db.update(schema.widgetConfigs).set({
      name: body.name ?? existing.name,
      alertTypes: body.alertTypes ? JSON.stringify(body.alertTypes) : existing.alertTypes,
      updatedAt: new Date(),
    }).where(eq(schema.widgetConfigs.id, parseInt(id, 10))).run();
    
    const updated = db.select().from(schema.widgetConfigs).where(eq(schema.widgetConfigs.id, parseInt(id, 10))).get();
    return {
      ...updated,
      alertTypes: JSON.parse(updated!.alertTypes),
      widgetUrl: `/alerts/overlay?token=${updated!.token}`,
    };
  });

  // Delete custom widget config
  app.delete('/api/widgets/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    
    const existing = db.select().from(schema.widgetConfigs)
      .where(and(eq(schema.widgetConfigs.id, parseInt(id, 10)), eq(schema.widgetConfigs.accountId, account.id)))
      .get();
    
    if (!existing) return reply.code(404).send({ error: 'Widget config not found' });
    
    db.delete(schema.widgetConfigs).where(eq(schema.widgetConfigs.id, parseInt(id, 10))).run();
    return { success: true };
  });

  // Regenerate token for custom widget
  app.post('/api/widgets/:id/regenerate', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    
    const existing = db.select().from(schema.widgetConfigs)
      .where(and(eq(schema.widgetConfigs.id, parseInt(id, 10)), eq(schema.widgetConfigs.accountId, account.id)))
      .get();
    
    if (!existing) return reply.code(404).send({ error: 'Widget config not found' });
    
    const newToken = generateWidgetToken();
    db.update(schema.widgetConfigs).set({ token: newToken, updatedAt: new Date() })
      .where(eq(schema.widgetConfigs.id, parseInt(id, 10))).run();
    
    return { token: newToken, widgetUrl: `/alerts/overlay?token=${newToken}` };
  });

  // ============================================
  // Alerts API (with full styling support)
  // ============================================

  app.get('/api/alerts', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    return db.select().from(schema.alerts).where(or(eq(schema.alerts.accountId, account.id), isNull(schema.alerts.accountId))).all();
  });

  app.post('/api/alerts', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const body = request.body as any;
    if (!body.type || !body.message) return reply.code(400).send({ error: 'Type and message required' });
    
    const result = db.insert(schema.alerts).values({
      accountId: account.id,
      type: body.type,
      minAmount: body.minAmount || 1,
      maxAmount: body.maxAmount,
      message: body.message,
      sound: body.sound,
      imageUrl: body.imageUrl,
      videoUrl: body.videoUrl,
      duration: body.duration || 5000,
      enabled: body.enabled ?? true,
      // Styling fields
      layout: body.layout || 'above',
      animation: body.animation || 'fade',
      volume: body.volume ?? 50,
      topTextColor: body.topTextColor || '#ffffff',
      bottomTextColor: body.bottomTextColor || '#ffffff',
      font: body.font || 'Impact',
      textPositionY: body.textPositionY ?? 0,
      // Custom code fields
      customCodeEnabled: body.customCodeEnabled ?? false,
      customHtml: body.customHtml || null,
      customCss: body.customCss || null,
      customJs: body.customJs || null,
    }).run();
    
    return db.select().from(schema.alerts).where(eq(schema.alerts.id, Number(result.lastInsertRowid))).get();
  });

  app.patch('/api/alerts/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    
    log.info({ alertId: id, accountId: account.id, body }, 'PATCH alert request received');
    
    const existing = db.select().from(schema.alerts).where(and(eq(schema.alerts.id, parseInt(id, 10)), or(eq(schema.alerts.accountId, account.id), isNull(schema.alerts.accountId)))).get();
    if (!existing) return reply.code(404).send({ error: 'Alert not found' });
    
    log.info({ existingAlert: existing }, 'Existing alert before update');
    
    const updateData = {
      type: body.type ?? existing.type,
      minAmount: body.minAmount ?? existing.minAmount,
      maxAmount: body.maxAmount !== undefined ? body.maxAmount : existing.maxAmount,
      message: body.message ?? existing.message,
      sound: body.sound !== undefined ? body.sound : existing.sound,
      imageUrl: body.imageUrl !== undefined ? body.imageUrl : existing.imageUrl,
      videoUrl: body.videoUrl !== undefined ? body.videoUrl : existing.videoUrl,
      duration: body.duration ?? existing.duration,
      enabled: body.enabled ?? existing.enabled,
      // Styling fields
      layout: body.layout ?? existing.layout,
      animation: body.animation ?? existing.animation,
      volume: body.volume !== undefined ? body.volume : existing.volume,
      topTextColor: body.topTextColor ?? existing.topTextColor,
      bottomTextColor: body.bottomTextColor ?? existing.bottomTextColor,
      font: body.font ?? existing.font,
      textPositionY: body.textPositionY !== undefined ? body.textPositionY : existing.textPositionY,
      // Custom code fields
      customCodeEnabled: body.customCodeEnabled !== undefined ? body.customCodeEnabled : existing.customCodeEnabled,
      customHtml: body.customHtml !== undefined ? body.customHtml : existing.customHtml,
      customCss: body.customCss !== undefined ? body.customCss : existing.customCss,
      customJs: body.customJs !== undefined ? body.customJs : existing.customJs,
    };
    
    log.info({ updateData }, 'Data to be saved');
    
    const result = db.update(schema.alerts).set(updateData).where(eq(schema.alerts.id, parseInt(id, 10))).run();
    log.info({ changes: result.changes }, 'Update result');
    
    const updated = db.select().from(schema.alerts).where(eq(schema.alerts.id, parseInt(id, 10))).get();
    log.info({ updatedAlert: updated }, 'Alert after update');
    
    return updated;
  });

  app.delete('/api/alerts/:id', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    db.delete(schema.alerts).where(and(eq(schema.alerts.id, parseInt(id, 10)), eq(schema.alerts.accountId, account.id))).run();
    return { success: true };
  });

  // Alerts streaming with token support (per-account) and custom widget filtering
  app.get('/api/alerts/stream', async (request, reply) => {
    const { token } = request.query as { token?: string };
    
    // Validate token and get account ID + alert type filter
    let accountId: number | null = null;
    let allowedAlertTypes: string[] | null = null; // null = all types allowed
    
    if (token) {
      // First check default widget tokens
      accountId = alertsManager.getAccountIdFromToken(token);
      
      // If not found in default tokens, check custom widget configs
      if (!accountId) {
        const widgetConfig = db.select().from(schema.widgetConfigs).where(eq(schema.widgetConfigs.token, token)).get();
        if (widgetConfig) {
          accountId = widgetConfig.accountId;
          allowedAlertTypes = JSON.parse(widgetConfig.alertTypes);
          log.info({ accountId, allowedAlertTypes, widgetName: widgetConfig.name }, 'Custom widget config found');
        }
      }
      
      if (!accountId) {
        return reply.code(401).send({ error: 'Invalid widget token' });
      }
    }
    
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.raw.write(`data: {"type":"connected","accountId":${accountId || 'null'},"filteredTypes":${JSON.stringify(allowedAlertTypes)}}\n\n`);
    
    const handler = (alertAccountId: number, alert: any) => {
      // Only send alerts for this account (or all if no token)
      if (accountId === null || alertAccountId === accountId) {
        // Check if this alert type is allowed by the widget config
        if (allowedAlertTypes !== null && !allowedAlertTypes.includes(alert.type)) {
          log.info({ alertType: alert.type, allowedTypes: allowedAlertTypes }, 'SSE: Alert filtered out by widget config');
          return; // Skip this alert for this widget
        }
        
        log.info({ 
          alertId: alert.id,
          accountId: alertAccountId,
          type: alert.type,
          message: alert.message,
          videoUrl: alert.videoUrl,
          imageUrl: alert.imageUrl,
          sound: alert.sound,
          duration: alert.duration,
        }, 'SSE: Sending alert to overlay');
        reply.raw.write(`event: alert\ndata: ${JSON.stringify(alert)}\n\n`);
      }
    };
    const skipHandler = (alertAccountId: number) => {
      if (accountId === null || alertAccountId === accountId) {
        reply.raw.write(`event: skip\ndata: {}\n\n`);
      }
    };
    
    alertsManager.on('alert_show', handler);
    alertsManager.on('alert_skipped', skipHandler);
    
    const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 30000);
    request.raw.on('close', () => { clearInterval(heartbeat); alertsManager.off('alert_show', handler); alertsManager.off('alert_skipped', skipHandler); });
    await new Promise(() => {});
  });

  // Serve overlay HTML with token validation
  app.get('/alerts/overlay', async (request, reply) => {
    const { token } = request.query as { token?: string };
    
    // Prevent caching of overlay HTML
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
    
    // Read and modify the overlay HTML to include the token
    let html = readFileSync(join(__dirname, '../alerts/overlay.html'), 'utf-8');
    
    // Inject token into the page
    if (token) {
      html = html.replace(
        'const API_URL = window.location.origin;',
        `const API_URL = window.location.origin;\n    const WIDGET_TOKEN = '${token}';`
      );
      html = html.replace(
        'new EventSource(`${API_URL}/api/alerts/stream`)',
        'new EventSource(`${API_URL}/api/alerts/stream?token=${WIDGET_TOKEN}`)'
      );
    }
    
    reply.type('text/html').send(html);
  });

  app.post('/api/alerts/test', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const { type, username, amount } = request.body as { type: string; username?: string; amount?: number };
    const u = username || 'TestUser', a = amount || 1;
    switch (type) {
      case 'follow': alertsManager.triggerFollow(account.id, u); break;
      case 'subscription': alertsManager.triggerSubscription(account.id, u, a); break;
      case 'gifted_sub': alertsManager.triggerGiftedSub(account.id, u, 'GiftGiver', a); break;
      case 'raid': alertsManager.triggerRaid(account.id, u, a); break;
      case 'tip': alertsManager.triggerTip(account.id, u, a); break;
      case 'kick': alertsManager.triggerKick(account.id, u, a); break;
    }
    return { success: true };
  });

  app.post('/api/alerts/skip', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    alertsManager.skipCurrent(account.id);
    return { success: true };
  });

  app.get('/api/alerts/queue', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    return { current: alertsManager.getCurrentAlert(account.id), queue: alertsManager.getQueue(account.id) };
  });

  app.post('/api/alerts/clear-queue', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    alertsManager.clearQueue(account.id);
    return { success: true };
  });

  app.post('/api/alerts/upload', async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No file' });
    
    // More permissive MIME type checking - also check file extension
    const allowedTypes = [
      'image/gif', 'image/png', 'image/jpeg', 'image/webp',
      'video/mp4', 'video/webm', 'video/x-matroska',
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/x-wav'
    ];
    const allowedExtensions = ['.gif', '.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webm', '.mkv', '.mp3', '.wav', '.ogg'];
    
    const ext = '.' + (data.filename.split('.').pop()?.toLowerCase() || '');
    const isAllowedType = allowedTypes.includes(data.mimetype);
    const isAllowedExt = allowedExtensions.includes(ext);
    
    log.info({ filename: data.filename, mimetype: data.mimetype, ext }, 'File upload attempt');
    
    if (!isAllowedType && !isAllowedExt) {
      log.warn({ filename: data.filename, mimetype: data.mimetype, ext }, 'File rejected - invalid type');
      return reply.code(400).send({ error: `Invalid file type: ${data.mimetype} (${ext})` });
    }
    
    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
    await pipeline(data.file, createWriteStream(join(alertsDir, filename)));
    log.info({ filename }, 'File uploaded successfully');
    
    // Build URL - detect if behind HTTPS proxy (Caddy)
    // Check x-forwarded-proto header or NODE_ENV
    const forwardedProto = request.headers['x-forwarded-proto'];
    const isProxied = forwardedProto === 'https' || config.NODE_ENV === 'production';
    const protocol = isProxied ? 'https' : request.protocol;
    const host = isProxied 
      ? request.hostname  // No port - Caddy handles routing
      : `${request.hostname}:${config.PORT}`;
    const mediaUrl = `${protocol}://${host}/alerts/media/${filename}`;
    
    log.info({ mediaUrl, isProxied, forwardedProto }, 'Media URL generated');
    return { success: true, url: mediaUrl, filename };
  });

  // Event Messages API
  app.get('/api/events', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    return db.select().from(schema.eventMessages).where(or(eq(schema.eventMessages.accountId, account.id), isNull(schema.eventMessages.accountId))).all();
  });

  app.patch('/api/events/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const body = request.body as { message?: string; enabled?: boolean };
    const existing = db.select().from(schema.eventMessages).where(and(eq(schema.eventMessages.id, parseInt(id, 10)), or(eq(schema.eventMessages.accountId, account.id), isNull(schema.eventMessages.accountId)))).get();
    if (!existing) return reply.code(404).send({ error: 'Event not found' });
    if (existing.accountId === null) {
      const result = db.insert(schema.eventMessages).values({ accountId: account.id, eventType: existing.eventType, message: body.message ?? existing.message, enabled: body.enabled ?? existing.enabled }).run();
      return db.select().from(schema.eventMessages).where(eq(schema.eventMessages.id, Number(result.lastInsertRowid))).get();
    }
    db.update(schema.eventMessages).set({ message: body.message ?? existing.message, enabled: body.enabled ?? existing.enabled, updatedAt: new Date() }).where(eq(schema.eventMessages.id, parseInt(id, 10))).run();
    return db.select().from(schema.eventMessages).where(eq(schema.eventMessages.id, parseInt(id, 10))).get();
  });

  // Moderation API
  app.get('/api/moderation/settings', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    let settings = db.select().from(schema.moderationSettings).where(eq(schema.moderationSettings.accountId, account.id)).get();
    if (!settings) { db.insert(schema.moderationSettings).values({ accountId: account.id }).run(); settings = db.select().from(schema.moderationSettings).where(eq(schema.moderationSettings.accountId, account.id)).get(); }
    return settings;
  });

  app.patch('/api/moderation/settings', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const body = request.body as any;
    let existing = db.select().from(schema.moderationSettings).where(eq(schema.moderationSettings.accountId, account.id)).get();
    if (!existing) db.insert(schema.moderationSettings).values({ accountId: account.id, ...body }).run();
    else db.update(schema.moderationSettings).set({ ...body, updatedAt: new Date() }).where(eq(schema.moderationSettings.accountId, account.id)).run();
    return db.select().from(schema.moderationSettings).where(eq(schema.moderationSettings.accountId, account.id)).get();
  });

  app.get('/api/moderation/banned-words', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    return db.select().from(schema.bannedWords).where(or(eq(schema.bannedWords.accountId, account.id), isNull(schema.bannedWords.accountId))).all();
  });

  app.post('/api/moderation/banned-words', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const body = request.body as { word: string; isRegex?: boolean; severity?: string; action?: string; timeoutDuration?: number };
    if (!body.word) return reply.code(400).send({ error: 'Word required' });
    const result = db.insert(schema.bannedWords).values({ accountId: account.id, word: body.word, isRegex: body.isRegex || false, severity: (body.severity as any) || 'medium', action: (body.action as any) || 'timeout', timeoutDuration: body.timeoutDuration || 300, enabled: true }).run();
    return db.select().from(schema.bannedWords).where(eq(schema.bannedWords.id, Number(result.lastInsertRowid))).get();
  });

  app.delete('/api/moderation/banned-words/:id', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    db.delete(schema.bannedWords).where(and(eq(schema.bannedWords.id, parseInt(id, 10)), eq(schema.bannedWords.accountId, account.id))).run();
    return { success: true };
  });

  app.get('/api/moderation/logs', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const query = request.query as { limit?: string };
    return db.select().from(schema.modLogs).where(eq(schema.modLogs.accountId, account.id)).orderBy(desc(schema.modLogs.createdAt)).limit(parseInt(query.limit || '50', 10)).all();
  });

  // Discord API
  app.get('/api/discord/status', async () => {
    const ready = isDiscordReady();
    return { connected: ready, inviteUrl: getBotInviteUrl(), guilds: ready ? getBotGuilds() : [] };
  });

  app.get('/api/discord/guilds/:guildId/channels', async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    if (!isDiscordReady()) return reply.code(503).send({ error: 'Discord bot not connected' });
    return { channels: await getGuildChannels(guildId) };
  });

  app.get('/api/discord/guilds/:guildId/roles', async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    if (!isDiscordReady()) return reply.code(503).send({ error: 'Discord bot not connected' });
    return { roles: await getGuildRoles(guildId) };
  });

  app.get('/api/discord/settings', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    let settings = db.select().from(schema.discordSettings).where(eq(schema.discordSettings.accountId, account.id)).get();
    if (!settings) { db.insert(schema.discordSettings).values({ accountId: account.id }).run(); settings = db.select().from(schema.discordSettings).where(eq(schema.discordSettings.accountId, account.id)).get(); }
    return settings;
  });

  app.patch('/api/discord/settings', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const body = request.body as any;
    let existing = db.select().from(schema.discordSettings).where(eq(schema.discordSettings.accountId, account.id)).get();
    if (!existing) db.insert(schema.discordSettings).values({ accountId: account.id, ...body }).run();
    else db.update(schema.discordSettings).set({ ...body, updatedAt: new Date() }).where(eq(schema.discordSettings.accountId, account.id)).run();
    return db.select().from(schema.discordSettings).where(eq(schema.discordSettings.accountId, account.id)).get();
  });

  app.post('/api/discord/test', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    if (!isDiscordReady()) return reply.code(503).send({ error: 'Discord bot not connected' });
    const settings = db.select().from(schema.discordSettings).where(eq(schema.discordSettings.accountId, account.id)).get();
    if (!settings || !settings.guildId || !settings.channelId) return reply.code(400).send({ error: 'Discord not configured' });
    const success = await testDiscordConnection({ guildId: settings.guildId, channelId: settings.channelId });
    if (success) return { success: true, message: 'Test message sent!' };
    return reply.code(500).send({ error: 'Failed to send test message' });
  });

  // Points API
  app.get('/api/points/config', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    let settings = db.select().from(schema.pointsSettings).where(eq(schema.pointsSettings.accountId, account.id)).get();
    if (!settings) { db.insert(schema.pointsSettings).values({ accountId: account.id }).run(); settings = db.select().from(schema.pointsSettings).where(eq(schema.pointsSettings.accountId, account.id)).get(); }
    return settings;
  });

  app.patch('/api/points/config', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const body = request.body as any;
    let existing = db.select().from(schema.pointsSettings).where(eq(schema.pointsSettings.accountId, account.id)).get();
    if (!existing) db.insert(schema.pointsSettings).values({ accountId: account.id, ...body }).run();
    else db.update(schema.pointsSettings).set({ ...body, updatedAt: new Date() }).where(eq(schema.pointsSettings.accountId, account.id)).run();
    return db.select().from(schema.pointsSettings).where(eq(schema.pointsSettings.accountId, account.id)).get();
  });

  app.get('/api/points/leaderboard', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const query = request.query as { limit?: string };
    return db.select().from(schema.channelUsers).where(eq(schema.channelUsers.accountId, account.id)).orderBy(desc(schema.channelUsers.points)).limit(parseInt(query.limit || '10', 10)).all();
  });

  app.get('/api/points/users', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const query = request.query as { limit?: string; offset?: string };
    return db.select().from(schema.channelUsers).where(eq(schema.channelUsers.accountId, account.id)).orderBy(desc(schema.channelUsers.points)).limit(parseInt(query.limit || '100', 10)).offset(parseInt(query.offset || '0', 10)).all();
  });

  // Settings API
  app.get('/api/settings', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const settings = db.select().from(schema.settings).where(eq(schema.settings.accountId, account.id)).all();
    const map: Record<string, unknown> = {};
    for (const s of settings) map[s.key] = s.value;
    return { settings: map };
  });

  app.put('/api/settings/:key', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const { key } = request.params as { key: string };
    const { value } = request.body as { value: unknown };
    const existing = db.select().from(schema.settings).where(and(eq(schema.settings.accountId, account.id), eq(schema.settings.key, key))).get();
    if (existing) db.update(schema.settings).set({ value: JSON.stringify(value) }).where(eq(schema.settings.id, existing.id)).run();
    else db.insert(schema.settings).values({ accountId: account.id, key, value: JSON.stringify(value) }).run();
    return { success: true };
  });

  // ============================================
  // Clips API
  // ============================================

  app.get('/api/clips/settings', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    let settings = db.select().from(schema.clipSettings).where(eq(schema.clipSettings.accountId, account.id)).get();
    if (!settings) {
      // Return defaults if no settings exist
      return {
        id: null,
        enabled: false,
        defaultDuration: 30,
        maxDuration: 120,
        minUserLevel: 'everyone',
        cooldownSeconds: 30,
        discordGuildId: null,
        discordChannelId: null,
      };
    }
    return settings;
  });

  app.patch('/api/clips/settings', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const body = request.body as {
      enabled?: boolean;
      defaultDuration?: number;
      maxDuration?: number;
      minUserLevel?: string;
      cooldownSeconds?: number;
      discordGuildId?: string | null;
      discordChannelId?: string | null;
    };

    let existing = db.select().from(schema.clipSettings).where(eq(schema.clipSettings.accountId, account.id)).get();

    if (existing) {
      db.update(schema.clipSettings)
        .set({
          enabled: body.enabled ?? existing.enabled,
          defaultDuration: body.defaultDuration ?? existing.defaultDuration,
          maxDuration: body.maxDuration ?? existing.maxDuration,
          minUserLevel: body.minUserLevel ?? existing.minUserLevel,
          cooldownSeconds: body.cooldownSeconds ?? existing.cooldownSeconds,
          discordGuildId: body.discordGuildId !== undefined ? body.discordGuildId : existing.discordGuildId,
          discordChannelId: body.discordChannelId !== undefined ? body.discordChannelId : existing.discordChannelId,
          updatedAt: new Date(),
        })
        .where(eq(schema.clipSettings.accountId, account.id))
        .run();
    } else {
      db.insert(schema.clipSettings)
        .values({
          accountId: account.id,
          enabled: body.enabled ?? false,
          defaultDuration: body.defaultDuration ?? 30,
          maxDuration: body.maxDuration ?? 120,
          minUserLevel: body.minUserLevel ?? 'everyone',
          cooldownSeconds: body.cooldownSeconds ?? 30,
          discordGuildId: body.discordGuildId ?? null,
          discordChannelId: body.discordChannelId ?? null,
        })
        .run();
    }

    return db.select().from(schema.clipSettings).where(eq(schema.clipSettings.accountId, account.id)).get();
  });

  app.get('/api/clips', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const query = request.query as { limit?: string };
    const limit = parseInt(query.limit || '50', 10);
    return db.select()
      .from(schema.clips)
      .where(eq(schema.clips.accountId, account.id))
      .orderBy(desc(schema.clips.createdAt))
      .limit(limit)
      .all();
  });

  app.get('/api/clips/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const clip = db.select()
      .from(schema.clips)
      .where(and(eq(schema.clips.id, parseInt(id, 10)), eq(schema.clips.accountId, account.id)))
      .get();
    if (!clip) return reply.code(404).send({ error: 'Clip not found' });
    return clip;
  });

  app.delete('/api/clips/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    
    const clip = db.select()
      .from(schema.clips)
      .where(and(eq(schema.clips.id, parseInt(id, 10)), eq(schema.clips.accountId, account.id)))
      .get();
    
    if (!clip) return reply.code(404).send({ error: 'Clip not found' });
    
    // Delete the file
    const fs = await import('fs').then(m => m.promises);
    try {
      await fs.unlink(clip.filepath);
    } catch (error) {
      log.warn({ error, filepath: clip.filepath }, 'Failed to delete clip file');
    }
    
    // Delete from database
    db.delete(schema.clips).where(eq(schema.clips.id, parseInt(id, 10))).run();
    
    return { success: true };
  });

  // ============================================
  // Statistics API
  // ============================================
  await registerStatisticsRoutes(app);
  app.get('/api/ai/status', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    return {
      enabled: isAIEnabled(account.id),
      configured: !!config.ANTHROPIC_API_KEY,
      config: {
        cooldownSeconds: getAIConfig().cooldownMs / 1000,
        rateLimitPerMinute: getAIConfig().rateLimitPerMinute,
        maxMessageLength: getAIConfig().maxMessageLength,
      },
    };
  });

  app.post('/api/ai/toggle', { preHandler: requireAuth }, async (request, reply) => {
    const { account } = request as AuthenticatedRequest;
    const { enabled } = request.body as { enabled: boolean };
    if (typeof enabled !== 'boolean') {
      return reply.code(400).send({ error: 'enabled must be a boolean' });
    }
    if (!config.ANTHROPIC_API_KEY) {
      return reply.code(400).send({ error: 'ANTHROPIC_API_KEY not configured in .env' });
    }
    setAIEnabled(account.id, enabled);
    return { success: true, enabled };
  });
  // Root
  app.get('/', async (request) => {
    const query = request.query as { auth?: string; bot_auth?: string };
    if (query.auth === 'success') return { message: 'Authentication successful!' };
    if (query.bot_auth === 'success') return { message: 'Bot account authenticated!' };
    return { message: 'KaoticBot API', version: '2.0.0' };
  });

  app.post('/api/test-message', { preHandler: requireAuth }, async (request) => {
    const { account } = request as AuthenticatedRequest;
    const body = request.body as { message?: string };
    if (!account.kickChatroomId) return { success: false, error: 'No chatroom configured' };
    const result = await kickApi.sendMessage(account.kickChatroomId, body.message || 'Test from KaoticBot!');
    return { success: result.success, error: result.error };
  });

  await initializeTracker();

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    log.info({ port: config.PORT }, 'API server started');
    return app;
  } catch (error) {
    log.error({ error }, 'Failed to start API server');
    throw error;
  }
}
