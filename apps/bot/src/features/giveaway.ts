import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('giveaway');

interface GiveawayEntry {
  oderId: number;
  username: string;
  enteredAt: Date;
}

interface Giveaway {
  id: string;
  accountId: number;
  keyword: string;
  prize: string;
  startedBy: string;
  startedAt: Date;
  endsAt?: Date;
  status: 'active' | 'ended' | 'cancelled';
  entries: GiveawayEntry[];
  winners: GiveawayEntry[];
  settings: GiveawaySettings;
}

interface GiveawaySettings {
  subOnly: boolean;
  followerOnly: boolean;
  subLuck: number; // Multiplier for sub entries (e.g., 2 = double chance)
  minAccountAge?: number; // Minimum Kick account age in days
  preventReroll: boolean; // Winner can't win again on reroll
}

const defaultSettings: GiveawaySettings = {
  subOnly: false,
  followerOnly: false,
  subLuck: 1,
  preventReroll: true,
};

// Active giveaways per account (only one active at a time)
const activeGiveaways = new Map<number, Giveaway>();

// Giveaway history for persistence
const giveawayHistory = new Map<number, Giveaway[]>();

class GiveawayService {
  
  /**
   * Start a new giveaway
   */
  start(
    accountId: number,
    keyword: string,
    prize: string,
    startedBy: string,
    durationMinutes?: number,
    settings?: Partial<GiveawaySettings>
  ): { success: boolean; message: string } {
    // Check if giveaway already active
    if (activeGiveaways.has(accountId)) {
      const existing = activeGiveaways.get(accountId)!;
      return { 
        success: false, 
        message: `A giveaway is already active! Keyword: "${existing.keyword}". Use !giveaway end to finish it.`
      };
    }
    
    const giveaway: Giveaway = {
      id: `gw_${Date.now()}`,
      accountId,
      keyword: keyword.toLowerCase(),
      prize,
      startedBy,
      startedAt: new Date(),
      endsAt: durationMinutes ? new Date(Date.now() + durationMinutes * 60 * 1000) : undefined,
      status: 'active',
      entries: [],
      winners: [],
      settings: { ...defaultSettings, ...settings },
    };
    
    activeGiveaways.set(accountId, giveaway);
    
    log.info({ accountId, keyword, prize, durationMinutes }, '🎉 Giveaway started');
    
    let message = `🎉 GIVEAWAY STARTED! Prize: ${prize} | Type "${keyword}" to enter!`;
    if (durationMinutes) {
      message += ` | Ends in ${durationMinutes} minutes!`;
    }
    if (giveaway.settings.subOnly) {
      message += ' | 💎 Subscribers only!';
    } else if (giveaway.settings.subLuck > 1) {
      message += ` | 💎 Subs get ${giveaway.settings.subLuck}x luck!`;
    }
    
    // Auto-end timer
    if (durationMinutes) {
      setTimeout(() => {
        const current = activeGiveaways.get(accountId);
        if (current && current.id === giveaway.id && current.status === 'active') {
          log.info({ accountId, keyword }, 'Giveaway auto-ended by timer');
          // Note: Caller should handle announcing winner
        }
      }, durationMinutes * 60 * 1000);
    }
    
    return { success: true, message };
  }
  
  /**
   * Process a chat message to check for giveaway entries
   */
  processEntry(
    accountId: number,
    oderId: number,
    username: string,
    message: string,
    isSubscriber: boolean,
    isFollower: boolean
  ): { entered: boolean; message?: string } {
    const giveaway = activeGiveaways.get(accountId);
    
    if (!giveaway || giveaway.status !== 'active') {
      return { entered: false };
    }
    
    // Check if message matches keyword
    if (message.toLowerCase().trim() !== giveaway.keyword) {
      return { entered: false };
    }
    
    // Check requirements
    if (giveaway.settings.subOnly && !isSubscriber) {
      return { entered: false, message: `@${username} This giveaway is for subscribers only!` };
    }
    
    if (giveaway.settings.followerOnly && !isFollower) {
      return { entered: false, message: `@${username} You must be following to enter!` };
    }
    
    // Check if already entered
    const alreadyEntered = giveaway.entries.some(e => e.oderId === oderId);
    if (alreadyEntered) {
      return { entered: false }; // Silently ignore duplicate entries
    }
    
    // Add entry (with sub luck multiplier)
    const entry: GiveawayEntry = {
      oderId,
      username,
      enteredAt: new Date(),
    };
    
    // Add multiple entries for sub luck
    const numEntries = isSubscriber ? giveaway.settings.subLuck : 1;
    for (let i = 0; i < numEntries; i++) {
      giveaway.entries.push({ ...entry });
    }
    
    log.debug({ accountId, username, numEntries }, 'User entered giveaway');
    
    return { entered: true };
  }
  
  /**
   * Pick a winner
   */
  pickWinner(accountId: number): { success: boolean; message: string; winner?: GiveawayEntry } {
    const giveaway = activeGiveaways.get(accountId);
    
    if (!giveaway) {
      return { success: false, message: 'No active giveaway!' };
    }
    
    if (giveaway.entries.length === 0) {
      return { success: false, message: 'No entries in the giveaway! 😢' };
    }
    
    // Filter out previous winners if preventReroll is enabled
    let eligibleEntries = giveaway.entries;
    if (giveaway.settings.preventReroll && giveaway.winners.length > 0) {
      const winnerIds = new Set(giveaway.winners.map(w => w.oderId));
      eligibleEntries = giveaway.entries.filter(e => !winnerIds.has(e.oderId));
      
      if (eligibleEntries.length === 0) {
        return { success: false, message: 'No eligible entries remaining for reroll!' };
      }
    }
    
    // Pick random winner
    const winnerIndex = Math.floor(Math.random() * eligibleEntries.length);
    const winner = eligibleEntries[winnerIndex];
    
    giveaway.winners.push(winner);
    
    log.info({ accountId, winner: winner.username, totalEntries: giveaway.entries.length }, '🏆 Giveaway winner picked');
    
    // Get unique entrant count
    const uniqueEntrants = new Set(giveaway.entries.map(e => e.oderId)).size;
    
    const message = `🎉 CONGRATULATIONS @${winner.username}! You won: ${giveaway.prize}! (${uniqueEntrants} entered)`;
    
    return { success: true, message, winner };
  }
  
  /**
   * End the giveaway and pick winner
   */
  end(accountId: number): { success: boolean; message: string; winner?: GiveawayEntry } {
    const giveaway = activeGiveaways.get(accountId);
    
    if (!giveaway) {
      return { success: false, message: 'No active giveaway!' };
    }
    
    const result = this.pickWinner(accountId);
    
    // Mark as ended and archive
    giveaway.status = 'ended';
    this.archiveGiveaway(accountId, giveaway);
    activeGiveaways.delete(accountId);
    
    return result;
  }
  
  /**
   * Reroll for a new winner
   */
  reroll(accountId: number): { success: boolean; message: string; winner?: GiveawayEntry } {
    // Check active first, then check last archived
    let giveaway = activeGiveaways.get(accountId);
    
    if (!giveaway) {
      // Check history for last giveaway
      const history = giveawayHistory.get(accountId);
      if (history && history.length > 0) {
        giveaway = history[history.length - 1];
      }
    }
    
    if (!giveaway) {
      return { success: false, message: 'No giveaway to reroll!' };
    }
    
    if (giveaway.entries.length === 0) {
      return { success: false, message: 'No entries to reroll from!' };
    }
    
    // Pick new winner
    let eligibleEntries = giveaway.entries;
    if (giveaway.settings.preventReroll && giveaway.winners.length > 0) {
      const winnerIds = new Set(giveaway.winners.map(w => w.oderId));
      eligibleEntries = giveaway.entries.filter(e => !winnerIds.has(e.oderId));
      
      if (eligibleEntries.length === 0) {
        return { success: false, message: 'No eligible entries remaining for reroll!' };
      }
    }
    
    const winnerIndex = Math.floor(Math.random() * eligibleEntries.length);
    const winner = eligibleEntries[winnerIndex];
    
    giveaway.winners.push(winner);
    
    log.info({ accountId, winner: winner.username }, '🔄 Giveaway rerolled');
    
    return { 
      success: true, 
      message: `🔄 REROLL! New winner: @${winner.username}! Congratulations! 🎉`,
      winner
    };
  }
  
  /**
   * Cancel the active giveaway
   */
  cancel(accountId: number): { success: boolean; message: string } {
    const giveaway = activeGiveaways.get(accountId);
    
    if (!giveaway) {
      return { success: false, message: 'No active giveaway to cancel!' };
    }
    
    giveaway.status = 'cancelled';
    this.archiveGiveaway(accountId, giveaway);
    activeGiveaways.delete(accountId);
    
    log.info({ accountId, entries: giveaway.entries.length }, 'Giveaway cancelled');
    
    return { success: true, message: '❌ Giveaway cancelled!' };
  }
  
  /**
   * Get giveaway status
   */
  status(accountId: number): string {
    const giveaway = activeGiveaways.get(accountId);
    
    if (!giveaway) {
      return 'No active giveaway. Start one with !giveaway start <keyword> <prize>';
    }
    
    const uniqueEntrants = new Set(giveaway.entries.map(e => e.oderId)).size;
    let status = `🎉 Active Giveaway: "${giveaway.prize}" | Keyword: "${giveaway.keyword}" | Entries: ${uniqueEntrants}`;
    
    if (giveaway.endsAt) {
      const remaining = Math.max(0, giveaway.endsAt.getTime() - Date.now());
      const minutes = Math.ceil(remaining / 60000);
      status += ` | Ends in: ${minutes}m`;
    }
    
    return status;
  }
  
  /**
   * Get entry count
   */
  getEntryCount(accountId: number): number {
    const giveaway = activeGiveaways.get(accountId);
    if (!giveaway) return 0;
    return new Set(giveaway.entries.map(e => e.oderId)).size;
  }
  
  /**
   * Check if giveaway is active
   */
  isActive(accountId: number): boolean {
    return activeGiveaways.has(accountId);
  }
  
  /**
   * Archive a giveaway to history
   */
  private archiveGiveaway(accountId: number, giveaway: Giveaway): void {
    if (!giveawayHistory.has(accountId)) {
      giveawayHistory.set(accountId, []);
    }
    
    const history = giveawayHistory.get(accountId)!;
    history.push(giveaway);
    
    // Keep only last 10 giveaways
    if (history.length > 10) {
      history.shift();
    }
  }
}

export const giveawayService = new GiveawayService();
