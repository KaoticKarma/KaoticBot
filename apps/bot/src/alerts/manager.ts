import { EventEmitter } from 'events';
import { db, schema } from '../db/index.js';
import { and, eq } from 'drizzle-orm';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('alerts');

export interface AlertData {
  id: number;
  accountId: number | null;
  type: 'follow' | 'subscription' | 'gifted_sub' | 'raid' | 'tip' | 'kick';
  minAmount: number;
  maxAmount: number | null;
  message: string;
  sound: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  duration: number;
  enabled: boolean;
  // Styling fields
  layout: string;
  animation: string;
  volume: number;
  topTextColor: string;
  bottomTextColor: string;
  font: string;
  textPositionY: number;
  // Custom code fields
  customCodeEnabled: boolean;
  customHtml: string | null;
  customCss: string | null;
  customJs: string | null;
}

export interface TriggeredAlert extends AlertData {
  triggeredAt: number;
  username: string;
  amount?: number;
  customMessage?: string;
  variables?: {
    name: string;
    text: string;
    sound: string;
    image: string;
    amount: string;
    message: string;
  };
}

export class AlertsManager extends EventEmitter {
  private alertQueues: Map<number, TriggeredAlert[]> = new Map();
  private currentAlerts: Map<number, TriggeredAlert | null> = new Map();
  private processingFlags: Map<number, boolean> = new Map();

  constructor() {
    super();
  }

  // Get account ID from widget token
  getAccountIdFromToken(token: string): number | null {
    try {
      const row = db.select().from(schema.widgetTokens).where(eq(schema.widgetTokens.token, token)).get();
      return row ? row.accountId : null;
    } catch (error) {
      log.error({ error, token }, 'Failed to look up token');
      return null;
    }
  }

  triggerFollow(accountId: number, username: string): void {
    const alert = this.findMatchingAlert(accountId, 'follow', 1);
    if (alert) {
      const customMessage = alert.message.replace('{user}', username);
      this.queueAlert(accountId, {
        ...alert,
        triggeredAt: Date.now(),
        username,
        customMessage,
        variables: {
          name: username,
          text: customMessage,
          sound: alert.sound || '',
          image: alert.imageUrl || '',
          amount: '1',
          message: alert.message,
        },
      });
    }
  }

  triggerSubscription(accountId: number, username: string, months: number): void {
    const alert = this.findMatchingAlert(accountId, 'subscription', months);
    if (alert) {
      const customMessage = alert.message.replace('{user}', username).replace('{months}', months.toString());
      this.queueAlert(accountId, {
        ...alert,
        triggeredAt: Date.now(),
        username,
        amount: months,
        customMessage,
        variables: {
          name: username,
          text: customMessage,
          sound: alert.sound || '',
          image: alert.imageUrl || '',
          amount: months.toString(),
          message: alert.message,
        },
      });
    }
  }

  triggerGiftedSub(accountId: number, username: string, giftedBy: string, count: number): void {
    const alert = this.findMatchingAlert(accountId, 'gifted_sub', count);
    if (alert) {
      const customMessage = alert.message.replace('{user}', username).replace('{gifter}', giftedBy).replace('{count}', count.toString());
      this.queueAlert(accountId, {
        ...alert,
        triggeredAt: Date.now(),
        username: giftedBy,
        amount: count,
        customMessage,
        variables: {
          name: giftedBy,
          text: customMessage,
          sound: alert.sound || '',
          image: alert.imageUrl || '',
          amount: count.toString(),
          message: alert.message,
        },
      });
    }
  }

  triggerRaid(accountId: number, username: string, viewers: number): void {
    const alert = this.findMatchingAlert(accountId, 'raid', viewers);
    if (alert) {
      const customMessage = alert.message.replace('{user}', username).replace('{viewers}', viewers.toString());
      this.queueAlert(accountId, {
        ...alert,
        triggeredAt: Date.now(),
        username,
        amount: viewers,
        customMessage,
        variables: {
          name: username,
          text: customMessage,
          sound: alert.sound || '',
          image: alert.imageUrl || '',
          amount: viewers.toString(),
          message: alert.message,
        },
      });
    }
  }

  triggerTip(accountId: number, username: string, amount: number): void {
    const alert = this.findMatchingAlert(accountId, 'tip', amount);
    if (alert) {
      const customMessage = alert.message.replace('{user}', username).replace('{amount}', amount.toFixed(2));
      this.queueAlert(accountId, {
        ...alert,
        triggeredAt: Date.now(),
        username,
        amount,
        customMessage,
        variables: {
          name: username,
          text: customMessage,
          sound: alert.sound || '',
          image: alert.imageUrl || '',
          amount: amount.toFixed(2),
          message: alert.message,
        },
      });
    }
  }

  triggerKick(accountId: number, username: string, count: number): void {
    const alert = this.findMatchingAlert(accountId, 'kick', count);
    if (alert) {
      const customMessage = alert.message.replace('{user}', username).replace('{count}', count.toString());
      this.queueAlert(accountId, {
        ...alert,
        triggeredAt: Date.now(),
        username,
        amount: count,
        customMessage,
        variables: {
          name: username,
          text: customMessage,
          sound: alert.sound || '',
          image: alert.imageUrl || '',
          amount: count.toString(),
          message: alert.message,
        },
      });
    }
  }

  private findMatchingAlert(accountId: number, type: string, amount: number): AlertData | null {
    try {
      // Note: SQLite stores booleans as 0/1, so we check for truthy value
      const alerts = db.select().from(schema.alerts)
        .where(and(
          eq(schema.alerts.accountId, accountId),
          eq(schema.alerts.type, type)
        ))
        .all()
        .filter(a => a.enabled); // Filter in JS to handle SQLite 0/1

      log.info({ accountId, type, amount, alertsFound: alerts.length, alertIds: alerts.map(a => a.id) }, 'Finding matching alert');

      if (alerts.length === 0) return null;

      const matchingAlerts = alerts.filter((alert) => {
        const min = alert.minAmount;
        const max = alert.maxAmount;
        return amount >= min && (max === null || amount <= max);
      });

      log.info({ matchingCount: matchingAlerts.length, matchingIds: matchingAlerts.map(a => a.id) }, 'Alerts matching amount criteria');

      if (matchingAlerts.length === 0) return null;
      matchingAlerts.sort((a, b) => b.minAmount - a.minAmount);
      
      const alert = matchingAlerts[0];
      log.info({ 
        selectedAlertId: alert.id, 
        message: alert.message,
        videoUrl: alert.videoUrl,
        imageUrl: alert.imageUrl 
      }, 'Selected alert for trigger');
      
      return {
        id: alert.id,
        accountId: alert.accountId,
        type: alert.type,
        minAmount: alert.minAmount,
        maxAmount: alert.maxAmount,
        message: alert.message,
        sound: alert.sound,
        imageUrl: alert.imageUrl,
        videoUrl: alert.videoUrl,
        duration: alert.duration,
        enabled: Boolean(alert.enabled),
        layout: alert.layout || 'above',
        animation: alert.animation || 'fade',
        volume: alert.volume ?? 50,
        topTextColor: alert.topTextColor || '#ffffff',
        bottomTextColor: alert.bottomTextColor || '#ffffff',
        font: alert.font || 'Impact',
        textPositionY: alert.textPositionY ?? 0,
        customCodeEnabled: Boolean(alert.customCodeEnabled),
        customHtml: alert.customHtml,
        customCss: alert.customCss,
        customJs: alert.customJs,
      } as AlertData;
    } catch (error) {
      log.error({ error, accountId, type, amount }, 'Failed to find matching alert');
      return null;
    }
  }

  private queueAlert(accountId: number, alert: TriggeredAlert): void {
    log.info({ 
      alert: alert.id, 
      accountId, 
      username: alert.username, 
      type: alert.type,
      hasVideo: !!alert.videoUrl,
      hasImage: !!alert.imageUrl,
      hasSound: !!alert.sound,
      videoUrl: alert.videoUrl,
      imageUrl: alert.imageUrl,
    }, 'Queuing alert');
    
    if (!this.alertQueues.has(accountId)) {
      this.alertQueues.set(accountId, []);
    }
    this.alertQueues.get(accountId)!.push(alert);
    
    this.emit('alert_queued', accountId, alert);
    
    if (!this.processingFlags.get(accountId)) {
      this.processQueue(accountId);
    }
  }

  private async processQueue(accountId: number): Promise<void> {
    const queue = this.alertQueues.get(accountId);
    if (!queue || this.processingFlags.get(accountId) || queue.length === 0) return;
    
    this.processingFlags.set(accountId, true);

    while (queue.length > 0) {
      const alert = queue.shift()!;
      this.currentAlerts.set(accountId, alert);
      log.info({ alert: alert.id, accountId, username: alert.username, type: alert.type }, 'Showing alert');
      this.emit('alert_show', accountId, alert);
      await new Promise((resolve) => setTimeout(resolve, alert.duration));
      this.emit('alert_end', accountId, alert);
      this.currentAlerts.set(accountId, null);
    }
    
    this.processingFlags.set(accountId, false);
  }

  getCurrentAlert(accountId: number): TriggeredAlert | null {
    return this.currentAlerts.get(accountId) || null;
  }

  getQueue(accountId: number): TriggeredAlert[] {
    return [...(this.alertQueues.get(accountId) || [])];
  }

  clearQueue(accountId: number): void {
    this.alertQueues.set(accountId, []);
    this.emit('queue_cleared', accountId);
  }

  skipCurrent(accountId: number): void {
    const current = this.currentAlerts.get(accountId);
    if (current) {
      log.info({ alert: current.id, accountId }, 'Skipping current alert');
      this.currentAlerts.set(accountId, null);
      this.emit('alert_skipped', accountId);
    }
  }

  // ============================================
  // LEGACY METHODS (backward compatibility)
  // These use a default account ID of 0 for testing
  // ============================================

  triggerFollowLegacy(username: string): void {
    // Find first account with alerts configured, or use test data
    const alert = this.findMatchingAlertLegacy('follow', 1);
    if (alert) {
      const accountId = alert.accountId || 0;
      const customMessage = alert.message.replace('{user}', username);
      this.queueAlert(accountId, {
        ...alert,
        triggeredAt: Date.now(),
        username,
        customMessage,
        variables: {
          name: username,
          text: customMessage,
          sound: alert.sound || '',
          image: alert.imageUrl || '',
          amount: '1',
          message: alert.message,
        },
      });
    }
  }

  private findMatchingAlertLegacy(type: string, amount: number): AlertData | null {
    try {
      const alerts = db.select().from(schema.alerts)
        .where(and(eq(schema.alerts.type, type), eq(schema.alerts.enabled, true)))
        .all();

      if (alerts.length === 0) return null;

      const matchingAlerts = alerts.filter((alert) => {
        const min = alert.minAmount;
        const max = alert.maxAmount;
        return amount >= min && (max === null || amount <= max);
      });

      if (matchingAlerts.length === 0) return null;
      matchingAlerts.sort((a, b) => b.minAmount - a.minAmount);
      
      const alert = matchingAlerts[0];
      return {
        id: alert.id,
        accountId: alert.accountId,
        type: alert.type,
        minAmount: alert.minAmount,
        maxAmount: alert.maxAmount,
        message: alert.message,
        sound: alert.sound,
        imageUrl: alert.imageUrl,
        videoUrl: alert.videoUrl,
        duration: alert.duration,
        enabled: Boolean(alert.enabled),
        layout: alert.layout || 'above',
        animation: alert.animation || 'fade',
        volume: alert.volume ?? 50,
        topTextColor: alert.topTextColor || '#ffffff',
        bottomTextColor: alert.bottomTextColor || '#ffffff',
        font: alert.font || 'Impact',
        textPositionY: alert.textPositionY ?? 0,
        customCodeEnabled: Boolean(alert.customCodeEnabled),
        customHtml: alert.customHtml,
        customCss: alert.customCss,
        customJs: alert.customJs,
      } as AlertData;
    } catch (error) {
      log.error({ error, type, amount }, 'Failed to find matching alert (legacy)');
      return null;
    }
  }
}

export const alertsManager = new AlertsManager();
