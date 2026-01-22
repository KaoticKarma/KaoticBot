import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import * as schema from './schema.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('database');

// Get root directory path
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../../../');
const dbPath = path.join(rootDir, 'data', 'bot.db');

// Ensure data directory exists
import fs from 'fs';
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create database connection
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

// Helper to check if column exists
function columnExists(table: string, column: string): boolean {
  const result = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return result.some(col => col.name === column);
}

// Helper to check if table exists
function tableExists(table: string): boolean {
  const result = sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(table);
  return !!result;
}

// Initialize database tables
export async function initDatabase(): Promise<void> {
  log.info({ dbPath }, 'Initializing database...');
  
  // Create tables if they don't exist
  sqlite.exec(`
    -- ============================================
    -- BOT CONFIGURATION (Global)
    -- ============================================
    
    -- Stores the bot account credentials (ChaosSquadBot)
    -- This is the account that sends all chat messages on behalf of streamers
    CREATE TABLE IF NOT EXISTS bot_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_user_id INTEGER NOT NULL UNIQUE,
      bot_username TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
    
    -- ============================================
    -- MULTI-TENANT ACCOUNT SYSTEM
    -- ============================================
    
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kick_user_id INTEGER NOT NULL UNIQUE,
      kick_username TEXT NOT NULL,
      kick_display_name TEXT NOT NULL,
      kick_email TEXT,
      kick_profile_pic TEXT,
      kick_channel_id INTEGER,
      kick_chatroom_id INTEGER,
      kick_channel_slug TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expires_at INTEGER NOT NULL,
      subscription_tier TEXT DEFAULT 'free',
      subscription_expires_at INTEGER,
      stripe_customer_id TEXT,
      bot_enabled INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
    
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );
    
    CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

    -- ============================================
    -- CORE TABLES
    -- ============================================

    CREATE TABLE IF NOT EXISTS commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      response TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      cooldown INTEGER NOT NULL DEFAULT 5,
      user_level TEXT NOT NULL DEFAULT 'everyone',
      aliases TEXT NOT NULL DEFAULT '[]',
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS timers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      message TEXT NOT NULL,
      interval INTEGER NOT NULL DEFAULT 300,
      min_chat_lines INTEGER NOT NULL DEFAULT 5,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_triggered INTEGER
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      min_amount INTEGER NOT NULL DEFAULT 1,
      max_amount INTEGER,
      message TEXT NOT NULL,
      sound TEXT,
      image_url TEXT,
      video_url TEXT,
      duration INTEGER NOT NULL DEFAULT 5000,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS event_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      message TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS counters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0
    );

    -- Legacy users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      watch_time INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      first_seen INTEGER NOT NULL DEFAULT (unixepoch()),
      last_seen INTEGER NOT NULL DEFAULT (unixepoch()),
      is_follower INTEGER NOT NULL DEFAULT 0,
      is_subscriber INTEGER NOT NULL DEFAULT 0,
      followed_at INTEGER,
      subscribed_at INTEGER
    );

    -- New per-account channel users
    CREATE TABLE IF NOT EXISTS channel_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      kick_user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT,
      points INTEGER NOT NULL DEFAULT 0,
      watch_time INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      first_seen INTEGER NOT NULL DEFAULT (unixepoch()),
      last_seen INTEGER NOT NULL DEFAULT (unixepoch()),
      is_follower INTEGER NOT NULL DEFAULT 0,
      is_subscriber INTEGER NOT NULL DEFAULT 0,
      followed_at INTEGER,
      subscribed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at INTEGER NOT NULL,
      scope TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS stream_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      stream_id TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      peak_viewers INTEGER NOT NULL DEFAULT 0,
      total_messages INTEGER NOT NULL DEFAULT 0,
      unique_chatters INTEGER NOT NULL DEFAULT 0,
      new_followers INTEGER NOT NULL DEFAULT 0,
      new_subscribers INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cooldowns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      command_name TEXT NOT NULL,
      used_by INTEGER NOT NULL,
      used_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Discord settings
    CREATE TABLE IF NOT EXISTS discord_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
      webhook_url TEXT,
      channel_name TEXT DEFAULT 'stream-announcements',
      ping_everyone INTEGER DEFAULT 1,
      custom_message TEXT DEFAULT 'Come hang out! 🎮',
      go_live_enabled INTEGER DEFAULT 1,
      offline_enabled INTEGER DEFAULT 1,
      embed_color TEXT DEFAULT '#53fc18',
      offline_color TEXT DEFAULT '#ff6b6b',
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- Points settings
    CREATE TABLE IF NOT EXISTS points_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
      enabled INTEGER DEFAULT 1,
      currency_name TEXT DEFAULT 'Points',
      points_per_message INTEGER DEFAULT 5,
      message_cooldown_seconds INTEGER DEFAULT 30,
      points_per_minute_watching INTEGER DEFAULT 1,
      sub_multiplier REAL DEFAULT 2.0,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    -- Stream sessions
    CREATE TABLE IF NOT EXISTS stream_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      stream_id TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      title TEXT,
      category TEXT,
      thumbnail_url TEXT,
      screenshot_path TEXT,
      peak_viewers INTEGER DEFAULT 0,
      total_messages INTEGER DEFAULT 0,
      unique_chatters INTEGER DEFAULT 0,
      new_followers INTEGER DEFAULT 0,
      new_subs INTEGER DEFAULT 0,
      gifted_subs INTEGER DEFAULT 0,
      discord_message_id TEXT,
      discord_channel_id TEXT,
      vod_url TEXT
    );

    -- Moderation settings
    CREATE TABLE IF NOT EXISTS moderation_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
      link_filter_enabled INTEGER DEFAULT 0,
      link_filter_action TEXT DEFAULT 'delete',
      link_timeout_duration INTEGER DEFAULT 60,
      link_whitelist TEXT DEFAULT '[]',
      link_permit_level TEXT DEFAULT 'subscriber',
      caps_filter_enabled INTEGER DEFAULT 0,
      caps_filter_action TEXT DEFAULT 'delete',
      caps_timeout_duration INTEGER DEFAULT 60,
      caps_threshold INTEGER DEFAULT 70,
      caps_min_length INTEGER DEFAULT 10,
      caps_permit_level TEXT DEFAULT 'subscriber',
      spam_filter_enabled INTEGER DEFAULT 0,
      spam_filter_action TEXT DEFAULT 'delete',
      spam_timeout_duration INTEGER DEFAULT 60,
      spam_max_repeats INTEGER DEFAULT 4,
      spam_max_emotes INTEGER DEFAULT 10,
      spam_permit_level TEXT DEFAULT 'subscriber',
      symbol_filter_enabled INTEGER DEFAULT 0,
      symbol_filter_action TEXT DEFAULT 'delete',
      symbol_timeout_duration INTEGER DEFAULT 60,
      symbol_threshold INTEGER DEFAULT 50,
      symbol_min_length INTEGER DEFAULT 5,
      symbol_permit_level TEXT DEFAULT 'subscriber',
      banned_words_enabled INTEGER DEFAULT 1,
      banned_words_action TEXT DEFAULT 'timeout',
      banned_words_timeout_duration INTEGER DEFAULT 300,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS banned_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      is_regex INTEGER DEFAULT 0,
      severity TEXT DEFAULT 'medium',
      action TEXT DEFAULT 'timeout',
      timeout_duration INTEGER DEFAULT 300,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS mod_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      target_user_id INTEGER NOT NULL,
      target_username TEXT NOT NULL,
      moderator_user_id INTEGER,
      moderator_username TEXT,
      action TEXT NOT NULL,
      reason TEXT,
      duration INTEGER,
      message_content TEXT,
      message_id TEXT,
      filter_type TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS permits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      permit_type TEXT DEFAULT 'link',
      expires_at INTEGER NOT NULL,
      granted_by TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);

  // Run migrations for existing tables
  await runMigrations();
  
  // Create indexes
  createIndexes();

  log.info('Database initialized successfully');
}

async function runMigrations(): Promise<void> {
  log.info('Running migrations...');

  // Add account_id to existing tables if not present
  const tablesToMigrate = [
    'commands', 'timers', 'alerts', 'event_messages', 'counters',
    'stream_stats', 'cooldowns', 'stream_sessions', 'banned_words',
    'mod_logs', 'permits'
  ];

  for (const table of tablesToMigrate) {
    if (tableExists(table) && !columnExists(table, 'account_id')) {
      log.info({ table }, 'Adding account_id column');
      try {
        sqlite.exec(`ALTER TABLE ${table} ADD COLUMN account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE`);
      } catch (err) {
        log.warn({ table, err }, 'Migration may have already been applied');
      }
    }
  }

  // Migrate settings table from key-only to account_id + key
  if (tableExists('settings')) {
    const settingsColumns = sqlite.prepare(`PRAGMA table_info(settings)`).all() as { name: string }[];
    const hasId = settingsColumns.some(c => c.name === 'id');
    
    if (!hasId) {
      log.info('Migrating settings table to new schema');
      try {
        // Rename old table
        sqlite.exec(`ALTER TABLE settings RENAME TO settings_old`);
        
        // Create new table
        sqlite.exec(`
          CREATE TABLE settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
            key TEXT NOT NULL,
            value TEXT NOT NULL
          )
        `);
        
        // Copy data (without account_id for now)
        sqlite.exec(`INSERT INTO settings (key, value) SELECT key, value FROM settings_old`);
        
        // Drop old table
        sqlite.exec(`DROP TABLE settings_old`);
      } catch (err) {
        log.warn({ err }, 'Settings migration may have already been applied');
      }
    }
  }

  // Add account_id to discord_settings if missing
  if (tableExists('discord_settings') && !columnExists('discord_settings', 'account_id')) {
    log.info('Adding account_id to discord_settings');
    try {
      sqlite.exec(`ALTER TABLE discord_settings ADD COLUMN account_id INTEGER UNIQUE REFERENCES accounts(id) ON DELETE CASCADE`);
    } catch (err) {
      log.warn({ err }, 'Discord settings migration may have already been applied');
    }
  }

  // Add account_id to moderation_settings if missing
  if (tableExists('moderation_settings') && !columnExists('moderation_settings', 'account_id')) {
    log.info('Adding account_id to moderation_settings');
    try {
      sqlite.exec(`ALTER TABLE moderation_settings ADD COLUMN account_id INTEGER UNIQUE REFERENCES accounts(id) ON DELETE CASCADE`);
    } catch (err) {
      log.warn({ err }, 'Moderation settings migration may have already been applied');
    }
  }

  // Remove UNIQUE constraint from commands.name and timers.name if needed
  // (can't easily alter constraints in SQLite, so we'll handle this at query level)

  log.info('Migrations completed');
}

function createIndexes(): void {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_commands_account ON commands(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_commands_account_name ON commands(account_id, name)',
    'CREATE INDEX IF NOT EXISTS idx_timers_account ON timers(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_timers_account_name ON timers(account_id, name)',
    'CREATE INDEX IF NOT EXISTS idx_alerts_account ON alerts(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_alerts_account_type ON alerts(account_id, type)',
    'CREATE INDEX IF NOT EXISTS idx_event_messages_account ON event_messages(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_event_messages_account_event ON event_messages(account_id, event_type)',
    'CREATE INDEX IF NOT EXISTS idx_counters_account ON counters(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_counters_account_name ON counters(account_id, name)',
    'CREATE INDEX IF NOT EXISTS idx_channel_users_account ON channel_users(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_channel_users_account_user ON channel_users(account_id, kick_user_id)',
    'CREATE INDEX IF NOT EXISTS idx_cooldowns_account ON cooldowns(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_cooldowns_lookup ON cooldowns(account_id, command_name, used_by, used_at)',
    'CREATE INDEX IF NOT EXISTS idx_banned_words_account ON banned_words(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_mod_logs_account ON mod_logs(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_mod_logs_account_created ON mod_logs(account_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_permits_account ON permits(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_permits_account_user ON permits(account_id, user_id, expires_at)',
    'CREATE INDEX IF NOT EXISTS idx_settings_account ON settings(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_settings_account_key ON settings(account_id, key)',
    'CREATE INDEX IF NOT EXISTS idx_stream_sessions_account ON stream_sessions(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_stream_stats_account ON stream_stats(account_id)',
    'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
  ];

  for (const idx of indexes) {
    try {
      sqlite.exec(idx);
    } catch (err) {
      // Index may already exist
    }
  }
}

/**
 * Seed default data for a new account
 */
export async function seedAccountDefaults(accountId: number): Promise<void> {
  log.info({ accountId }, 'Seeding defaults for new account');

  // Seed default commands
  const defaultCommands = [
    { name: 'ping', response: 'Pong! 🏓 Bot latency: $(latency)ms', cooldown: 5 },
    { name: 'uptime', response: '$(channel) has been live for $(uptime)', cooldown: 10 },
    { name: 'followage', response: '$(user) has been following for $(followage)', cooldown: 10 },
    { name: 'commands', response: 'Available commands: $(commandlist)', cooldown: 30 },
    { name: 'love', response: '$(user) and $(randomuser) have a Rand[0,100]% love compatibility 💕', cooldown: 10 },
    { name: 'hug', response: '$(user) gives $(touser) a warm hug 🤗', cooldown: 5 },
  ];

  for (const cmd of defaultCommands) {
    try {
      db.insert(schema.commands).values({
        accountId,
        name: cmd.name,
        response: cmd.response,
        cooldown: cmd.cooldown,
        enabled: true,
        userLevel: 'everyone',
        aliases: [],
        usageCount: 0,
      }).run();
    } catch (err) {
      // Command may already exist, skip
      log.debug({ accountId, command: cmd.name }, 'Command may already exist, skipping');
    }
  }

  // Seed default event messages
  const defaultEvents = [
    { eventType: 'follow' as const, message: '@$(user) just followed! Welcome! 💚' },
    { eventType: 'subscription' as const, message: '@$(user) just subscribed! Thank you! 🎉' },
    { eventType: 'gifted_sub' as const, message: '@$(user) gifted $(amount) sub(s)! 🎁' },
    { eventType: 'raid' as const, message: '@$(user) raided with $(amount) viewers! 🚀' },
    { eventType: 'kick' as const, message: '@$(user) sent $(amount) Kicks! 💰' },
  ];

  for (const evt of defaultEvents) {
    try {
      db.insert(schema.eventMessages).values({
        accountId,
        eventType: evt.eventType,
        message: evt.message,
        enabled: true,
      }).run();
    } catch (err) {
      // Event message may already exist, skip
      log.debug({ accountId, eventType: evt.eventType }, 'Event message may already exist, skipping');
    }
  }

  // Create default moderation settings (wrapped in try-catch for unique constraint)
  try {
    db.insert(schema.moderationSettings).values({
      accountId,
    }).run();
  } catch (err) {
    log.debug({ accountId }, 'Moderation settings may already exist, skipping');
  }

  // Create default points settings (wrapped in try-catch for unique constraint)
  try {
    db.insert(schema.pointsSettings).values({
      accountId,
    }).run();
  } catch (err) {
    log.debug({ accountId }, 'Points settings may already exist, skipping');
  }

  log.info({ accountId }, 'Account defaults seeded');
}

export { schema };
