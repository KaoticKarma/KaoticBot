import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('first-time-chatter');

// In-memory cache for fast lookups (loaded from DB on init)
// Map<accountId, Set<kickUserId>>
const knownChattersCache = new Map<number, Set<number>>();

// Settings per account
interface FirstTimeChatSettings {
  enabled: boolean;
  message: string;
}

const defaultSettings: FirstTimeChatSettings = {
  enabled: false,
  message: 'Welcome to the stream, $(user)! Enjoy your stay 💚',
};

class FirstTimeChatService {
  
  /**
   * Initialize cache for an account from database
   */
  async initializeAccount(accountId: number): Promise<void> {
    if (knownChattersCache.has(accountId)) return;
    
    // Load existing known chatters from database
    const chatters = db.select({ kickUserId: schema.knownChatters.kickUserId })
      .from(schema.knownChatters)
      .where(eq(schema.knownChatters.accountId, accountId))
      .all();
    
    const userSet = new Set<number>();
    for (const chatter of chatters) {
      userSet.add(chatter.kickUserId);
    }
    
    knownChattersCache.set(accountId, userSet);
    log.info({ accountId, knownCount: userSet.size }, 'Initialized first-time chatter cache from database');
  }
  
  /**
   * Check if this is a user's first time chatting EVER in this channel
   * Returns the welcome message if first time, null otherwise
   */
  async checkFirstTimeChatter(
    accountId: number,
    kickUserId: number,
    username: string
  ): Promise<string | null> {
    // Get settings
    const settings = this.getSettings(accountId);
    if (!settings.enabled) {
      return null;
    }
    
    // Initialize cache if needed
    if (!knownChattersCache.has(accountId)) {
      await this.initializeAccount(accountId);
    }
    
    const known = knownChattersCache.get(accountId)!;
    
    // Check if user is already known
    if (known.has(kickUserId)) {
      return null;
    }
    
    // First time ever! Add to cache and database
    known.add(kickUserId);
    
    // Insert into database for persistence
    try {
      db.insert(schema.knownChatters)
        .values({ accountId, kickUserId })
        .run();
    } catch (error) {
      // Might fail on duplicate if race condition, that's fine
      log.debug({ accountId, kickUserId, error }, 'Insert known chatter (may be duplicate)');
    }
    
    log.info({ accountId, kickUserId, username }, '🆕 First time chatter detected!');
    
    // Build welcome message
    let message = settings.message;
    message = message.replace(/\$\(user\)/gi, `@${username}`);
    message = message.replace(/\$\(name\)/gi, username);
    
    return message;
  }
  
  /**
   * Get settings for an account
   */
  getSettings(accountId: number): FirstTimeChatSettings {
    const row = db.select()
      .from(schema.settings)
      .where(eq(schema.settings.key, `first_time_chat_${accountId}`))
      .get();
    
    if (row?.value) {
      try {
        return { ...defaultSettings, ...JSON.parse(row.value as string) };
      } catch {
        return defaultSettings;
      }
    }
    
    return defaultSettings;
  }
  
  /**
   * Update settings for an account
   */
  async updateSettings(accountId: number, updates: Partial<FirstTimeChatSettings>): Promise<FirstTimeChatSettings> {
    const current = this.getSettings(accountId);
    const newSettings = { ...current, ...updates };
    
    const key = `first_time_chat_${accountId}`;
    const value = JSON.stringify(newSettings);
    
    const existing = db.select()
      .from(schema.settings)
      .where(eq(schema.settings.key, key))
      .get();
    
    if (existing) {
      db.update(schema.settings)
        .set({ value })
        .where(eq(schema.settings.key, key))
        .run();
    } else {
      db.insert(schema.settings)
        .values({ key, value })
        .run();
    }
    
    log.info({ accountId, settings: newSettings }, 'First time chat settings updated');
    return newSettings;
  }
  
  /**
   * Reset all known chatters for an account (clears DB and cache)
   * Use with caution - everyone will be welcomed again!
   */
  resetCache(accountId: number): void {
    // Clear from database
    db.delete(schema.knownChatters)
      .where(eq(schema.knownChatters.accountId, accountId))
      .run();
    
    // Clear from cache
    knownChattersCache.set(accountId, new Set());
    
    log.info({ accountId }, 'First time chatter data reset - all chatters cleared');
  }
  
  /**
   * Get count of known chatters for an account
   */
  getKnownChatterCount(accountId: number): number {
    const result = db.select({ kickUserId: schema.knownChatters.kickUserId })
      .from(schema.knownChatters)
      .where(eq(schema.knownChatters.accountId, accountId))
      .all();
    return result.length;
  }
}

export const firstTimeChatService = new FirstTimeChatService();
