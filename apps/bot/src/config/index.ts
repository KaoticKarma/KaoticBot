import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from root folder
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const envSchema = z.object({
  // Kick OAuth
  KICK_CLIENT_ID: z.string().min(1, 'KICK_CLIENT_ID is required'),
  KICK_CLIENT_SECRET: z.string().min(1, 'KICK_CLIENT_SECRET is required'),
  KICK_REDIRECT_URI: z.string().url().default('http://localhost:3000/auth/callback'),
  
  // Bot account name
  KICK_BOT_USERNAME: z.string().default('KaoticBot'),
  
  // FakeYou TTS credentials
  FAKEYOU_USERNAME: z.string().default(''),
  FAKEYOU_PASSWORD: z.string().default(''),
  
  // TTS Monster
  TTS_MONSTER_API_KEY: z.string().default(''),
  
  // Anthropic AI (for @mention chat responses)
  ANTHROPIC_API_KEY: z.string().default(''),
  
  // Channel config (required to avoid Cloudflare API blocking)
  KICK_CHANNEL_SLUG: z.string().min(1, 'KICK_CHANNEL_SLUG is required'),
  KICK_CHANNEL_ID: z.coerce.number({ required_error: 'KICK_CHANNEL_ID is required' }),
  KICK_CHATROOM_ID: z.coerce.number({ required_error: 'KICK_CHATROOM_ID is required' }),
  KICK_BROADCASTER_USER_ID: z.coerce.number({ required_error: 'KICK_BROADCASTER_USER_ID is required' }),
  
  // Server
  PORT: z.coerce.number().default(3000),
  BOT_PORT: z.coerce.number().default(3000),
  BOT_HOST: z.string().default('localhost'),
  DASHBOARD_PORT: z.coerce.number().default(5173),
  WIDGET_PORT: z.coerce.number().default(3001),
  
  // Database
  DATABASE_URL: z.string().default('./data/kaoticbot.db'),
  
  // Security
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  
  // Discord Bot (required for Discord integration)
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_APP_ID: z.string().default('1462699325325971517'),
  DISCORD_PUBLIC_KEY: z.string().optional(),
  
  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Logging
  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    for (const error of result.error.errors) {
      console.error(`   ${error.path.join('.')}: ${error.message}`);
    }
    process.exit(1);
  }
  
  return result.data;
}

export const config = loadConfig();

// Kick API endpoints
export const KICK_API = {
  BASE_URL: 'https://api.kick.com/public/v1',
  AUTH_URL: 'https://id.kick.com/oauth/authorize',
  TOKEN_URL: 'https://id.kick.com/oauth/token',
  PUSHER_KEY: '32cbd69e4b950bf97679',
  PUSHER_CLUSTER: 'us2',
} as const;

// Bot info
export const BOT_INFO = {
  NAME: 'KaoticBot',
  WEBSITE: 'https://kaoticbot.com',
} as const;
