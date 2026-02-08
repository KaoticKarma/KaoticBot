import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('queue');

interface QueueEntry {
  oderId: number;
  username: string;
  joinedAt: Date;
  note?: string; // Slot name / gamertag
}

interface QueueSettings {
  enabled: boolean;
  maxSize: number;
  subPriority: boolean; // Subs get moved to front
  allowRejoin: boolean; // Can rejoin after being picked
  joinMessage: string;
  leaveMessage: string;
  nextMessage: string;
  emptyMessage: string;
}

const defaultSettings: QueueSettings = {
  enabled: true,
  maxSize: 50,
  subPriority: false,
  allowRejoin: true,
  joinMessage: '@$(user) joined the queue at position #$(position) with slot: $(note)',
  leaveMessage: '$(user) left the queue.',
  nextMessage: '🎮 Next up: $(user) — Slot: $(note)!',
  emptyMessage: 'The queue is empty!',
};

// In-memory queues per account
// Map<accountId, QueueEntry[]>
const queues = new Map<number, QueueEntry[]>();

// Track users who have been picked (for allowRejoin setting)
const pickedUsers = new Map<number, Set<number>>();

class QueueService {
  
  /**
   * Get queue for an account
   */
  getQueue(accountId: number): QueueEntry[] {
    if (!queues.has(accountId)) {
      queues.set(accountId, []);
    }
    return queues.get(accountId)!;
  }
  
  /**
   * Get settings for an account
   */
  getSettings(accountId: number): QueueSettings {
    const row = db.select()
      .from(schema.settings)
      .where(eq(schema.settings.key, `queue_settings_${accountId}`))
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
  async updateSettings(accountId: number, updates: Partial<QueueSettings>): Promise<QueueSettings> {
    const current = this.getSettings(accountId);
    const newSettings = { ...current, ...updates };
    
    const key = `queue_settings_${accountId}`;
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
    
    log.info({ accountId, settings: newSettings }, 'Queue settings updated');
    return newSettings;
  }
  
  /**
   * Join the queue
   */
  join(
    accountId: number,
    oderId: number,
    username: string,
    isSubscriber: boolean,
    note?: string
  ): { success: boolean; message: string; position?: number } {
    const settings = this.getSettings(accountId);
    
    if (!settings.enabled) {
      return { success: false, message: '🚫 Slot Requests are currently closed.' };
    }
    
    // Require a slot name
    if (!note || note.trim() === '') {
      return { success: false, message: `@${username} Please provide a slot name! Usage: !sr (Slot Name)` };
    }
    
    const queue = this.getQueue(accountId);
    
    // Check if already in queue
    const existingIndex = queue.findIndex(e => e.oderId === oderId);
    if (existingIndex !== -1) {
      return { success: false, message: `@${username} You're already in the queue at position #${existingIndex + 1}!` };
    }
    
    // Check if was already picked and rejoin is disabled
    if (!settings.allowRejoin) {
      const picked = pickedUsers.get(accountId);
      if (picked?.has(oderId)) {
        return { success: false, message: `@${username} You've already been picked! You can't rejoin this session.` };
      }
    }
    
    // Check max size
    if (queue.length >= settings.maxSize) {
      return { success: false, message: `@${username} The queue is full! (Max: ${settings.maxSize})` };
    }
    
    // Create entry
    const entry: QueueEntry = {
      oderId,
      username,
      joinedAt: new Date(),
      note: note.trim(),
    };
    
    // Add to queue (sub priority or end)
    let position: number;
    if (settings.subPriority && isSubscriber) {
      // Find first non-sub position
      const firstNonSubIndex = queue.findIndex(e => !e.note?.includes('[SUB]'));
      if (firstNonSubIndex === -1) {
        queue.push(entry);
        position = queue.length;
      } else {
        queue.splice(firstNonSubIndex, 0, entry);
        position = firstNonSubIndex + 1;
      }
      // Preserve original note but mark as sub internally
      entry.note = `[SUB] ${entry.note}`;
    } else {
      queue.push(entry);
      position = queue.length;
    }
    
    log.info({ accountId, username, position, note: entry.note }, 'User joined queue');
    
    // Build message
    let message = settings.joinMessage;
    message = message.replace(/\$\(user\)/gi, `@${username}`);
    message = message.replace(/\$\(position\)/gi, position.toString());
    message = message.replace(/\$\(size\)/gi, queue.length.toString());
    message = message.replace(/\$\(note\)/gi, note.trim());
    
    return { success: true, message, position };
  }
  
  /**
   * Leave the queue
   */
  leave(accountId: number, oderId: number, username: string): { success: boolean; message: string } {
    const settings = this.getSettings(accountId);
    const queue = this.getQueue(accountId);
    
    const index = queue.findIndex(e => e.oderId === oderId);
    if (index === -1) {
      return { success: false, message: `@${username} You're not in the queue!` };
    }
    
    queue.splice(index, 1);
    
    log.info({ accountId, username }, 'User left queue');
    
    let message = settings.leaveMessage;
    message = message.replace(/\$\(user\)/gi, `@${username}`);
    
    return { success: true, message };
  }
  
  /**
   * Get next person from queue (mod only)
   */
  next(accountId: number): { success: boolean; message: string; entry?: QueueEntry } {
    const settings = this.getSettings(accountId);
    const queue = this.getQueue(accountId);
    
    if (queue.length === 0) {
      return { success: false, message: settings.emptyMessage };
    }
    
    const entry = queue.shift()!;
    
    // Track picked users
    if (!pickedUsers.has(accountId)) {
      pickedUsers.set(accountId, new Set());
    }
    pickedUsers.get(accountId)!.add(entry.oderId);
    
    log.info({ accountId, username: entry.username, note: entry.note }, 'User picked from queue');
    
    // Clean note (strip [SUB] prefix if present)
    const cleanNote = entry.note?.replace(/^\[SUB\]\s*/, '') || '';
    
    let message = settings.nextMessage;
    message = message.replace(/\$\(user\)/gi, `@${entry.username}`);
    message = message.replace(/\$\(note\)/gi, cleanNote);
    message = message.replace(/\$\(remaining\)/gi, queue.length.toString());
    
    return { success: true, message, entry };
  }
  
  /**
   * Get user's position
   */
  position(accountId: number, oderId: number, username: string): string {
    const queue = this.getQueue(accountId);
    const index = queue.findIndex(e => e.oderId === oderId);
    
    if (index === -1) {
      return `@${username} You're not in the queue! Use !sr (Slot Name) to enter.`;
    }
    
    return `@${username} You're at position #${index + 1} of ${queue.length} in the queue.`;
  }
  
  /**
   * List the queue
   */
  list(accountId: number, limit: number = 5): string {
    const queue = this.getQueue(accountId);
    
    if (queue.length === 0) {
      return 'The queue is empty! Use !sr (Slot Name) to enter.';
    }
    
    const shown = queue.slice(0, limit);
    const entries = shown.map((e, i) => {
      const cleanNote = e.note?.replace(/^\[SUB\]\s*/, '') || '';
      return `#${i + 1} ${e.username}${cleanNote ? ` (${cleanNote})` : ''}`;
    }).join(', ');
    
    if (queue.length > limit) {
      return `📋 Queue (${queue.length}): ${entries}... and ${queue.length - limit} more`;
    }
    
    return `📋 Queue (${queue.length}): ${entries}`;
  }
  
  /**
   * Clear the queue (mod only)
   */
  clear(accountId: number): string {
    const queue = this.getQueue(accountId);
    const count = queue.length;
    queue.length = 0;
    
    // Also reset picked users
    pickedUsers.delete(accountId);
    
    log.info({ accountId, cleared: count }, 'Queue cleared');
    
    return `Queue cleared! (Removed ${count} entries)`;
  }
  
  /**
   * Open/close the queue
   */
  async setEnabled(accountId: number, enabled: boolean): Promise<string> {
    await this.updateSettings(accountId, { enabled });
    return enabled ? '✅ Slot Requests are now OPEN! Use !sr (Slot Name) to enter.' : '🚫 Slot Requests are now CLOSED.';
  }
  
  /**
   * Get queue size
   */
  size(accountId: number): number {
    return this.getQueue(accountId).length;
  }
}

export const queueService = new QueueService();
