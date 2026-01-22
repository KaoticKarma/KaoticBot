import { db, schema } from '../db/index.js';
import { eq, desc, sql } from 'drizzle-orm';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('points');

interface PointsConfig {
  pointsPerMessage: number;
  messageCooldownSeconds: number;
  pointsPerMinuteWatching: number;
  subMultiplier: number;
}

const defaultConfig: PointsConfig = {
  pointsPerMessage: 5,
  messageCooldownSeconds: 5,
  pointsPerMinuteWatching: 2,
  subMultiplier: 2.0,
};

class PointsService {
  private config: PointsConfig = { ...defaultConfig };
  private messageCooldowns: Map<number, number> = new Map(); // oderId -> lastMessageTime
  private activeUsers: Map<number, number> = new Map(); // oderId -> lastActivityTime
  private watchTimeInterval: NodeJS.Timeout | null = null;
  
  // 30 minutes in milliseconds - user stays "active" for watch time if they chatted in last 30 min
  private readonly ACTIVITY_WINDOW_MS = 30 * 60 * 1000;
  
  async initialize(): Promise<void> {
    // Load config from database
    const settings = await db.select().from(schema.settings).where(eq(schema.settings.key, 'points_config'));
    if (settings.length > 0 && settings[0].value) {
      try {
        const saved = JSON.parse(settings[0].value);
        this.config = { ...defaultConfig, ...saved };
      } catch (e) {
        log.warn('Failed to parse points config, using defaults');
      }
    }
    
    // Start watch time tracking interval (every 60 seconds)
    this.watchTimeInterval = setInterval(() => this.processWatchTime(), 60000);
    
    log.info('Points service initialized');
  }
  
  async awardMessagePoints(
    userId: number,
    username: string,
    displayName: string,
    isSubscriber: boolean
  ): Promise<number> {
    const now = Date.now();
    
    // Check message cooldown
    const lastMessage = this.messageCooldowns.get(userId) || 0;
    const cooldownMs = this.config.messageCooldownSeconds * 1000;
    
    if (now - lastMessage < cooldownMs) {
      // Still on cooldown, but mark as active for watch time
      this.activeUsers.set(userId, now);
      return 0;
    }
    
    // Update cooldown
    this.messageCooldowns.set(userId, now);
    
    // Mark user as active for watch time
    this.activeUsers.set(userId, now);
    
    // Calculate points
    let points = this.config.pointsPerMessage;
    if (isSubscriber) {
      points = Math.floor(points * this.config.subMultiplier);
    }
    
    // Award points
    await this.addPoints(userId, username, displayName, points, isSubscriber);
    
    return points;
  }
  
  private async processWatchTime(): Promise<void> {
    const now = Date.now();
    const activeUserIds: number[] = [];
    
    // Find users who are still active (chatted within activity window)
    for (const [userId, lastActivity] of this.activeUsers.entries()) {
      if (now - lastActivity < this.ACTIVITY_WINDOW_MS) {
        activeUserIds.push(userId);
      } else {
        // Remove inactive users
        this.activeUsers.delete(userId);
      }
    }
    
    if (activeUserIds.length === 0) return;
    
    // Award watch time points to active users
    for (const userId of activeUserIds) {
      try {
        // Get user from DB to check subscriber status
        const users = await db.select().from(schema.users).where(eq(schema.users.id, userId));
        if (users.length > 0) {
          const user = users[0];
          let points = this.config.pointsPerMinuteWatching;
          if (user.isSubscriber) {
            points = Math.floor(points * this.config.subMultiplier);
          }
          
          // Update points and watch time
          await db.update(schema.users)
            .set({
              points: sql`${schema.users.points} + ${points}`,
              watchTime: sql`${schema.users.watchTime} + 1`,
            })
            .where(eq(schema.users.id, userId));
        }
      } catch (err) {
        log.debug({ err, userId }, 'Failed to award watch time points');
      }
    }
    
    log.debug({ activeUsers: activeUserIds.length }, 'Processed watch time points');
  }
  
  // Mark user as active (called when they chat)
  markUserActive(userId: number): void {
    this.activeUsers.set(userId, Date.now());
  }
  
  async getPoints(userId: number): Promise<number> {
    const users = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    return users.length > 0 ? users[0].points : 0;
  }
  
  async addPoints(
    userId: number,
    username: string,
    displayName: string,
    amount: number,
    isSubscriber: boolean = false
  ): Promise<void> {
    // Upsert user
    const existing = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    
    if (existing.length > 0) {
      await db.update(schema.users)
        .set({
          username,
          displayName,
          points: sql`${schema.users.points} + ${amount}`,
          messageCount: sql`${schema.users.messageCount} + 1`,
          isSubscriber,
        })
        .where(eq(schema.users.id, userId));
    } else {
      await db.insert(schema.users).values({
        id: userId,
        username,
        displayName,
        points: amount,
        watchTime: 0,
        messageCount: 1,
        isSubscriber,
        isFollower: false,
      });
    }
  }
  
  async removePoints(userId: number, amount: number): Promise<boolean> {
    const current = await this.getPoints(userId);
    if (current < amount) return false;
    
    await db.update(schema.users)
      .set({ points: sql`${schema.users.points} - ${amount}` })
      .where(eq(schema.users.id, userId));
    
    return true;
  }
  
  async setPoints(userId: number, amount: number): Promise<void> {
    await db.update(schema.users)
      .set({ points: amount })
      .where(eq(schema.users.id, userId));
  }
  
  async transferPoints(fromId: number, toId: number, amount: number): Promise<boolean> {
    const fromPoints = await this.getPoints(fromId);
    if (fromPoints < amount) return false;
    
    await db.update(schema.users)
      .set({ points: sql`${schema.users.points} - ${amount}` })
      .where(eq(schema.users.id, fromId));
    
    await db.update(schema.users)
      .set({ points: sql`${schema.users.points} + ${amount}` })
      .where(eq(schema.users.id, toId));
    
    return true;
  }
  
  async getLeaderboard(limit: number = 10): Promise<Array<{
    id: number;
    username: string;
    displayName: string;
    points: number;
    watchTime: number;
    messageCount: number;
  }>> {
    const users = await db.select()
      .from(schema.users)
      .orderBy(desc(schema.users.points))
      .limit(limit);
    
    return users.map(u => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      points: u.points,
      watchTime: u.watchTime,
      messageCount: u.messageCount,
    }));
  }
  
  async getUserRank(userId: number): Promise<number> {
    const userPoints = await this.getPoints(userId);
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(schema.users)
      .where(sql`${schema.users.points} > ${userPoints}`);
    
    return (result[0]?.count || 0) + 1;
  }
  
  async getUserStats(userId: number): Promise<{
    points: number;
    watchTime: number;
    messageCount: number;
    rank: number;
  } | null> {
    const users = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (users.length === 0) return null;
    
    const user = users[0];
    const rank = await this.getUserRank(userId);
    
    return {
      points: user.points,
      watchTime: user.watchTime,
      messageCount: user.messageCount,
      rank,
    };
  }
  
  async getAllUsers(): Promise<Array<{
    id: number;
    username: string;
    displayName: string;
    points: number;
    watchTime: number;
    messageCount: number;
    isSubscriber: boolean;
    isFollower: boolean;
  }>> {
    const users = await db.select()
      .from(schema.users)
      .orderBy(desc(schema.users.points));
    
    return users.map(u => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      points: u.points,
      watchTime: u.watchTime,
      messageCount: u.messageCount,
      isSubscriber: u.isSubscriber,
      isFollower: u.isFollower,
    }));
  }
  
  async gamble(userId: number, amount: number): Promise<{ won: boolean; newTotal: number }> {
    const current = await this.getPoints(userId);
    if (current < amount) {
      throw new Error('Insufficient points');
    }
    
    // 45% win rate
    const won = Math.random() < 0.45;
    
    if (won) {
      await db.update(schema.users)
        .set({ points: sql`${schema.users.points} + ${amount}` })
        .where(eq(schema.users.id, userId));
      return { won: true, newTotal: current + amount };
    } else {
      await db.update(schema.users)
        .set({ points: sql`${schema.users.points} - ${amount}` })
        .where(eq(schema.users.id, userId));
      return { won: false, newTotal: current - amount };
    }
  }
  
  getConfig(): PointsConfig {
    return { ...this.config };
  }
  
  async updateConfig(newConfig: Partial<PointsConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    // Save to database
    const value = JSON.stringify(this.config);
    const existing = await db.select().from(schema.settings).where(eq(schema.settings.key, 'points_config'));
    
    if (existing.length > 0) {
      await db.update(schema.settings)
        .set({ value })
        .where(eq(schema.settings.key, 'points_config'));
    } else {
      await db.insert(schema.settings).values({
        key: 'points_config',
        value,
      });
    }
    
    log.info({ config: this.config }, 'Points config updated');
  }
  
  stop(): void {
    if (this.watchTimeInterval) {
      clearInterval(this.watchTimeInterval);
      this.watchTimeInterval = null;
    }
    log.info('Points service stopped');
  }
}

export const pointsService = new PointsService();
