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
import { onStreamLive, onStreamOffline, onChatMessage, onNewFollower, onNewSub, onGiftedSub } from './stats/tracker.js';
import { createChildLogger } from './utils/logger.js';
import { eq } from 'drizzle-orm';
import type { KickChatMessage, KickChannel } from '@kaoticbot/shared';

const log = createChildLogger('main');

const timerManagers = new Map<number, TimerManager>();

class KaoticBot {
  private isRunning = false;
  
  async start(): Promise<void> {
    log.info('Starting KaoticBot...');
    
    await initDatabase();
    kickApi.setDb(db, schema);
    
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
    
    await startServer();
    setBotInstance(this);
    setConnectionManager(connectionManager);
    
    await moderationService.initialize();
    await eventMessagesService.initialize();
    await connectionManager.reconnectAll();
    this.startTimerManagers();
    
    this.isRunning = true;
    log.info('KaoticBot is now running!');
  }
  
  setupAccountHandlers(accountId: number): void {
    const account = db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).get();
    
    if (!account) {
      log.error({ accountId }, 'Account not found');
      return;
    }
    
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
    
    connectionManager.onMessage(accountId, async (message: KickChatMessage) => {
      log.info({ accountId, username: message.sender.username, content: message.content.substring(0, 100), isCommand: message.content.startsWith('!') }, '📨 Chat message received');
      await this.handleMessage(accountId, message, channel);
    });
    
    connectionManager.onEvent(accountId, 'subscription', async (data: any) => {
      log.info({ data, accountId }, '🎉 Subscription event');
      const username = data.username || data.subscriber?.username || 'Unknown';
      const months = data.months || 1;
      alertsManager.triggerSubscription(accountId, username, months);
      onNewSub(accountId);
      
      const chatMsg = eventMessagesService.getSubscriptionMessage(accountId, username);
      if (chatMsg) await connectionManager.sendMessage(accountId, chatMsg);
    });
    
    connectionManager.onEvent(accountId, 'gifted_subscriptions', async (data: any) => {
      log.info({ data, accountId }, '🎁 Gifted subs event');
      const gifter = data.gifter?.username || data.username || 'Unknown';
      const count = data.gifted_usernames?.length || data.count || 1;
      const recipient = data.gifted_usernames?.[0];
      alertsManager.triggerGiftedSub(accountId, recipient || 'someone', gifter, count);
      onGiftedSub(accountId, count);
      
      const chatMsg = eventMessagesService.getGiftedSubMessage(accountId, gifter, count, recipient);
      if (chatMsg) await connectionManager.sendMessage(accountId, chatMsg);
    });
    
    connectionManager.onEvent(accountId, 'follow', async (data: any) => {
      log.info({ data, accountId }, '💚 Follow event');
      const username = data.username || data.follower?.username || 'Unknown';
      const oderId = data.user_id || data.follower?.id || 0;
      alertsManager.triggerFollow(accountId, username);
      onNewFollower(accountId, username, oderId);
      
      const chatMsg = eventMessagesService.getFollowMessage(accountId, username);
      if (chatMsg) await connectionManager.sendMessage(accountId, chatMsg);
    });
    
    connectionManager.onEvent(accountId, 'kick', async (data: any) => {
      log.info({ data, accountId }, '👟 Kick event');
      const username = data.username || data.sender?.username || 'Unknown';
      const count = data.count || data.amount || 1;
      alertsManager.triggerKick(accountId, username, count);
      
      const chatMsg = eventMessagesService.getKickMessage(accountId, username, count);
      if (chatMsg) await connectionManager.sendMessage(accountId, chatMsg);
    });
    
    connectionManager.onEvent(accountId, 'raid', async (data: any) => {
      log.info({ data, accountId }, '⚔️ Raid event');
      const username = data.username || data.raider?.username || 'Unknown';
      const viewers = data.viewers || data.viewer_count || 1;
      alertsManager.triggerRaid(accountId, username, viewers);
      
      const chatMsg = eventMessagesService.getRaidMessage(accountId, username, viewers);
      if (chatMsg) await connectionManager.sendMessage(accountId, chatMsg);
    });
    
    connectionManager.onEvent(accountId, 'stream_start', async (data: any) => {
      log.info({ data, accountId }, '🔴 Stream started');
      await onStreamLive(accountId, {
        title: data.title || data.livestream?.session_title || 'Live Stream',
        category: data.category?.name || data.livestream?.categories?.[0]?.name || 'Just Chatting',
        viewerCount: data.viewer_count || 0,
        streamId: data.id || data.livestream?.id?.toString(),
        thumbnailUrl: data.thumbnail?.url,
      });
    });
    
    connectionManager.onEvent(accountId, 'stream_end', async (data: any) => {
      log.info({ data, accountId }, '⚫ Stream ended');
      await onStreamOffline(accountId);
    });
    
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
  
  cleanupAccountHandlers(accountId: number): void {
    const timerManager = timerManagers.get(accountId);
    if (timerManager) {
      timerManager.stop();
      timerManagers.delete(accountId);
    }
    log.info({ accountId }, 'Account handlers cleaned up');
  }
  
  private startTimerManagers(): void {
    const statuses = connectionManager.getAllStatuses();
    for (const status of statuses) {
      if (status.status === 'connected') {
        this.setupAccountHandlers(status.accountId);
      }
    }
  }
  
  private async handleMessage(accountId: number, message: KickChatMessage, channel: KickChannel): Promise<void> {
    const timerManager = timerManagers.get(accountId);
    if (timerManager) timerManager.onChatMessage();
    
    onChatMessage(accountId, message.sender.id.toString(), message.sender.username);
    
    try {
      const sender = message.sender as any;
      await pointsService.awardMessagePoints(message.sender.id, message.sender.username, message.sender.username, sender.is_subscribed || false);
    } catch (err) {
      log.debug({ err }, 'Failed to award message points');
    }
    
    const wasModerated = await this.moderateMessage(accountId, message, channel);
    if (wasModerated) {
      log.info({ username: message.sender.username }, '🛡️ Message was moderated');
      return;
    }
    
    commandHandler.trackUser(message.chatroom_id, message.sender.username);
    
    if (!message.content.startsWith('!')) return;
    
    log.info({ content: message.content }, '⚡ Processing potential command');
    
    const parsed = message.content.slice(1).trim().split(/\s+/);
    const cmdName = parsed[0]?.toLowerCase();
    const isBuiltIn = ['clip'].includes(cmdName);
    
    if (!isBuiltIn && !commandHandler.isCommand(message.content)) {
      log.info({ content: message.content }, '❌ Not a registered command');
      return;
    }
    
    log.info({ content: message.content, username: message.sender.username }, '✅ Valid command, processing...');
    
    const sendReply = async (content: string) => {
      log.info({ content: content.substring(0, 100) }, '📤 Sending reply...');
      const result = await connectionManager.sendMessage(accountId, content);
      if (!result.success) {
        log.error({ error: result.error }, '❌ Failed to send message');
      } else {
        log.info('✅ Message sent successfully');
      }
    };
    
    await commandHandler.processCommand(message, channel, sendReply, accountId);
  }
  
  private getUserLevel(sender: KickChatMessage['sender'], channel: KickChannel): UserLevel {
    const badges = sender.identity?.badges || [];
    
    if (sender.id === channel.user_id) return 'broadcaster';
    
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
  
  private async moderateMessage(accountId: number, message: KickChatMessage, channel: KickChannel): Promise<boolean> {
    try {
      const userContext = this.buildUserContext(message.sender, channel);
      const result = await moderationService.checkMessage(accountId, message.content, userContext);
      
      if (!result.shouldAct || result.action === 'none') return false;
      
      log.info({ user: message.sender.username, action: result.action, reason: result.reason, filter: result.filterType }, 'Moderation triggered');
      
      const account = db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId)).get();
      if (!account) return false;
      
      try {
        switch (result.action) {
          case 'delete':
            await kickApi.deleteMessage(message.id, account.accessToken);
            break;
          case 'timeout':
            await kickApi.deleteMessage(message.id, account.accessToken);
            await kickApi.timeoutUser(message.sender.id, result.duration || 60, result.reason, account.accessToken);
            break;
          case 'ban':
            await kickApi.deleteMessage(message.id, account.accessToken);
            await kickApi.banUser(message.sender.id, result.reason, account.accessToken);
            break;
        }
        
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
    
    for (const [accountId, manager] of timerManagers) {
      manager.stop();
    }
    timerManagers.clear();
    
    await connectionManager.shutdown();
    await shutdownDiscordBot();
    pointsService.stop();
    
    this.isRunning = false;
    log.info('KaoticBot stopped');
  }
}

const bot = new KaoticBot();

bot.start().catch((err) => {
  log.error({ error: err }, 'Failed to start bot');
  process.exit(1);
});

process.on('SIGINT', async () => {
  await bot.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await bot.stop();
  process.exit(0);
});

export { bot };
