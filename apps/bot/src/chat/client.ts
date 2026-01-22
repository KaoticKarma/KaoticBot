import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { KickChatMessage, KickChannel } from '@kaoticbot/shared';
import { createChildLogger } from '../utils/logger.js';
import { KICK_API } from '../config/index.js';

const log = createChildLogger('chat');

interface PusherMessage {
  event: string;
  data: string;
  channel?: string;
}

interface ChatMessageData {
  id: string;
  chatroom_id: number;
  content: string;
  type: string;
  created_at: string;
  sender: {
    id: number;
    username: string;
    slug: string;
    identity: {
      color: string;
      badges: Array<{ type: string; text: string; count?: number }>;
    };
  };
}

export interface ChatEvents {
  connected: () => void;
  disconnected: (reason: string) => void;
  error: (error: Error) => void;
  message: (message: KickChatMessage) => void;
  subscription_succeeded: (channel: string) => void;
  stream_start: (data: unknown) => void;
  stream_end: (data: unknown) => void;
  gifted_subscriptions: (data: unknown) => void;
  subscription: (data: unknown) => void;
  follow: (data: unknown) => void;
  kick: (data: unknown) => void;
}

export class KickChatClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private chatroomId: number;
  private channelId: number;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnected = false;
  private subscribedChannels: Set<string> = new Set();
  
  constructor(chatroomId: number, channelId: number) {
    super();
    this.chatroomId = chatroomId;
    this.channelId = channelId;
  }
  
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `wss://ws-us2.pusher.com/app/${KICK_API.PUSHER_KEY}?protocol=7&client=js&version=7.6.0&flash=false`;
      
      log.info({ wsUrl, chatroomId: this.chatroomId }, 'Connecting to Kick chat...');
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.on('open', () => {
        log.info('WebSocket connection opened');
      });
      
      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message: PusherMessage = JSON.parse(data.toString());
          this.handlePusherMessage(message, resolve);
        } catch (error) {
          log.error({ error, data: data.toString() }, 'Failed to parse WebSocket message');
        }
      });
      
      this.ws.on('error', (error) => {
        log.error({ error }, 'WebSocket error');
        this.emit('error', error);
        if (!this.isConnected) {
          reject(error);
        }
      });
      
      this.ws.on('close', (code, reason) => {
        log.warn({ code, reason: reason.toString() }, 'WebSocket closed');
        this.isConnected = false;
        this.stopPing();
        this.emit('disconnected', reason.toString());
        this.attemptReconnect();
      });
    });
  }
  
  private handlePusherMessage(message: PusherMessage, resolveConnect?: (value: void) => void): void {
    // Log ALL events at INFO level for debugging
    if (!message.event.includes('pong') && !message.event.includes('ping')) {
      log.info({ event: message.event, channel: message.channel }, '📥 Pusher event received');
    }
    
    switch (message.event) {
      case 'pusher:connection_established': {
        const data = JSON.parse(message.data);
        log.info({ socketId: data.socket_id }, 'Pusher connection established');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startPing();
        this.subscribeToChannels();
        this.emit('connected');
        resolveConnect?.();
        break;
      }
      
      case 'pusher_internal:subscription_succeeded': {
        log.info({ channel: message.channel }, 'Subscription succeeded');
        if (message.channel) {
          this.subscribedChannels.add(message.channel);
        }
        this.emit('subscription_succeeded', message.channel);
        break;
      }
      
      case 'pusher:pong': {
        // Silent - too noisy
        break;
      }
      
      case 'pusher:error': {
        const errorData = JSON.parse(message.data);
        log.error({ error: errorData }, 'Pusher error');
        this.emit('error', new Error(errorData.message || 'Pusher error'));
        break;
      }
      
      case 'App\\Events\\ChatMessageEvent': {
        log.info('💬 ChatMessageEvent received!');
        this.handleChatMessage(message);
        break;
      }
      
      case 'App\\Events\\StreamerIsLive': {
        const data = JSON.parse(message.data);
        log.info({ data }, 'Stream started');
        this.emit('stream_start', data);
        break;
      }
      
      case 'App\\Events\\StopStreamBroadcast': {
        const data = JSON.parse(message.data);
        log.info({ data }, 'Stream ended');
        this.emit('stream_end', data);
        break;
      }
      
      case 'App\\Events\\GiftedSubscriptionsEvent': {
        const data = JSON.parse(message.data);
        log.info({ data }, 'Gifted subscriptions');
        this.emit('gifted_subscriptions', data);
        break;
      }
      
      case 'App\\Events\\SubscriptionEvent': {
        const data = JSON.parse(message.data);
        log.info({ data }, 'New subscription');
        this.emit('subscription', data);
        break;
      }
      
      case 'App\\Events\\FollowersUpdated': {
        const data = JSON.parse(message.data);
        log.info({ data }, 'New follower');
        this.emit('follow', data);
        break;
      }
      
      // Kick events - may be named differently, logging for discovery
      case 'App\\Events\\KickEvent':
      case 'App\\Events\\UserKicked': {
        const data = JSON.parse(message.data);
        log.info({ data }, 'Kick event');
        this.emit('kick', data);
        break;
      }
      
      default: {
        // Log unknown events so we can see what Kick is sending
        log.info({ event: message.event, channel: message.channel }, '❓ Unknown Pusher event');
      }
    }
  }
  
  private handleChatMessage(message: PusherMessage): void {
    try {
      const data: ChatMessageData = JSON.parse(message.data);
      
      const chatMessage: KickChatMessage = {
        id: data.id,
        chatroom_id: data.chatroom_id,
        content: data.content,
        type: data.type,
        created_at: data.created_at,
        sender: {
          id: data.sender.id,
          username: data.sender.username,
          slug: data.sender.slug,
          identity: {
            color: data.sender.identity.color,
            badges: data.sender.identity.badges,
          },
        },
      };
      
      log.info({ 
        username: chatMessage.sender.username, 
        content: chatMessage.content.substring(0, 50) 
      }, '💬 Chat message parsed, emitting...');
      
      this.emit('message', chatMessage);
      
      log.info('✅ Message emitted to handlers');
    } catch (error) {
      log.error({ error, rawData: message.data }, 'Failed to parse chat message');
    }
  }
  
  private subscribeToChannels(): void {
    // Subscribe to chatroom for chat messages
    this.subscribe(`chatrooms.${this.chatroomId}.v2`);
    
    // Subscribe to channel for stream events
    this.subscribe(`channel.${this.channelId}`);
    
    log.info({ chatroomId: this.chatroomId, channelId: this.channelId }, 'Subscribed to channels');
  }
  
  private subscribe(channel: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log.warn({ channel }, 'Cannot subscribe - WebSocket not open');
      return;
    }
    
    const subscribeMessage = JSON.stringify({
      event: 'pusher:subscribe',
      data: { channel },
    });
    
    this.ws.send(subscribeMessage);
    log.info({ channel }, 'Sent subscribe request');
  }
  
  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ event: 'pusher:ping', data: {} }));
        // Silent ping - too noisy
      }
    }, 30000); // Ping every 30 seconds
  }
  
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error('Max reconnect attempts reached');
      this.emit('error', new Error('Max reconnect attempts reached'));
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    log.info({ attempt: this.reconnectAttempts, delay }, 'Attempting reconnect...');
    
    setTimeout(() => {
      this.connect().catch((error) => {
        log.error({ error }, 'Reconnect failed');
      });
    }, delay);
  }
  
  disconnect(): void {
    this.stopPing();
    this.subscribedChannels.clear();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.isConnected = false;
    log.info('Disconnected from chat');
  }
  
  isActive(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }
}
