import { config } from './config/index.js';
import { db, schema, initDatabase } from './db/index.js';
import { startServer, setTimerManager, setBotInstance, setConnectionManager } from './api/server.js';
import { connectionManager } from './connections/manager.js';
import { kickApi } from './kick/api.js';
import { commandHandler } from './commands/handler.js';
import { TimerManager } from './timers/manager.js';
import { alertsManager } from './alerts/manager.js';
import { pointsService } from './points/service.js';
import { moderationService, type UserContext, type UserLevel } from './moderation/service.js';
import { eventMessagesService } from './events/service.js';
import { initializeDiscordBot, shutdownDiscordBot } from './discord/service.js';
import { createChildLogger } from './utils/logger.js';
import { eq } from 'drizzle-orm';
import type { KickChatMessage, KickChannel } from '@kaoticbot/shared';

const log = createChildLogger('main');

// Timer managers per account
const timerManagers = new Map<number, TimerManager>();

// Built-in command names (these skip database lookup)
const BUILT_IN_COMMANDS = ['clip', 'points', 'gamble', 'bet', 'give', 'leaderboard', 'top'];

class KaoticBot {
  private isRunning = false;
  
  async start(): Promise<void> {
    log.info('Starting KaoticBot...');
    
    // Initialize database
    await initDatabase();
    
    // Set database on kickApi for legacy token support
    kickApi.setDb(db, schema);
    
    // Initialize Discord bot
    if (config.DISCORD_BOT_TOKEN) {
      log.info('Initializing Discord bot...');
      const discordReady = await initializeDiscordBot();
      if (discordReady) {
        log.info('Discord bot connected');
      } else {
        log.warn('Discord bot failed to connect - notifications will be disabled');
      }
    } else {
      log.info('Discord bot token not configured - Discord integration disabled');
    }
    
    // Start API server
    await startServer();
    
    // Connect bot instance and connection manager to server
    setBotInstance(this);
    setConnectionManager(connectionManager);
    
    // Initialize services
    await pointsService.initialize();
    await moderationService.initialize();
    await eventMessagesService.initialize();
    
    // Reconnect all enabled bots
    await connectionManager.reconnectAll();
    
    // Start timer managers for connected accounts
    this.startTimerManagers();
    
    this.isRunning = true;
    log.info('KaoticBot is now running!');
  }
  
  /**
   * Set up handlers for a specific account connection
   */
  setupAccountHandlers(accountId: number): void {
    const account = db.select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId))
      .get();
    
    if (!account) {
      log.error({ accountId }, 'Account not found');
      return;
    }
    
    // Build channel object from account
    const channel = {
      id: account.kickChannelId!,
      user_id: account.kickUserId,
      slug: account.kickChannelSlug || account.kickUsername,
      chatroom: {
        id: account.kickChatroomId!,
        chatable_type: 'App\\Models\\Channel',
        channel_id: account.kickChannelId!,
        created_at: '',
        updated_at: '',
        chat_mode_old: 'public',
        chat_mode: 'public',
        slow_mode: false,
        followers_mode: false,
        subscribers_mode: false,
        emotes_mode: false,
        message_interval: 6,
        following_min_duration: 0,
      },
      livestream: null,
      verified: true,
      followersCount: 0,
    } as KickChannel;
    
    // Register message handler
    connectionManager.onMessage(accountId, async (message: KickChatMessage) => {
      log.info({ 
        accountId, 
        username: message.sender.username, 
        content: message.content.substring(0, 100),
        isCommand: message.content.startsWith('!')
      }, '📨 Chat message received');
      
      await this.handleMessage(accountId, message, channel);
    });
    
    // Register event handlers
    connectionManager.onEvent(accountId, 'subscription', async (data: any) => {
      log.info({ data }, '🎉 Subscription event');
      const username = data.username || data.subscriber?.username || 'Unknown';
      const months = data.months || 1;
      alertsManager.triggerSubscription(username, months);
      
      const chatMsg = eventMessagesService.getSubscriptionMessage(accountId, username);
      if (chatMsg) {
        await connectionManager.sendMessage(accountId, chatMsg);
      }
    });
    
    connectionManager.onEvent(accountId, 'gifted_subscriptions', async (data: any) => {
      log.info({ data }, '🎁 Gifted subs event');
      const gifter = data.gifter?.username || data.username || 'Unknown';
      const count = data.gifted_usernames?.length || data.count || 1;
      const recipient = data.gifted_usernames?.[0];
      alertsManager.triggerGiftedSub(recipient || 'someone', gifter, count);
      
      const chatMsg = eventMessagesService.getGiftedSubMessage(accountId, gifter, count, recipient);
      if (chatMsg) {
        await connectionManager.sendMessage(accountId, chatMsg);
      }
    });
    
    connectionManager.onEvent(accountId, 'follow', async (data: any) => {
      log.info({ data }, '💚 Follow event');
      const username = data.username || data.follower?.username || 'Unknown';
      alertsManager.triggerFollow(username);
      
      const chatMsg = eventMessagesService.getFollowMessage(accountId, username);
      if (chatMsg) {
        await connectionManager.sendMessage(accountId, chatMsg);
      }
    });
    
    connectionManager.onEvent(accountId, 'kick', async (data: any) => {
      log.info({ data }, '👟 Kick event');
      const username = data.username || data.sender?.username || 'Unknown';
      const count = data.count || data.amount || 1;
      alertsManager.triggerKick(username, count);
      
      const chatMsg = eventMessagesService.getKickMessage(accountId, username, count);
      if (chatMsg) {
        await connectionManager.sendMessage(accountId, chatMsg);
      }
    });
    
    connectionManager.onEvent(accountId, 'raid', async (data: any) => {
      log.info({ data }, '⚔️ Raid event');
      const username = data.username || data.raider?.username || 'Unknown';
      const viewers = data.viewers || data.viewer_count || 1;
      alertsManager.triggerRaid(username, viewers);
      
      const chatMsg = eventMessagesService.getRaidMessage(accountId, username, viewers);
      if (chatMsg) {
        await connectionManager.sendMessage(accountId, chatMsg);
      }
    });
    
    // Create timer manager for this account
    const timerManager = new TimerManager(
      account.kickChatroomId!,
      async (chatroomId: number, content: string) => {
        return await connectionManager.sendMessage(accountId, content);
      }
    );
    timerManagers.set(accountId, timerManager);
    timerManager.start();
    
    log.info({ accountId, channelSlug: account.kickChannelSlug }, 'Account handlers set up');
  }
  
  /**
   * Clean up handlers when account disconnects
   */
  cleanupAccountHandlers(accountId: number): void {
    const timerManager = timerManagers.get(accountId);
    if (timerManager) {
      timerManager.stop();
      timerManagers.delete(accountId);
    }
    
    log.info({ accountId }, 'Account handlers cleaned up');
  }
  
  /**
   * Start timer managers for all connected accounts
   */
  private startTimerManagers(): void {
    const statuses = connectionManager.getAllStatuses();
    
    for (const status of statuses) {
      if (status.status === 'connected') {
        this.setupAccountHandlers(status.accountId);
      }
    }
  }
  
  /**
   * Handle chat message for a specific account
   */
  private async handleMessage(
    accountId: number, 
    message: KickChatMessage, 
    channel: KickChannel
  ): Promise<void> {
    // Track message for timers
    const timerManager = timerManagers.get(accountId);
    if (timerManager) {
      timerManager.onChatMessage();
    }
    
    // Award points for chatting
    try {
      const sender = message.sender as any;
      await pointsService.awardMessagePoints(
        message.sender.id,
        message.sender.username,
        message.sender.username,
        sender.is_subscribed || false
      );
    } catch (err) {
      log.debug({ err }, 'Failed to award message points');
    }
    
    // Run moderation check
    const wasModerated = await this.moderateMessage(accountId, message, channel);
    if (wasModerated) {
      log.info({ username: message.sender.username }, '🛡️ Message was moderated');
      return;
    }
    
    // Track user for $(randomuser)
    commandHandler.trackUser(message.chatroom_id, message.sender.username);
    
    // Check if it's a command
    if (!message.content.startsWith('!')) {
      return;
    }
    
    log.info({ content: message.content }, '⚡ Processing potential command');
    
    // Parse command
    const parsed = message.content.slice(1).trim().split(/\s+/);
    const cmdName = parsed[0]?.toLowerCase();
    const args = parsed.slice(1);
    
    // Send reply helper
    const sendReply = async (content: string) => {
      log.info({ content: content.substring(0, 100) }, '📤 Sending reply...');
      const result = await connectionManager.sendMessage(accountId, content);
      if (!result.success) {
        log.error({ error: result.error }, '❌ Failed to send message');
      } else {
        log.info('✅ Message sent successfully');
      }
    };
    
    // Check for built-in commands first
    if (BUILT_IN_COMMANDS.includes(cmdName)) {
      log.info({ command: cmdName }, '🔧 Processing built-in command');
      const handled = await this.handleBuiltInCommand(
        cmdName,
        args,
        message,
        channel,
        accountId,
        sendReply
      );
      if (handled) return;
    }
    
    // Check if it's a custom command
    if (!commandHandler.isCommand(message.content)) {
      log.info({ content: message.content }, '❌ Not a registered command');
      return;
    }
    
    log.info({ content: message.content, username: message.sender.username }, '✅ Valid command, processing...');
    
    // Process custom command
    await commandHandler.processCommand(message, channel, sendReply, accountId);
  }
  
  /**
   * Handle built-in commands
   */
  private async handleBuiltInCommand(
    cmdName: string,
    args: string[],
    message: KickChatMessage,
    channel: KickChannel,
    accountId: number,
    sendReply: (content: string) => Promise<void>
  ): Promise<boolean> {
    const username = message.sender.username;
    const userId = message.sender.id;
    
    switch (cmdName) {
      case 'clip':
        // Delegate to command handler's clip implementation
        return await commandHandler.processCommand(message, channel, sendReply, accountId);
      
      case 'points': {
        const stats = await pointsService.getUserStats(userId);
        if (stats) {
          await sendReply(`@${username} You have ${stats.points.toLocaleString()} points! (Rank #${stats.rank})`);
        } else {
          await sendReply(`@${username} You have 0 points! Chat more to earn points.`);
        }
        return true;
      }
      
      case 'gamble':
      case 'bet': {
        if (args.length < 1) {
          await sendReply(`@${username} Usage: !gamble <amount|all>`);
          return true;
        }
        
        const currentPoints = await pointsService.getPoints(userId);
        let amount: number;
        
        if (args[0].toLowerCase() === 'all') {
          amount = currentPoints;
        } else {
          amount = parseInt(args[0], 10);
        }
        
        if (isNaN(amount) || amount <= 0) {
          await sendReply(`@${username} Please enter a valid amount!`);
          return true;
        }
        
        if (currentPoints < amount) {
          await sendReply(`@${username} You don't have enough points! (${currentPoints.toLocaleString()})`);
          return true;
        }
        
        try {
          const result = await pointsService.gamble(userId, amount);
          if (result.won) {
            await sendReply(`🎰 @${username} WON ${amount.toLocaleString()} points! New balance: ${result.newTotal.toLocaleString()}`);
          } else {
            await sendReply(`🎰 @${username} LOST ${amount.toLocaleString()} points... Balance: ${result.newTotal.toLocaleString()}`);
          }
        } catch (err) {
          await sendReply(`@${username} Error: ${(err as Error).message}`);
        }
        return true;
      }
      
      case 'give': {
        if (args.length < 2) {
          await sendReply(`@${username} Usage: !give <user> <amount>`);
          return true;
        }
        
        const targetName = args[0].replace('@', '').toLowerCase();
        const amount = parseInt(args[1], 10);
        
        if (isNaN(amount) || amount <= 0) {
          await sendReply(`@${username} Please enter a valid amount!`);
          return true;
        }
        
        const senderPoints = await pointsService.getPoints(userId);
        if (senderPoints < amount) {
          await sendReply(`@${username} You don't have enough points! (${senderPoints.toLocaleString()})`);
          return true;
        }
        
        // Find target user in database
        const targetUsers = db.select()
          .from(schema.users)
          .where(eq(schema.users.username, targetName))
          .all();
        
        if (targetUsers.length === 0) {
          await sendReply(`@${username} User "${targetName}" not found!`);
          return true;
        }
        
        const targetUser = targetUsers[0];
        
        if (targetUser.id === userId) {
          await sendReply(`@${username} You can't give points to yourself!`);
          return true;
        }
        
        const success = await pointsService.transferPoints(userId, targetUser.id, amount);
        if (success) {
          await sendReply(`@${username} gave ${amount.toLocaleString()} points to @${targetUser.username}!`);
        } else {
          await sendReply(`@${username} Transfer failed!`);
        }
        return true;
      }
      
      case 'leaderboard':
      case 'top': {
        const leaderboard = await pointsService.getLeaderboard(5);
        if (leaderboard.length === 0) {
          await sendReply('No one has any points yet!');
          return true;
        }
        
        const entries = leaderboard.map((u, i) => 
          `#${i + 1} ${u.username}: ${u.points.toLocaleString()}`
        ).join(' | ');
        
        await sendReply(`🏆 Top 5: ${entries}`);
        return true;
      }
      
      default:
        return false;
    }
  }
  
  /**
   * Get user level from badges
   */
  private getUserLevel(sender: KickChatMessage['sender'], channel: KickChannel): UserLevel {
    const badges = sender.identity?.badges || [];
    
    if (sender.id === channel.user_id) {
      return 'broadcaster';
    }
    
    for (const badge of badges) {
      const badgeType = badge.type.toLowerCase();
      if (badgeType === 'moderator' || badgeType === 'mod') return 'moderator';
      if (badgeType === 'vip') return 'vip';
      if (badgeType === 'subscriber' || badgeType === 'sub_gifter') return 'subscriber';
      if (badgeType === 'follower') return 'follower';
    }
    
    if ((sender as any).is_subscribed) return 'subscriber';
    
    return 'everyone';
  }
  
  /**
   * Build user context for moderation
   */
  private buildUserContext(sender: KickChatMessage['sender'], channel: KickChannel): UserContext {
    const level = this.getUserLevel(sender, channel);
    const isBroadcaster = sender.id === channel.user_id;
    
    return {
      id: sender.id,
      username: sender.username,
      level,
      isBroadcaster,
      isModerator: level === 'moderator' || isBroadcaster,
      isVip: level === 'vip',
      isSubscriber: level === 'subscriber' || !!(sender as any).is_subscribed,
      isFollower: level === 'follower',
    };
  }
  
  /**
   * Moderation check
   */
  private async moderateMessage(
    accountId: number,
    message: KickChatMessage, 
    channel: KickChannel
  ): Promise<boolean> {
    try {
      const userContext = this.buildUserContext(message.sender, channel);
      const result = await moderationService.checkMessage(accountId, message.content, userContext);
      
      if (!result.shouldAct || result.action === 'none') {
        return false;
      }
      
      log.info({
        user: message.sender.username,
        action: result.action,
        reason: result.reason,
        filter: result.filterType,
      }, 'Moderation triggered');
      
      // Get account tokens
      const account = db.select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, accountId))
        .get();
      
      if (!account) return false;
      
      try {
        switch (result.action) {
          case 'delete':
            await kickApi.deleteMessage(message.id, account.accessToken);
            break;
            
          case 'timeout':
            await kickApi.deleteMessage(message.id, account.accessToken);
            await kickApi.timeoutUser(
              message.sender.id, 
              result.duration || 60, 
              result.reason,
              account.accessToken
            );
            break;
            
          case 'ban':
            await kickApi.deleteMessage(message.id, account.accessToken);
            await kickApi.banUser(message.sender.id, result.reason, account.accessToken);
            break;
        }
        
        // Log the action
        moderationService.logAction(accountId, {
          targetUserId: message.sender.id,
          targetUsername: message.sender.username,
          action: result.action,
          reason: result.reason,
          duration: result.duration,
          messageContent: message.content,
          messageId: message.id,
          filterType: result.filterType || undefined,
        });
        
      } catch (err) {
        log.error({ err, action: result.action }, 'Failed to execute moderation action');
      }
      
      return true;
      
    } catch (err) {
      log.error({ err }, 'Error in moderation check');
      return false;
    }
  }
  
  async stop(): Promise<void> {
    log.info('Stopping KaoticBot...');
    
    // Stop all timer managers
    for (const [accountId, manager] of timerManagers) {
      manager.stop();
    }
    timerManagers.clear();
    
    // Shutdown connection manager
    await connectionManager.shutdown();
    
    // Shutdown Discord bot
    await shutdownDiscordBot();
    
    pointsService.stop();
    
    this.isRunning = false;
    log.info('KaoticBot stopped');
  }
}

// Main entry point
const bot = new KaoticBot();

bot.start().catch((err) => {
  log.error({ error: err }, 'Failed to start bot');
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await bot.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await bot.stop();
  process.exit(0);
});

export { bot };
