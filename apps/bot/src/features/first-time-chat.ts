import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('first-time-chatter');

// In-memory cache of known chatters per account (for performance)
// Map<accountId, Set<oderId>>
const knownChatters = new Map<number, Set<number>>();

// Settings per account
interface FirstTimeChatSettings {
  enabled: boolean;
  message: string; // Supports $(user) variable
}

const defaultSettings: FirstTimeChatSettings = {
  enabled: false,
  message: 'Welcome to the stream, $(user)! Enjoy your stay 💚',
};

class FirstTimeChatService {
  
  /**
   * Initialize cache for an account from existing users
   */
  async initializeAccount(accountId: number): Promise<void> {
    if (knownChatters.has(accountId)) return;
    
    // Load existing users from database
    const users = db.select({ oderId: schema.users.oderId })
      .from(schema.users)
      .where(eq(schema.users.accountId, accountId))
      .all();
    
    const userSet = new Set<number>();
    for (const user of users) {
      if (user.oderId) {
        userSet.add(user.oderId);
      }
    }
    
    knownChatters.set(accountId, userSet);
    log.info({ accountId, knownCount: userSet.size }, 'Initialized first-time chatter cache');
  }
  
  /**
   * Check if this is a user's first time chatting
   * Returns the welcome message if first time, null otherwise
   */
  async checkFirstTimeChatter(
    accountId: number,
    oderId: number,
    username: string
  ): Promise<string | null> {
    // Get settings
    const settings = this.getSettings(accountId);
    if (!settings.enabled) {
      return null;
    }
    
    // Initialize cache if needed
    if (!knownChatters.has(accountId)) {
      await this.initializeAccount(accountId);
    }
    
    const known = knownChatters.get(accountId)!;
    
    // Check if user is already known
    if (known.has(oderId)) {
      return null;
    }
    
    // First time! Add to cache
    known.add(oderId);
    
    log.info({ accountId, oderId, username }, '🆕 First time chatter detected!');
    
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
      .where(
        and(
          eq(schema.settings.key, `first_time_chat_${accountId}`)
        )
      )
      .get();
    
    if (row?.value) {
      try {
        return { ...defaultSettings, ...JSON.parse(row.value) };
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
   * Reset cache for an account (useful for testing)
   */
  resetCache(accountId: number): void {
    knownChatters.delete(accountId);
    log.info({ accountId }, 'First time chatter cache reset');
  }
}

export const firstTimeChatService = new FirstTimeChatService();
