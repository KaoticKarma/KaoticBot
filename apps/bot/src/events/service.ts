import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('events');

type EventType = 'follow' | 'subscription' | 'gifted_sub' | 'raid' | 'kick';

interface EventData {
  username: string;
  amount?: number;
  recipient?: string;
  message?: string;
}

class EventMessagesService {
  async initialize(): Promise<void> {
    log.info('Event messages service initialized');
  }

  // Get event messages for a specific account
  getMessagesForAccount(accountId: number): Map<EventType, { enabled: boolean; message: string }> {
    const messages = db.select()
      .from(schema.eventMessages)
      .where(eq(schema.eventMessages.accountId, accountId))
      .all();
    
    const map = new Map<EventType, { enabled: boolean; message: string }>();
    for (const msg of messages) {
      map.set(msg.eventType as EventType, {
        enabled: msg.enabled ?? true,
        message: msg.message,
      });
    }
    
    return map;
  }

  // Parse message template with variables
  private parseMessage(template: string, data: EventData): string {
    let result = template;
    
    // Replace variables
    result = result.replace(/\$\(user\)/gi, data.username);
    result = result.replace(/\$\(username\)/gi, data.username);
    result = result.replace(/\$\(amount\)/gi, this.formatNumber(data.amount || 0));
    result = result.replace(/\$\(recipient\)/gi, data.recipient || '');
    result = result.replace(/\$\(message\)/gi, data.message || '');
    
    return result;
  }

  // Format number with commas
  private formatNumber(num: number): string {
    return num.toLocaleString();
  }

  // Get formatted message for an event (to be sent by caller)
  getFormattedMessage(accountId: number, eventType: EventType, data: EventData): string | null {
    const messages = this.getMessagesForAccount(accountId);
    const config = messages.get(eventType);
    
    if (!config || !config.enabled) {
      log.debug({ eventType, accountId }, 'Event message disabled or not configured');
      return null;
    }

    return this.parseMessage(config.message, data);
  }

  // Event message getters
  getFollowMessage(accountId: number, username: string): string | null {
    return this.getFormattedMessage(accountId, 'follow', { username });
  }

  getSubscriptionMessage(accountId: number, username: string): string | null {
    return this.getFormattedMessage(accountId, 'subscription', { username });
  }

  getGiftedSubMessage(accountId: number, gifterUsername: string, amount: number, recipient?: string): string | null {
    return this.getFormattedMessage(accountId, 'gifted_sub', { 
      username: gifterUsername, 
      amount,
      recipient,
    });
  }

  getRaidMessage(accountId: number, username: string, viewerCount: number): string | null {
    return this.getFormattedMessage(accountId, 'raid', { 
      username, 
      amount: viewerCount,
    });
  }

  getKickMessage(accountId: number, username: string, amount: number, message?: string): string | null {
    return this.getFormattedMessage(accountId, 'kick', { 
      username, 
      amount,
      message,
    });
  }

  // CRUD operations for API
  getAll(accountId: number): typeof schema.eventMessages.$inferSelect[] {
    return db.select()
      .from(schema.eventMessages)
      .where(eq(schema.eventMessages.accountId, accountId))
      .all();
  }

  getByType(accountId: number, eventType: string): typeof schema.eventMessages.$inferSelect | undefined {
    return db.select()
      .from(schema.eventMessages)
      .where(eq(schema.eventMessages.accountId, accountId))
      .all()
      .find(m => m.eventType === eventType);
  }

  update(accountId: number, eventType: string, updates: { enabled?: boolean; message?: string }): typeof schema.eventMessages.$inferSelect | undefined {
    const existing = this.getByType(accountId, eventType);
    
    if (!existing) {
      // Create if doesn't exist
      const result = db.insert(schema.eventMessages)
        .values({
          accountId,
          eventType: eventType as EventType,
          enabled: updates.enabled ?? true,
          message: updates.message || '',
        })
        .returning()
        .get();
      
      return result;
    }

    db.update(schema.eventMessages)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(schema.eventMessages.id, existing.id))
      .run();

    return this.getByType(accountId, eventType);
  }
}

export const eventMessagesService = new EventMessagesService();
