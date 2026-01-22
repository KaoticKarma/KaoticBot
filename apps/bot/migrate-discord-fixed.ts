// Run with: npx tsx migrate-discord-fixed.ts
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Go up to root: apps/bot -> apps -> root
const rootDir = path.resolve(__dirname, '../../');
const dbPath = path.join(rootDir, 'data', 'bot.db');

console.log('Opening database:', dbPath);

const db = new Database(dbPath);

// Create discord_settings table
console.log('Creating discord_settings table...');
db.exec(`
  CREATE TABLE IF NOT EXISTS discord_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_url TEXT NOT NULL,
    channel_name TEXT DEFAULT 'stream-announcements',
    ping_everyone INTEGER DEFAULT 1,
    custom_message TEXT DEFAULT 'Come hang out! 🎮',
    go_live_enabled INTEGER DEFAULT 1,
    offline_enabled INTEGER DEFAULT 1,
    embed_color TEXT DEFAULT '#53fc18',
    offline_color TEXT DEFAULT '#ff6b6b',
    created_at INTEGER,
    updated_at INTEGER
  )
`);

// Create stream_sessions table
console.log('Creating stream_sessions table...');
db.exec(`
  CREATE TABLE IF NOT EXISTS stream_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  )
`);

// Verify tables exist
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('discord_settings', 'stream_sessions')").all();
console.log('Created tables:', tables.map((t: any) => t.name).join(', '));

console.log('✓ Discord integration tables created successfully!');
db.close();
