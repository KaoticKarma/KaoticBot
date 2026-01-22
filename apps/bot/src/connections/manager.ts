import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { KickChatClient } from '../chat/client.js';
import { kickApi } from '../kick/api.js';
import { createChildLogger } from '../utils/logger.js';
import { getAccountWithValidTokens, refreshBotToken } from '../auth/oauth.js';
import type { Account, BotConfig } from '../db/schema.js';

const log = createChildLogger('connection-manager');

export interface ChannelConnection {
  accountId: number;
  chatroomId: number;
  channelId: number;
  broadcasterUserId: number; // The channel owner's user ID - used for sending messages
  channelSlug: string;
  client: KickChatClient;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastError?: string;
  connectedAt?: Date;
  messageCount: number;
  reconnectAttempts: number;
}

export interface ConnectionStatus {
  accountId: number;
  channelSlug: string;
  status: string;
  connectedAt?: Date;
  messageCount: number;
  lastError?: string;
}

class ConnectionManager {
  private connections: Map<number, ChannelConnection> = new Map();
  private messageHandlers: Map<number, (message: any) => Promise<void>> = new Map();
  private eventHandlers: Map<number, Map<string, (data: any) => Promise<void>>> = new Map();
  private reconnectTimeouts: Map<number, NodeJS.Timeout> = new Map();
  
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY_BASE = 5000; // 5 seconds base delay
  
  /**
   * Check if bot is configured (has credentials in bot_config table)
   */
  isBotConfigured(): boolean {
    const config = this.getBotConfig();
    return config !== null;
  }
  
  /**
   * Get bot configuration from database
   */
  private getBotConfig(): BotConfig | null {
    return db.select().from(schema.botConfig).get() || null;
  }
  
  /**
   * Get bot token, refreshing if needed
   */
  private async getBotToken(): Promise<string | null> {
    const config = this.getBotConfig();
    if (!config) {
      log.error('No bot configuration found');
      return null;
    }
    
    // Check if token is expiring within 5 minutes
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    
    if (config.tokenExpiresAt <= fiveMinutesFromNow) {
      log.info('Bot token expiring soon, refreshing...');
      const refreshed = await refreshBotToken();
      
      if (!refreshed) {
        log.error('Failed to refresh bot token');
        return null;
      }
      
      // Get updated config
      const updatedConfig = this.getBotConfig();
      return updatedConfig?.accessToken || null;
    }
    
    return config.accessToken;
  }
  
  /**
   * Connect a channel for an account
   */
  async connectChannel(accountId: number): Promise<boolean> {
    // Check if bot is configured
    if (!this.isBotConfigured()) {
      log.error({ accountId }, 'Cannot connect - bot account not configured');
      return false;
    }
    
    // Check if already connected
    const existing = this.connections.get(accountId);
    if (existing && existing.status === 'connected') {
      log.info({ accountId }, 'Channel already connected');
      return true;
    }
    
    // Get account with valid tokens
    const account = await getAccountWithValidTokens(accountId);
    if (!account) {
      log.error({ accountId }, 'Failed to get account with valid tokens');
      return false;
    }
    
    if (!account.kickChatroomId || !account.kickChannelId) {
      log.error({ accountId }, 'Account missing channel/chatroom ID');
      return false;
    }
    
    try {
      log.info({ 
        accountId, 
        channelSlug: account.kickChannelSlug,
        chatroomId: account.kickChatroomId,
        channelId: account.kickChannelId,
        kickUserId: account.kickUserId
      }, 'Connecting channel...');
      
      // Create chat client
      const client = new KickChatClient(
        account.kickChatroomId,
        account.kickChannelId
      );
      
      // Create connection record
      // broadcasterUserId is the account's kickUserId - this is who we send messages "to"
      const connection: ChannelConnection = {
        accountId,
        chatroomId: account.kickChatroomId,
        channelId: account.kickChannelId,
        broadcasterUserId: account.kickUserId, // This is the target for sending messages
        channelSlug: account.kickChannelSlug || account.kickUsername,
        client,
        status: 'connecting',
        messageCount: 0,
        reconnectAttempts: 0,
      };
      
      // Set up event handlers
      this.setupEventHandlers(connection, account);
      
      // Store connection
      this.connections.set(accountId, connection);
      
      // Connect
      await client.connect();
      
      // Update status
      connection.status = 'connected';
      connection.connectedAt = new Date();
      connection.reconnectAttempts = 0;
      
      // Update database
      db.update(schema.accounts)
        .set({ botEnabled: true, updatedAt: new Date() })
        .where(eq(schema.accounts.id, accountId))
        .run();
      
      log.info({ accountId, channelSlug: connection.channelSlug }, 'Channel connected');
      
      return true;
      
    } catch (error) {
      log.error({ error, accountId }, 'Failed to connect channel');
      
      const conn = this.connections.get(accountId);
      if (conn) {
        conn.status = 'error';
        conn.lastError = String(error);
      }
      
      return false;
    }
  }
  
  /**
   * Disconnect a channel
   */
  async disconnectChannel(accountId: number): Promise<void> {
    const connection = this.connections.get(accountId);
    
    // Clear any pending reconnect
    const timeout = this.reconnectTimeouts.get(accountId);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(accountId);
    }
    
    if (connection) {
      log.info({ accountId, channelSlug: connection.channelSlug }, 'Disconnecting channel...');
      
      try {
        connection.client.disconnect();
      } catch (error) {
        log.warn({ error, accountId }, 'Error during disconnect');
      }
      
      connection.status = 'disconnected';
      this.connections.delete(accountId);
      
      // Clear handlers
      this.messageHandlers.delete(accountId);
      this.eventHandlers.delete(accountId);
    }
    
    // Update database
    db.update(schema.accounts)
      .set({ botEnabled: false, updatedAt: new Date() })
      .where(eq(schema.accounts.id, accountId))
      .run();
    
    log.info({ accountId }, 'Channel disconnected');
  }
  
  /**
   * Get connection for an account
   */
  getConnection(accountId: number): ChannelConnection | undefined {
    return this.connections.get(accountId);
  }
  
  /**
   * Get status for an account
   */
  getStatus(accountId: number): ConnectionStatus | null {
    const conn = this.connections.get(accountId);
    if (!conn) return null;
    
    return {
      accountId: conn.accountId,
      channelSlug: conn.channelSlug,
      status: conn.status,
      connectedAt: conn.connectedAt,
      messageCount: conn.messageCount,
      lastError: conn.lastError,
    };
  }
  
  /**
   * Get all connection statuses
   */
  getAllStatuses(): ConnectionStatus[] {
    return Array.from(this.connections.values()).map(conn => ({
      accountId: conn.accountId,
      channelSlug: conn.channelSlug,
      status: conn.status,
      connectedAt: conn.connectedAt,
      messageCount: conn.messageCount,
      lastError: conn.lastError,
    }));
  }
  
  /**
   * Register a message handler for an account
   */
  onMessage(accountId: number, handler: (message: any) => Promise<void>): void {
    this.messageHandlers.set(accountId, handler);
  }
  
  /**
   * Register an event handler for an account
   */
  onEvent(accountId: number, event: string, handler: (data: any) => Promise<void>): void {
    if (!this.eventHandlers.has(accountId)) {
      this.eventHandlers.set(accountId, new Map());
    }
    this.eventHandlers.get(accountId)!.set(event, handler);
  }
  
  /**
   * Reconnect all enabled bots on startup
   */
  async reconnectAll(): Promise<void> {
    log.info('Reconnecting all enabled bots...');
    
    // Check if bot is configured first
    if (!this.isBotConfigured()) {
      log.warn('Bot account not configured - skipping reconnection. Visit /auth/bot/login to authenticate.');
      return;
    }
    
    // SQLite stores booleans as integers (0/1)
    const enabledAccounts = db.select()
      .from(schema.accounts)
      .where(eq(schema.accounts.botEnabled, 1 as any))
      .all();
    
    log.info({ count: enabledAccounts.length }, 'Found enabled accounts');
    
    for (const account of enabledAccounts) {
      try {
        await this.connectChannel(account.id);
        // Small delay between connections to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        log.error({ error, accountId: account.id }, 'Failed to reconnect account');
      }
    }
    
    log.info('Reconnection complete');
  }
  
  /**
   * Send a message to a channel using the BOT account token
   * This is the key difference - we use the bot's token, not the user's token
   */
  async sendMessage(accountId: number, content: string): Promise<{ success: boolean; error?: string }> {
    const connection = this.connections.get(accountId);
    
    if (!connection || connection.status !== 'connected') {
      return { success: false, error: 'Not connected' };
    }
    
    try {
      // Get the BOT token (not the user's token)
      const botToken = await this.getBotToken();
      if (!botToken) {
        return { success: false, error: 'Bot account not configured or token invalid' };
      }
      
      // Send message using bot token to the broadcaster's channel
      // The broadcasterUserId is the channel owner we're sending messages to
      const result = await kickApi.sendMessageWithToken(
        connection.broadcasterUserId, // Target channel (the streamer's user ID)
        content,
        botToken // Bot's token, not user's token
      );
      
      if (result.success) {
        log.debug({ 
          accountId, 
          channelSlug: connection.channelSlug,
          messageLength: content.length 
        }, 'Message sent successfully');
      } else {
        log.warn({
          accountId,
          channelSlug: connection.channelSlug,
          error: result.error
        }, 'Failed to send message');
      }
      
      return result;
      
    } catch (error) {
      log.error({ error, accountId }, 'Failed to send message');
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * Set up event handlers for a connection
   */
  private setupEventHandlers(connection: ChannelConnection, account: Account): void {
    const { client, accountId } = connection;
    
    client.on('connected', () => {
      log.info({ accountId, channelSlug: connection.channelSlug }, 'WebSocket connected');
      connection.status = 'connected';
      connection.connectedAt = new Date();
      connection.reconnectAttempts = 0;
    });
    
    client.on('disconnected', (reason: string) => {
      log.warn({ accountId, channelSlug: connection.channelSlug, reason }, 'WebSocket disconnected');
      connection.status = 'disconnected';
      
      // Attempt reconnection if not manually disconnected
      this.scheduleReconnect(accountId);
    });
    
    client.on('error', (error: any) => {
      log.error({ error, accountId }, 'WebSocket error');
      connection.status = 'error';
      connection.lastError = String(error);
    });
    
    client.on('message', async (message: any) => {
      connection.messageCount++;
      
      // Call registered handler
      const handler = this.messageHandlers.get(accountId);
      if (handler) {
        try {
          await handler(message);
        } catch (error) {
          log.error({ error, accountId }, 'Message handler error');
        }
      }
    });
    
    // Forward other events
    const events = ['subscription', 'gifted_subscriptions', 'follow', 'kick', 'raid', 'stream_start', 'stream_end'];
    
    for (const event of events) {
      client.on(event, async (data: any) => {
        const handlers = this.eventHandlers.get(accountId);
        const handler = handlers?.get(event);
        
        if (handler) {
          try {
            await handler(data);
          } catch (error) {
            log.error({ error, accountId, event }, 'Event handler error');
          }
        }
      });
    }
  }
  
  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(accountId: number): void {
    const connection = this.connections.get(accountId);
    if (!connection) return;
    
    // Check if we should attempt reconnection
    if (connection.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      log.error({ accountId }, 'Max reconnection attempts reached');
      connection.status = 'error';
      connection.lastError = 'Max reconnection attempts reached';
      return;
    }
    
    // Clear existing timeout
    const existingTimeout = this.reconnectTimeouts.get(accountId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Calculate delay with exponential backoff
    const delay = this.RECONNECT_DELAY_BASE * Math.pow(2, connection.reconnectAttempts);
    connection.reconnectAttempts++;
    
    log.info({ 
      accountId, 
      attempt: connection.reconnectAttempts,
      delayMs: delay 
    }, 'Scheduling reconnection');
    
    const timeout = setTimeout(async () => {
      this.reconnectTimeouts.delete(accountId);
      
      try {
        log.info({ accountId }, 'Attempting reconnection...');
        
        // Disconnect old client
        try {
          connection.client.disconnect();
        } catch (e) {
          // Ignore
        }
        
        // Remove from connections so connectChannel creates fresh
        this.connections.delete(accountId);
        
        // Reconnect
        await this.connectChannel(accountId);
        
      } catch (error) {
        log.error({ error, accountId }, 'Reconnection failed');
        this.scheduleReconnect(accountId);
      }
    }, delay);
    
    this.reconnectTimeouts.set(accountId, timeout);
  }
  
  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    log.info('Shutting down connection manager...');
    
    // Clear all reconnect timeouts
    for (const timeout of this.reconnectTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.reconnectTimeouts.clear();
    
    // Disconnect all channels (but keep botEnabled in DB)
    for (const [accountId, connection] of this.connections) {
      try {
        connection.client.disconnect();
      } catch (error) {
        log.warn({ error, accountId }, 'Error during shutdown disconnect');
      }
    }
    
    this.connections.clear();
    this.messageHandlers.clear();
    this.eventHandlers.clear();
    
    log.info('Connection manager shutdown complete');
  }
}

// Export singleton instance
export const connectionManager = new ConnectionManager();
