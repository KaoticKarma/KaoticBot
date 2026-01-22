import { db, schema } from '../db/index.js';
import { eq, and, gt, lte } from 'drizzle-orm';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('moderation');

export type ModerationAction = 'none' | 'delete' | 'timeout' | 'ban';
export type FilterType = 'link' | 'caps' | 'spam' | 'symbol' | 'banned_word' | 'manual';
export type UserLevel = 'everyone' | 'follower' | 'subscriber' | 'vip' | 'moderator' | 'broadcaster';

export interface ModerationResult {
  shouldAct: boolean;
  action: ModerationAction;
  reason: string;
  filterType: FilterType | null;
  duration?: number;
}

export interface UserContext {
  id: number;
  username: string;
  level: UserLevel;
  isBroadcaster: boolean;
  isModerator: boolean;
  isVip: boolean;
  isSubscriber: boolean;
  isFollower: boolean;
}

// URL regex pattern
const URL_REGEX = /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

class ModerationService {
  async initialize(): Promise<void> {
    // Cleanup expired permits periodically
    setInterval(() => this.cleanupExpiredPermits(), 60000);
    log.info('Moderation service initialized');
  }

  // Get settings for a specific account
  getSettingsForAccount(accountId: number): typeof schema.moderationSettings.$inferSelect | null {
    return db.select()
      .from(schema.moderationSettings)
      .where(eq(schema.moderationSettings.accountId, accountId))
      .get() || null;
  }

  // Get banned words for a specific account
  getBannedWordsForAccount(accountId: number): typeof schema.bannedWords.$inferSelect[] {
    return db.select()
      .from(schema.bannedWords)
      .where(eq(schema.bannedWords.accountId, accountId))
      .all();
  }

  // Check if user level meets or exceeds required level
  private meetsLevel(userLevel: UserLevel, requiredLevel: UserLevel): boolean {
    const levels: UserLevel[] = ['everyone', 'follower', 'subscriber', 'vip', 'moderator', 'broadcaster'];
    return levels.indexOf(userLevel) >= levels.indexOf(requiredLevel);
  }

  // Main moderation check - runs all filters
  async checkMessage(accountId: number, content: string, user: UserContext): Promise<ModerationResult> {
    const settings = this.getSettingsForAccount(accountId);
    
    if (!settings) {
      return { shouldAct: false, action: 'none', reason: '', filterType: null };
    }

    // Broadcasters and mods are always exempt
    if (user.isBroadcaster || user.isModerator) {
      return { shouldAct: false, action: 'none', reason: '', filterType: null };
    }

    // Check banned words first (highest priority)
    if (settings.bannedWordsEnabled) {
      const result = this.checkBannedWords(accountId, content);
      if (result.shouldAct) return result;
    }

    // Check links
    if (settings.linkFilterEnabled) {
      const result = await this.checkLinks(accountId, settings, content, user);
      if (result.shouldAct) return result;
    }

    // Check caps
    if (settings.capsFilterEnabled) {
      const result = this.checkCaps(settings, content, user);
      if (result.shouldAct) return result;
    }

    // Check spam
    if (settings.spamFilterEnabled) {
      const result = this.checkSpam(settings, content, user);
      if (result.shouldAct) return result;
    }

    // Check symbols
    if (settings.symbolFilterEnabled) {
      const result = this.checkSymbols(settings, content, user);
      if (result.shouldAct) return result;
    }

    return { shouldAct: false, action: 'none', reason: '', filterType: null };
  }

  // Banned words filter
  private checkBannedWords(accountId: number, content: string): ModerationResult {
    const bannedWords = this.getBannedWordsForAccount(accountId);
    
    for (const word of bannedWords) {
      if (!word.enabled) continue;
      
      try {
        let regex: RegExp;
        if (word.isRegex) {
          regex = new RegExp(word.word, 'gi');
        } else {
          const escaped = word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          regex = new RegExp(`\\b${escaped}\\b`, 'gi');
        }
        
        if (regex.test(content)) {
          return {
            shouldAct: true,
            action: word.action as ModerationAction,
            reason: `Banned word/phrase detected`,
            filterType: 'banned_word',
            duration: word.timeoutDuration,
          };
        }
      } catch (err) {
        log.warn({ word: word.word, err }, 'Invalid regex pattern in banned words');
      }
    }
    
    return { shouldAct: false, action: 'none', reason: '', filterType: null };
  }

  // Link filter
  private async checkLinks(
    accountId: number,
    settings: typeof schema.moderationSettings.$inferSelect,
    content: string, 
    user: UserContext
  ): Promise<ModerationResult> {
    // Check if user level is exempt
    if (this.meetsLevel(user.level, settings.linkPermitLevel as UserLevel)) {
      return { shouldAct: false, action: 'none', reason: '', filterType: null };
    }

    // Check for permit
    const hasPermit = await this.hasPermit(accountId, user.id, 'link');
    if (hasPermit) {
      return { shouldAct: false, action: 'none', reason: '', filterType: null };
    }

    // Find URLs in message
    const urls = content.match(URL_REGEX);
    if (!urls || urls.length === 0) {
      return { shouldAct: false, action: 'none', reason: '', filterType: null };
    }

    // Check against whitelist
    const whitelist = settings.linkWhitelist || [];
    for (const url of urls) {
      const isWhitelisted = whitelist.some(domain => {
        const normalizedUrl = url.toLowerCase();
        const normalizedDomain = domain.toLowerCase();
        return normalizedUrl.includes(normalizedDomain);
      });
      
      if (!isWhitelisted) {
        return {
          shouldAct: true,
          action: settings.linkFilterAction as ModerationAction,
          reason: 'Unauthorized link posted',
          filterType: 'link',
          duration: settings.linkTimeoutDuration,
        };
      }
    }

    return { shouldAct: false, action: 'none', reason: '', filterType: null };
  }

  // Caps filter
  private checkCaps(
    settings: typeof schema.moderationSettings.$inferSelect,
    content: string, 
    user: UserContext
  ): ModerationResult {
    // Check if user level is exempt
    if (this.meetsLevel(user.level, settings.capsPermitLevel as UserLevel)) {
      return { shouldAct: false, action: 'none', reason: '', filterType: null };
    }

    // Remove non-letters for counting
    const letters = content.replace(/[^a-zA-Z]/g, '');
    
    if (letters.length < settings.capsMinLength) {
      return { shouldAct: false, action: 'none', reason: '', filterType: null };
    }

    const capsCount = (letters.match(/[A-Z]/g) || []).length;
    const capsPercent = (capsCount / letters.length) * 100;

    if (capsPercent >= settings.capsThreshold) {
      return {
        shouldAct: true,
        action: settings.capsFilterAction as ModerationAction,
        reason: `Excessive caps (${Math.round(capsPercent)}%)`,
        filterType: 'caps',
        duration: settings.capsTimeoutDuration,
      };
    }

    return { shouldAct: false, action: 'none', reason: '', filterType: null };
  }

  // Spam filter (repeated characters, words, emotes)
  private checkSpam(
    settings: typeof schema.moderationSettings.$inferSelect,
    content: string, 
    user: UserContext
  ): ModerationResult {
    // Check if user level is exempt
    if (this.meetsLevel(user.level, settings.spamPermitLevel as UserLevel)) {
      return { shouldAct: false, action: 'none', reason: '', filterType: null };
    }

    const maxRepeats = settings.spamMaxRepeats;
    const maxEmotes = settings.spamMaxEmotes;

    // Check for repeated characters (e.g., "aaaaaaa")
    const repeatedCharsRegex = new RegExp(`(.)\\1{${maxRepeats},}`, 'gi');
    if (repeatedCharsRegex.test(content)) {
      return {
        shouldAct: true,
        action: settings.spamFilterAction as ModerationAction,
        reason: 'Repeated characters spam',
        filterType: 'spam',
        duration: settings.spamTimeoutDuration,
      };
    }

    // Check for repeated words
    const words = content.toLowerCase().split(/\s+/);
    const wordCounts = new Map<string, number>();
    for (const word of words) {
      if (word.length > 2) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }
    
    for (const [word, count] of wordCounts) {
      if (count > maxRepeats) {
        return {
          shouldAct: true,
          action: settings.spamFilterAction as ModerationAction,
          reason: `Repeated word spam ("${word}" x${count})`,
          filterType: 'spam',
          duration: settings.spamTimeoutDuration,
        };
      }
    }

    // Check emote count (basic emoji + Kick emote detection)
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|:\w+:/gu;
    const emotes = content.match(emojiRegex) || [];
    if (emotes.length > maxEmotes) {
      return {
        shouldAct: true,
        action: settings.spamFilterAction as ModerationAction,
        reason: `Emote spam (${emotes.length} emotes)`,
        filterType: 'spam',
        duration: settings.spamTimeoutDuration,
      };
    }

    return { shouldAct: false, action: 'none', reason: '', filterType: null };
  }

  // Symbol filter
  private checkSymbols(
    settings: typeof schema.moderationSettings.$inferSelect,
    content: string, 
    user: UserContext
  ): ModerationResult {
    // Check if user level is exempt
    if (this.meetsLevel(user.level, settings.symbolPermitLevel as UserLevel)) {
      return { shouldAct: false, action: 'none', reason: '', filterType: null };
    }

    if (content.length < settings.symbolMinLength) {
      return { shouldAct: false, action: 'none', reason: '', filterType: null };
    }

    // Count symbols (non-alphanumeric, non-space, non-emoji)
    const textOnly = content.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
    const symbols = (textOnly.match(/[^a-zA-Z0-9\s]/g) || []).length;
    const symbolPercent = (symbols / textOnly.length) * 100;

    if (symbolPercent >= settings.symbolThreshold) {
      return {
        shouldAct: true,
        action: settings.symbolFilterAction as ModerationAction,
        reason: `Excessive symbols (${Math.round(symbolPercent)}%)`,
        filterType: 'symbol',
        duration: settings.symbolTimeoutDuration,
      };
    }

    return { shouldAct: false, action: 'none', reason: '', filterType: null };
  }

  // Permit management
  async grantPermit(accountId: number, userId: number, username: string, type: 'link' | 'all', grantedBy: string, durationSeconds: number = 60): Promise<void> {
    const expiresAt = new Date(Date.now() + durationSeconds * 1000);
    
    db.insert(schema.permits).values({
      accountId,
      userId,
      username,
      permitType: type,
      expiresAt,
      grantedBy,
    }).run();
    
    log.info({ accountId, userId, username, type, expiresAt, grantedBy }, 'Permit granted');
  }

  async hasPermit(accountId: number, userId: number, type: 'link' | 'all'): Promise<boolean> {
    const now = new Date();
    
    const permit = db.select()
      .from(schema.permits)
      .where(and(
        eq(schema.permits.accountId, accountId),
        eq(schema.permits.userId, userId),
        gt(schema.permits.expiresAt, now)
      ))
      .get();
    
    if (!permit) return false;
    
    return permit.permitType === 'all' || permit.permitType === type;
  }

  private cleanupExpiredPermits(): void {
    const now = new Date();
    const result = db.delete(schema.permits)
      .where(lte(schema.permits.expiresAt, now))
      .run();
    
    if (result.changes > 0) {
      log.debug({ count: result.changes }, 'Cleaned up expired permits');
    }
  }

  // Log moderation action
  logAction(accountId: number, data: {
    targetUserId: number;
    targetUsername: string;
    moderatorUserId?: number;
    moderatorUsername?: string;
    action: ModerationAction;
    reason?: string;
    duration?: number;
    messageContent?: string;
    messageId?: string;
    filterType?: FilterType;
  }): void {
    db.insert(schema.modLogs).values({
      accountId,
      targetUserId: data.targetUserId,
      targetUsername: data.targetUsername,
      moderatorUserId: data.moderatorUserId,
      moderatorUsername: data.moderatorUsername || 'ChaosSquadBot',
      action: data.action,
      reason: data.reason,
      duration: data.duration,
      messageContent: data.messageContent,
      messageId: data.messageId,
      filterType: data.filterType,
    }).run();
    
    log.info({
      target: data.targetUsername,
      action: data.action,
      reason: data.reason,
      filter: data.filterType,
    }, 'Moderation action logged');
  }
}

export const moderationService = new ModerationService();
