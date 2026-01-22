import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('timers');

interface TimerState {
  id: number;
  lastTriggered: number;
  messagesSinceLastTrigger: number;
}

export class TimerManager {
  private timerStates: Map<number, TimerState> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private messageCount = 0;
  private sendMessage: (chatroomId: number, message: string) => Promise<any>;
  private chatroomId: number;

  constructor(chatroomId: number, sendMessage: (chatroomId: number, message: string) => Promise<any>) {
    this.chatroomId = chatroomId;
    this.sendMessage = sendMessage;
  }

  start(): void {
    log.info('Starting timer manager');
    this.loadTimers();
    
    // Check timers every 10 seconds
    this.checkInterval = setInterval(() => {
      this.checkTimers();
    }, 10000);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    log.info('Timer manager stopped');
  }

  // Call this whenever a chat message is received
  onChatMessage(): void {
    this.messageCount++;
    
    // Update message count for all timers
    for (const [timerId, state] of this.timerStates) {
      state.messagesSinceLastTrigger++;
    }
  }

  private loadTimers(): void {
    const timers = db.select().from(schema.timers).where(eq(schema.timers.enabled, true)).all();
    
    log.info({ count: timers.length }, 'Loaded active timers');
    
    for (const timer of timers) {
      this.timerStates.set(timer.id, {
        id: timer.id,
        lastTriggered: timer.lastTriggered ? new Date(timer.lastTriggered).getTime() : 0,
        messagesSinceLastTrigger: 0,
      });
    }
  }

  private async checkTimers(): Promise<void> {
    const timers = db.select().from(schema.timers).where(eq(schema.timers.enabled, true)).all();
    const now = Date.now();

    for (const timer of timers) {
      const state = this.timerStates.get(timer.id);
      if (!state) {
        // New timer added, initialize it
        this.timerStates.set(timer.id, {
          id: timer.id,
          lastTriggered: timer.lastTriggered ? new Date(timer.lastTriggered).getTime() : 0,
          messagesSinceLastTrigger: 0,
        });
        continue;
      }

      // Check if enough time has passed
      const timeSinceLastTrigger = now - state.lastTriggered;
      const intervalMs = timer.interval * 1000; // Convert seconds to milliseconds

      if (timeSinceLastTrigger < intervalMs) {
        continue; // Not enough time has passed
      }

      // Check if enough messages have been sent
      if (state.messagesSinceLastTrigger < timer.minChatLines) {
        continue; // Not enough chat activity
      }

      // Timer should fire!
      await this.fireTimer(timer, state);
    }
  }

  private async fireTimer(timer: any, state: TimerState): Promise<void> {
    try {
      log.info({ timerId: timer.id, name: timer.name }, 'Firing timer');
      
      // Send the message
      const result = await this.sendMessage(this.chatroomId, timer.message);
      
      if (result.success) {
        // Update state
        const now = Date.now();
        state.lastTriggered = now;
        state.messagesSinceLastTrigger = 0;

        // Update database
        db.update(schema.timers)
          .set({ lastTriggered: new Date(now).toISOString() })
          .where(eq(schema.timers.id, timer.id))
          .run();
        
        log.info({ timerId: timer.id, name: timer.name }, 'Timer fired successfully');
      } else {
        log.error({ timerId: timer.id, error: result.error }, 'Failed to send timer message');
      }
    } catch (error) {
      log.error({ timerId: timer.id, error }, 'Error firing timer');
    }
  }

  // Reload timers when they're updated via API
  reload(): void {
    log.info('Reloading timers');
    this.timerStates.clear();
    this.loadTimers();
  }
}
