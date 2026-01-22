// Kick API Types
export interface KickUser {
  id: number;
  username: string;
  slug: string;
  profile_pic: string | null;
  is_staff: boolean;
  is_channel_owner: boolean;
  is_moderator: boolean;
  is_super_admin: boolean;
  is_subscribed: boolean;
  is_following: boolean;
  badges: KickBadge[];
}

export interface KickBadge {
  type: string;
  text: string;
  count?: number;
}

export interface KickChannel {
  id: number;
  slug: string;
  user_id: number;
  user: {
    id: number;
    username: string;
    profile_pic: string | null;
  };
  chatroom: {
    id: number;
    chatable_type: string;
    channel_id: number;
    created_at: string;
    updated_at: string;
    chat_mode_old: string;
    chat_mode: string;
    slow_mode: boolean;
    chatable_id: number;
    followers_mode: boolean;
    subscribers_mode: boolean;
    emotes_mode: boolean;
    message_interval: number;
    following_min_duration: number;
  };
  livestream: KickLivestream | null;
  verified: boolean;
  followersCount: number;
}

export interface KickLivestream {
  id: number;
  slug: string;
  channel_id: number;
  created_at: string;
  session_title: string;
  is_live: boolean;
  risk_level_id: number | null;
  start_time: string;
  source: string | null;
  twitch_channel: string | null;
  duration: number;
  language: string;
  is_mature: boolean;
  viewer_count: number;
  thumbnail: {
    url: string;
  };
  categories: KickCategory[];
}

export interface KickCategory {
  id: number;
  category_id: number;
  name: string;
  slug: string;
  tags: string[];
  description: string | null;
  deleted_at: string | null;
  viewers: number;
  category: {
    id: number;
    name: string;
    slug: string;
    icon: string;
  };
}

// Chat Message Types
export interface KickChatMessage {
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
      badges: KickBadge[];
    };
  };
  metadata?: Record<string, unknown>;
}

// WebSocket Event Types
export interface ChatMessageEvent {
  event: 'App\\Events\\ChatMessageEvent';
  data: {
    id: string;
    chatroom_id: number;
    content: string;
    type: string;
    created_at: string;
    sender: KickChatMessage['sender'];
  };
  channel: string;
}

export interface StreamStatusEvent {
  event: 'App\\Events\\StreamerIsLive' | 'App\\Events\\StopStreamBroadcast';
  data: {
    livestream?: KickLivestream;
  };
  channel: string;
}

// Bot Command Types
export interface Command {
  id: number;
  name: string;
  response: string;
  enabled: boolean;
  cooldown: number;
  userLevel: UserLevel;
  aliases: string[];
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type UserLevel = 'everyone' | 'follower' | 'subscriber' | 'vip' | 'moderator' | 'broadcaster';

export interface CommandContext {
  message: KickChatMessage;
  channel: KickChannel;
  args: string[];
  commandName: string;
  user: {
    id: number;
    username: string;
    displayName: string;
    level: UserLevel;
    isBroadcaster: boolean;
    isModerator: boolean;
    isSubscriber: boolean;
    isVip: boolean;
  };
}

// Variable Parser Types
export interface VariableContext {
  user: CommandContext['user'];
  channel: KickChannel;
  args: string[];
  touser: string | null;
  message: string;
  chatUsers: string[];
}

export type VariableFunction = (ctx: VariableContext, ...args: string[]) => string | Promise<string>;

// Alert Types
export interface AlertConfig {
  id: number;
  type: AlertType;
  minAmount: number;
  maxAmount: number | null;
  message: string;
  sound: string | null;
  duration: number;
  enabled: boolean;
}

export type AlertType = 'follow' | 'subscription' | 'gifted_sub' | 'raid' | 'tip';

// Timer Types
export interface Timer {
  id: number;
  name: string;
  message: string;
  interval: number;
  minChatLines: number;
  enabled: boolean;
  lastTriggered: Date | null;
}

// OAuth Types
export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  scope: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
