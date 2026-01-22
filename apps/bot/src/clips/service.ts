// clips/service.ts
// Handles clip creation from Kick streams using HLS + FFmpeg

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, schema } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import { createChildLogger } from '../utils/logger.js';
// Note: sendClipToDiscord is exported from ../discord/service.js
// Make sure the updated service.ts with sendClipToDiscord is deployed
import { sendClipToDiscord } from '../discord/service.js';

const log = createChildLogger('clips');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../../../');
const clipsDir = path.join(rootDir, 'data', 'clips');

// Ensure clips directory exists
async function ensureClipsDir(): Promise<void> {
  try {
    await fs.mkdir(clipsDir, { recursive: true });
  } catch (error) {
    // Directory likely already exists
  }
}

export interface ClipResult {
  success: boolean;
  clipId?: number;
  clipUrl?: string;
  error?: string;
  duration?: number;
}

export interface ClipSettings {
  enabled: boolean;
  defaultDuration: number;
  maxDuration: number;
  minUserLevel: string;
  cooldownSeconds: number;
  discordChannelId: string | null;
  discordGuildId: string | null;
}

/**
 * Get clip settings for an account
 */
export function getClipSettings(accountId: number): ClipSettings {
  const settings = db.select()
    .from(schema.clipSettings)
    .where(eq(schema.clipSettings.accountId, accountId))
    .get();

  if (!settings) {
    // Return defaults
    return {
      enabled: false,
      defaultDuration: 30,
      maxDuration: 120,
      minUserLevel: 'everyone',
      cooldownSeconds: 30,
      discordChannelId: null,
      discordGuildId: null,
    };
  }

  return {
    enabled: settings.enabled,
    defaultDuration: settings.defaultDuration,
    maxDuration: settings.maxDuration,
    minUserLevel: settings.minUserLevel,
    cooldownSeconds: settings.cooldownSeconds,
    discordChannelId: settings.discordChannelId,
    discordGuildId: settings.discordGuildId,
  };
}

/**
 * Update clip settings for an account
 */
export function updateClipSettings(accountId: number, updates: Partial<ClipSettings>): ClipSettings {
  const existing = db.select()
    .from(schema.clipSettings)
    .where(eq(schema.clipSettings.accountId, accountId))
    .get();

  if (existing) {
    db.update(schema.clipSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.clipSettings.accountId, accountId))
      .run();
  } else {
    db.insert(schema.clipSettings)
      .values({ accountId, ...updates })
      .run();
  }

  return getClipSettings(accountId);
}

/**
 * Get playback URL for a channel
 * Kick's API returns channel info including playback_url
 */
async function getStreamPlaybackUrl(channelSlug: string): Promise<string | null> {
  try {
    // Try the public API endpoint
    const response = await fetch(`https://kick.com/api/v2/channels/${channelSlug}`);
    
    if (!response.ok) {
      log.error({ status: response.status, channelSlug }, 'Failed to fetch channel info');
      return null;
    }

    const data = await response.json();
    
    // Check if stream is live
    if (!data.livestream || !data.playback_url) {
      log.warn({ channelSlug }, 'Channel is not live or no playback URL');
      return null;
    }

    return data.playback_url;
  } catch (error) {
    log.error({ error, channelSlug }, 'Error fetching playback URL');
    return null;
  }
}

/**
 * Create a clip using FFmpeg
 * Fetches the last N seconds from the HLS stream
 */
export async function createClip(
  accountId: number,
  channelSlug: string,
  channelName: string,
  requestedBy: string,
  requestedByUserId: number,
  durationSeconds: number = 30
): Promise<ClipResult> {
  await ensureClipsDir();

  const settings = getClipSettings(accountId);
  
  // Validate duration
  const duration = Math.min(Math.max(durationSeconds, 10), settings.maxDuration);

  log.info({ channelSlug, duration, requestedBy }, 'Creating clip...');

  // Get the stream playback URL
  const playbackUrl = await getStreamPlaybackUrl(channelSlug);
  
  if (!playbackUrl) {
    return { success: false, error: 'Stream is not live or playback URL unavailable' };
  }

  // Generate unique filename
  const timestamp = Date.now();
  const filename = `clip-${channelSlug}-${timestamp}.mp4`;
  const filepath = path.join(clipsDir, filename);

  try {
    // Use FFmpeg to capture the clip
    // -sseof seeks from end of stream (negative value = last N seconds)
    // This approach reads from the live stream
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',                          // Overwrite output
        '-i', playbackUrl,             // Input HLS stream
        '-t', duration.toString(),     // Duration to capture
        '-c:v', 'libx264',             // Video codec
        '-preset', 'fast',             // Encoding speed
        '-crf', '23',                  // Quality (lower = better, 23 is default)
        '-c:a', 'aac',                 // Audio codec
        '-b:a', '128k',                // Audio bitrate
        '-movflags', '+faststart',     // Enable fast start for web
        filepath
      ]);

      let stderr = '';
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          log.error({ code, stderr: stderr.slice(-500) }, 'FFmpeg failed');
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      ffmpeg.on('error', (err) => {
        log.error({ err }, 'FFmpeg spawn error');
        reject(err);
      });

      // Timeout after 2 minutes
      setTimeout(() => {
        ffmpeg.kill('SIGTERM');
        reject(new Error('FFmpeg timeout'));
      }, 120000);
    });

    // Verify file was created
    const stats = await fs.stat(filepath);
    if (stats.size < 1000) {
      await fs.unlink(filepath).catch(() => {});
      return { success: false, error: 'Clip file too small, stream may have ended' };
    }

    // Save clip to database
    const result = db.insert(schema.clips).values({
      accountId,
      channelSlug,
      channelName,
      filename,
      filepath,
      duration,
      fileSize: stats.size,
      requestedBy,
      requestedByUserId,
      status: 'completed',
    }).returning().get();

    const clipUrl = `/clips/media/${filename}`;

    log.info({ 
      clipId: result.id, 
      filename, 
      duration, 
      fileSize: stats.size 
    }, 'Clip created successfully');

    // Send to Discord if configured
    if (settings.discordChannelId && settings.discordGuildId) {
      try {
        await sendClipToDiscord({
          guildId: settings.discordGuildId,
          channelId: settings.discordChannelId,
          clipPath: filepath,
          clipFilename: filename,
          channelName,
          channelSlug,
          duration,
          requestedBy,
        });
        
        // Update clip with discord sent status
        db.update(schema.clips)
          .set({ discordSent: true })
          .where(eq(schema.clips.id, result.id))
          .run();
          
        log.info({ clipId: result.id }, 'Clip sent to Discord');
      } catch (discordError) {
        log.error({ error: discordError }, 'Failed to send clip to Discord');
      }
    }

    return {
      success: true,
      clipId: result.id,
      clipUrl,
      duration,
    };
  } catch (error) {
    log.error({ error }, 'Failed to create clip');
    
    // Clean up partial file
    await fs.unlink(filepath).catch(() => {});
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error creating clip' 
    };
  }
}

/**
 * Get clips for an account
 */
export function getClips(accountId: number, limit: number = 50): typeof schema.clips.$inferSelect[] {
  return db.select()
    .from(schema.clips)
    .where(eq(schema.clips.accountId, accountId))
    .orderBy(desc(schema.clips.createdAt))
    .limit(limit)
    .all();
}

/**
 * Get a single clip by ID
 */
export function getClip(clipId: number): typeof schema.clips.$inferSelect | undefined {
  return db.select()
    .from(schema.clips)
    .where(eq(schema.clips.id, clipId))
    .get();
}

/**
 * Delete a clip
 */
export async function deleteClip(clipId: number, accountId: number): Promise<boolean> {
  const clip = db.select()
    .from(schema.clips)
    .where(eq(schema.clips.id, clipId))
    .get();

  if (!clip || clip.accountId !== accountId) {
    return false;
  }

  // Delete file
  try {
    await fs.unlink(clip.filepath);
  } catch (error) {
    log.warn({ error, filepath: clip.filepath }, 'Failed to delete clip file');
  }

  // Delete from database
  db.delete(schema.clips)
    .where(eq(schema.clips.id, clipId))
    .run();

  return true;
}

/**
 * Cleanup old clips (older than specified days)
 */
export async function cleanupOldClips(maxAgeDays: number = 7): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  const oldClips = db.select()
    .from(schema.clips)
    .where(eq(schema.clips.status, 'completed'))
    .all()
    .filter(clip => new Date(clip.createdAt) < cutoffDate);

  let deleted = 0;

  for (const clip of oldClips) {
    try {
      await fs.unlink(clip.filepath);
    } catch (error) {
      // File might already be gone
    }

    db.delete(schema.clips)
      .where(eq(schema.clips.id, clip.id))
      .run();

    deleted++;
  }

  if (deleted > 0) {
    log.info({ deleted, maxAgeDays }, 'Cleaned up old clips');
  }

  return deleted;
}

// Cooldown tracking
const clipCooldowns = new Map<string, number>();

/**
 * Check if user is on cooldown
 */
export function isOnCooldown(accountId: number, userId: number): boolean {
  const key = `${accountId}-${userId}`;
  const lastUsed = clipCooldowns.get(key);
  
  if (!lastUsed) return false;
  
  const settings = getClipSettings(accountId);
  const elapsed = (Date.now() - lastUsed) / 1000;
  
  return elapsed < settings.cooldownSeconds;
}

/**
 * Get remaining cooldown time
 */
export function getRemainingCooldown(accountId: number, userId: number): number {
  const key = `${accountId}-${userId}`;
  const lastUsed = clipCooldowns.get(key);
  
  if (!lastUsed) return 0;
  
  const settings = getClipSettings(accountId);
  const elapsed = (Date.now() - lastUsed) / 1000;
  const remaining = settings.cooldownSeconds - elapsed;
  
  return Math.max(0, Math.ceil(remaining));
}

/**
 * Set cooldown for user
 */
export function setCooldown(accountId: number, userId: number): void {
  const key = `${accountId}-${userId}`;
  clipCooldowns.set(key, Date.now());
}
