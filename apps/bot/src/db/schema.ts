import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// ============================================
// BOT CONFIGURATION (Global)
// ============================================

export const botConfig = sqliteTable('bot_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  botUserId: integer('bot_user_id').notNull().unique(),
  botUsername: text('bot_username').notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ============================================
// MULTI-TENANT ACCOUNT SYSTEM
// ============================================

export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kickUserId: integer('kick_user_id').notNull().unique(),
  kickUsername: text('kick_username').notNull(),
  kickDisplayName: text('kick_display_name').notNull(),
  kickEmail: text('kick_email'),
  kickProfilePic: text('kick_profile_pic'),
  kickChannelId: integer('kick_channel_id'),
  kickChatroomId: integer('kick_chatroom_id'),
  kickChannelSlug: text('kick_channel_slug'),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp' }).notNull(),
  subscriptionTier: text('subscription_tier', { 
    enum: ['free', 'pro', 'enterprise'] 
  }).notNull().default('free'),
  subscriptionExpiresAt: integer('subscription_expires_at', { mode: 'timestamp' }),
  stripeCustomerId: text('stripe_customer_id'),
  botEnabled: integer('bot_enabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Widget tokens for default alert widget URL (one per account, all alerts)
export const widgetTokens = sqliteTable('widget_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull().unique().references(() => accounts.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  tokenIdx: index('idx_widget_tokens_token').on(table.token),
}));

// Custom widget configurations (multiple per account, specific alert types)
export const widgetConfigs = sqliteTable('widget_configs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  name: text('name').notNull(),
  alertTypes: text('alert_types').notNull().default('["follow","subscription","gifted_sub","raid","tip","kick"]'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  tokenIdx: index('idx_widget_configs_token').on(table.token),
  accountIdx: index('idx_widget_configs_account').on(table.accountId),
}));

// ============================================
// PER-ACCOUNT DATA TABLES
// ============================================

export const commands = sqliteTable('commands', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  response: text('response').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  cooldown: integer('cooldown').notNull().default(5),
  userLevel: text('user_level', { 
    enum: ['everyone', 'follower', 'subscriber', 'vip', 'moderator', 'broadcaster'] 
  }).notNull().default('everyone'),
  aliases: text('aliases', { mode: 'json' }).$type<string[]>().notNull().default([]),
  usageCount: integer('usage_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  accountNameIdx: index('idx_commands_account_name').on(table.accountId, table.name),
}));

export const timers = sqliteTable('timers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  message: text('message').notNull(),
  interval: integer('interval').notNull().default(300),
  minChatLines: integer('min_chat_lines').notNull().default(5),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastTriggered: integer('last_triggered', { mode: 'timestamp' }),
}, (table) => ({
  accountNameIdx: index('idx_timers_account_name').on(table.accountId, table.name),
}));

// Alerts table with full styling support (matching Botrix)
export const alerts = sqliteTable('alerts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  type: text('type', { 
    enum: ['follow', 'subscription', 'gifted_sub', 'raid', 'tip', 'kick'] 
  }).notNull(),
  minAmount: integer('min_amount').notNull().default(1),
  maxAmount: integer('max_amount'),
  message: text('message').notNull(),
  sound: text('sound'),
  imageUrl: text('image_url'),
  videoUrl: text('video_url'),
  duration: integer('duration').notNull().default(5000),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  // Basic styling fields
  layout: text('layout').notNull().default('above'),
  animation: text('animation').notNull().default('fade'),
  volume: integer('volume').notNull().default(50),
  topTextColor: text('top_text_color').notNull().default('#ffffff'),
  bottomTextColor: text('bottom_text_color').notNull().default('#ffffff'),
  font: text('font').notNull().default('Impact'),
  textPositionY: integer('text_position_y').notNull().default(0),
  // Custom code fields
  customCodeEnabled: integer('custom_code_enabled', { mode: 'boolean' }).notNull().default(false),
  customHtml: text('custom_html'),
  customCss: text('custom_css'),
  customJs: text('custom_js'),
}, (table) => ({
  accountTypeIdx: index('idx_alerts_account_type').on(table.accountId, table.type),
}));

export const eventMessages = sqliteTable('event_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  eventType: text('event_type', { 
    enum: ['follow', 'subscription', 'gifted_sub', 'raid', 'kick'] 
  }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  message: text('message').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => ({
  accountEventIdx: index('idx_event_messages_account_event').on(table.accountId, table.eventType),
}));

export const moderationSettings = sqliteTable('moderation_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').unique().references(() => accounts.id, { onDelete: 'cascade' }),
  linkFilterEnabled: integer('link_filter_enabled', { mode: 'boolean' }).default(false),
  linkFilterAction: text('link_filter_action', { enum: ['delete', 'timeout', 'ban'] }).default('delete'),
  linkTimeoutDuration: integer('link_timeout_duration').default(60),
  linkWhitelist: text('link_whitelist', { mode: 'json' }).$type<string[]>().default([]),
  linkPermitLevel: text('link_permit_level', { 
    enum: ['everyone', 'follower', 'subscriber', 'vip', 'moderator', 'broadcaster'] 
  }).default('subscriber'),
  capsFilterEnabled: integer('caps_filter_enabled', { mode: 'boolean' }).default(false),
  capsFilterAction: text('caps_filter_action', { enum: ['delete', 'timeout', 'ban'] }).default('delete'),
  capsTimeoutDuration: integer('caps_timeout_duration').default(60),
  capsThreshold: integer('caps_threshold').default(70),
  capsMinLength: integer('caps_min_length').default(10),
  capsPermitLevel: text('caps_permit_level', { 
    enum: ['everyone', 'follower', 'subscriber', 'vip', 'moderator', 'broadcaster'] 
  }).default('subscriber'),
  spamFilterEnabled: integer('spam_filter_enabled', { mode: 'boolean' }).default(false),
  spamFilterAction: text('spam_filter_action', { enum: ['delete', 'timeout', 'ban'] }).default('delete'),
  spamTimeoutDuration: integer('spam_timeout_duration').default(60),
  spamMaxRepeats: integer('spam_max_repeats').default(4),
  spamMaxEmotes: integer('spam_max_emotes').default(10),
  spamPermitLevel: text('spam_permit_level', { 
    enum: ['everyone', 'follower', 'subscriber', 'vip', 'moderator', 'broadcaster'] 
  }).default('subscriber'),
  symbolFilterEnabled: integer('symbol_filter_enabled', { mode: 'boolean' }).default(false),
  symbolFilterAction: text('symbol_filter_action', { enum: ['delete', 'timeout', 'ban'] }).default('delete'),
  symbolTimeoutDuration: integer('symbol_timeout_duration').default(60),
  symbolThreshold: integer('symbol_threshold').default(50),
  symbolMinLength: integer('symbol_min_length').default(5),
  symbolPermitLevel: text('symbol_permit_level', { 
    enum: ['everyone', 'follower', 'subscriber', 'vip', 'moderator', 'broadcaster'] 
  }).default('subscriber'),
  bannedWordsEnabled: integer('banned_words_enabled', { mode: 'boolean' }).default(true),
  bannedWordsAction: text('banned_words_action', { enum: ['delete', 'timeout', 'ban'] }).default('timeout'),
  bannedWordsTimeoutDuration: integer('banned_words_timeout_duration').default(300),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const bannedWords = sqliteTable('banned_words', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  word: text('word').notNull(),
  isRegex: integer('is_regex', { mode: 'boolean' }).default(false),
  severity: text('severity', { enum: ['low', 'medium', 'high'] }).default('medium'),
  action: text('action', { enum: ['delete', 'timeout', 'ban'] }).default('timeout'),
  timeoutDuration: integer('timeout_duration').default(300),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => ({
  accountIdx: index('idx_banned_words_account').on(table.accountId),
}));

export const discordSettings = sqliteTable('discord_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').unique().references(() => accounts.id, { onDelete: 'cascade' }),
  guildId: text('guild_id'),
  channelId: text('channel_id'),
  pingEveryone: integer('ping_everyone', { mode: 'boolean' }).default(true),
  pingRoleId: text('ping_role_id'),
  customMessage: text('custom_message').default('Come hang out! 🎮'),
  goLiveEnabled: integer('go_live_enabled', { mode: 'boolean' }).default(true),
  offlineEnabled: integer('offline_enabled', { mode: 'boolean' }).default(true),
  embedColor: text('embed_color').default('#53fc18'),
  offlineColor: text('offline_color').default('#ff6b6b'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const pointsSettings = sqliteTable('points_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').unique().references(() => accounts.id, { onDelete: 'cascade' }),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  currencyName: text('currency_name').default('Points'),
  pointsPerMessage: integer('points_per_message').default(5),
  messageCooldownSeconds: integer('message_cooldown_seconds').default(30),
  pointsPerMinuteWatching: integer('points_per_minute_watching').default(1),
  subMultiplier: real('sub_multiplier').default(2.0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const channelUsers = sqliteTable('channel_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  kickUserId: integer('kick_user_id').notNull(),
  username: text('username').notNull(),
  displayName: text('display_name'),
  points: integer('points').notNull().default(0),
  watchTime: integer('watch_time').notNull().default(0),
  messageCount: integer('message_count').notNull().default(0),
  firstSeen: integer('first_seen', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  lastSeen: integer('last_seen', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  isFollower: integer('is_follower', { mode: 'boolean' }).notNull().default(false),
  isSubscriber: integer('is_subscriber', { mode: 'boolean' }).notNull().default(false),
  followedAt: integer('followed_at', { mode: 'timestamp' }),
  subscribedAt: integer('subscribed_at', { mode: 'timestamp' }),
}, (table) => ({
  accountUserIdx: index('idx_channel_users_account_user').on(table.accountId, table.kickUserId),
}));

export const counters = sqliteTable('counters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  value: integer('value').notNull().default(0),
}, (table) => ({
  accountNameIdx: index('idx_counters_account_name').on(table.accountId, table.name),
}));

// ============================================
// FIRST-TIME CHATTER TRACKING
// ============================================

// Tracks users who have chatted in a channel (for first-time chatter alerts)
export const knownChatters = sqliteTable('known_chatters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  kickUserId: integer('kick_user_id').notNull(),
  firstChatAt: integer('first_chat_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Unique constraint: one entry per user per account
  accountUserIdx: index('idx_known_chatters_account_user').on(table.accountId, table.kickUserId),
}));

// ============================================
// CLIP SYSTEM
// ============================================

export const clipSettings = sqliteTable('clip_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').unique().references(() => accounts.id, { onDelete: 'cascade' }),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  defaultDuration: integer('default_duration').notNull().default(30),
  maxDuration: integer('max_duration').notNull().default(120),
  minUserLevel: text('min_user_level', { 
    enum: ['everyone', 'follower', 'subscriber', 'vip', 'moderator', 'broadcaster'] 
  }).notNull().default('everyone'),
  cooldownSeconds: integer('cooldown_seconds').notNull().default(30),
  discordGuildId: text('discord_guild_id'),
  discordChannelId: text('discord_channel_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const clips = sqliteTable('clips', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  channelSlug: text('channel_slug').notNull(),
  channelName: text('channel_name').notNull(),
  filename: text('filename').notNull(),
  filepath: text('filepath').notNull(),
  duration: integer('duration').notNull(),
  fileSize: integer('file_size').notNull(),
  requestedBy: text('requested_by').notNull(),
  requestedByUserId: integer('requested_by_user_id').notNull(),
  status: text('status', { enum: ['pending', 'processing', 'completed', 'failed'] }).notNull().default('pending'),
  discordSent: integer('discord_sent', { mode: 'boolean' }).notNull().default(false),
  discordMessageId: text('discord_message_id'),
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  accountIdx: index('idx_clips_account').on(table.accountId),
  createdIdx: index('idx_clips_created').on(table.createdAt),
}));

// ============================================
// SHARED/SYSTEM TABLES (not per-account)
// ============================================

export const tokens = sqliteTable('tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['kick', 'discord'] }).notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  scope: text('scope'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  username: text('username').notNull(),
  displayName: text('display_name').notNull(),
  points: integer('points').notNull().default(0),
  watchTime: integer('watch_time').notNull().default(0),
  messageCount: integer('message_count').notNull().default(0),
  firstSeen: integer('first_seen', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  lastSeen: integer('last_seen', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  isFollower: integer('is_follower', { mode: 'boolean' }).notNull().default(false),
  isSubscriber: integer('is_subscriber', { mode: 'boolean' }).notNull().default(false),
  followedAt: integer('followed_at', { mode: 'timestamp' }),
  subscribedAt: integer('subscribed_at', { mode: 'timestamp' }),
});

export const streamStats = sqliteTable('stream_stats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  streamId: text('stream_id').notNull(),
  startTime: integer('start_time', { mode: 'timestamp' }).notNull(),
  endTime: integer('end_time', { mode: 'timestamp' }),
  peakViewers: integer('peak_viewers').notNull().default(0),
  totalMessages: integer('total_messages').notNull().default(0),
  uniqueChatters: integer('unique_chatters').notNull().default(0),
  newFollowers: integer('new_followers').notNull().default(0),
  newSubscribers: integer('new_subscribers').notNull().default(0),
});

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value', { mode: 'json' }).notNull(),
}, (table) => ({
  accountKeyIdx: index('idx_settings_account_key').on(table.accountId, table.key),
}));

export const cooldowns = sqliteTable('cooldowns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  commandName: text('command_name').notNull(),
  usedBy: integer('used_by').notNull(),
  usedAt: integer('used_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  lookupIdx: index('idx_cooldowns_lookup').on(table.accountId, table.commandName, table.usedBy, table.usedAt),
}));

export const streamSessions = sqliteTable('stream_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  streamId: text('stream_id'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  title: text('title'),
  category: text('category'),
  thumbnailUrl: text('thumbnail_url'),
  screenshotPath: text('screenshot_path'),
  peakViewers: integer('peak_viewers').default(0),
  totalMessages: integer('total_messages').default(0),
  uniqueChatters: integer('unique_chatters').default(0),
  newFollowers: integer('new_followers').default(0),
  newSubs: integer('new_subs').default(0),
  giftedSubs: integer('gifted_subs').default(0),
  discordMessageId: text('discord_message_id'),
  discordChannelId: text('discord_channel_id'),
  vodUrl: text('vod_url'),
});

export const modLogs = sqliteTable('mod_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  targetUserId: integer('target_user_id').notNull(),
  targetUsername: text('target_username').notNull(),
  moderatorUserId: integer('moderator_user_id'),
  moderatorUsername: text('moderator_username'),
  action: text('action', { enum: ['delete', 'timeout', 'ban', 'unban', 'warn'] }).notNull(),
  reason: text('reason'),
  duration: integer('duration'),
  messageContent: text('message_content'),
  messageId: text('message_id'),
  filterType: text('filter_type', { 
    enum: ['link', 'caps', 'spam', 'symbol', 'banned_word', 'manual'] 
  }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => ({
  accountCreatedIdx: index('idx_mod_logs_account_created').on(table.accountId, table.createdAt),
}));

export const permits = sqliteTable('permits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull(),
  username: text('username').notNull(),
  permitType: text('permit_type', { enum: ['link', 'all'] }).default('link'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  grantedBy: text('granted_by').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => ({
  accountUserIdx: index('idx_permits_account_user').on(table.accountId, table.userId, table.expiresAt),
}));

// ============================================
// TYPE EXPORTS
// ============================================

export type BotConfig = typeof botConfig.$inferSelect;
export type NewBotConfig = typeof botConfig.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Command = typeof commands.$inferSelect;
export type NewCommand = typeof commands.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ChannelUser = typeof channelUsers.$inferSelect;
export type NewChannelUser = typeof channelUsers.$inferInsert;
export type Counter = typeof counters.$inferSelect;
export type Timer = typeof timers.$inferSelect;
export type NewTimer = typeof timers.$inferInsert;
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
export type Token = typeof tokens.$inferSelect;
export type StreamStat = typeof streamStats.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type DiscordSettings = typeof discordSettings.$inferSelect;
export type NewDiscordSettings = typeof discordSettings.$inferInsert;
export type PointsSettings = typeof pointsSettings.$inferSelect;
export type NewPointsSettings = typeof pointsSettings.$inferInsert;
export type StreamSession = typeof streamSessions.$inferSelect;
export type NewStreamSession = typeof streamSessions.$inferInsert;
export type ModerationSettings = typeof moderationSettings.$inferSelect;
export type NewModerationSettings = typeof moderationSettings.$inferInsert;
export type BannedWord = typeof bannedWords.$inferSelect;
export type NewBannedWord = typeof bannedWords.$inferInsert;
export type ModLog = typeof modLogs.$inferSelect;
export type NewModLog = typeof modLogs.$inferInsert;
export type Permit = typeof permits.$inferSelect;
export type NewPermit = typeof permits.$inferInsert;
export type EventMessage = typeof eventMessages.$inferSelect;
export type NewEventMessage = typeof eventMessages.$inferInsert;
export type WidgetToken = typeof widgetTokens.$inferSelect;
export type NewWidgetToken = typeof widgetTokens.$inferInsert;
export type WidgetConfig = typeof widgetConfigs.$inferSelect;
export type NewWidgetConfig = typeof widgetConfigs.$inferInsert;
export type ClipSettings = typeof clipSettings.$inferSelect;
export type NewClipSettings = typeof clipSettings.$inferInsert;
export type Clip = typeof clips.$inferSelect;
export type NewClip = typeof clips.$inferInsert;
export type KnownChatter = typeof knownChatters.$inferSelect;
export type NewKnownChatter = typeof knownChatters.$inferInsert;
