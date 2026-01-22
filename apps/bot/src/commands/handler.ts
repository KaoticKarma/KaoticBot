import type { Command, CommandContext, KickChatMessage, KickChannel, UserLevel, VariableContext } from '@kaoticbot/shared';
import { db, schema } from '../db/index.js';
import { eq, and, gte, or } from 'drizzle-orm';
import { parseVariables } from '../utils/variables.js';
import { createChildLogger } from '../utils/logger.js';
import { createClip, getClipSettings, isOnCooldown as isClipOnCooldown, setCooldown as setClipCooldown, getRemainingCooldown as getClipRemainingCooldown } from '../clips/service.js';

const log = createChildLogger('commands');

// In-memory cooldown tracking (faster than DB)
const cooldowns = new Map<string, Map<number, number>>();

// Active chat users for $(randomuser)
const chatUsers = new Map<number, Set<string>>();

export class CommandHandler {
  private prefix = '!';
  
  // Add user to active chat users
  trackUser(chatroomId: number, username: string): void {
    if (!chatUsers.has(chatroomId)) {
      chatUsers.set(chatroomId, new Set());
    }
    chatUsers.get(chatroomId)!.add(username);
  }
  
  // Get active chat users
  getChatUsers(chatroomId: number): string[] {
    return Array.from(chatUsers.get(chatroomId) || []);
  }
  
  // Clear old users periodically
  cleanupChatUsers(chatroomId: number, maxAge = 30 * 60 * 1000): void {
    // For simplicity, just clear and let it rebuild
    // In production, you'd track timestamps per user
    chatUsers.set(chatroomId, new Set());
  }
  
  // Check if message is a command
  isCommand(content: string): boolean {
    return content.startsWith(this.prefix);
  }
  
  // Parse command from message
  parseCommand(content: string): { name: string; args: string[] } | null {
    if (!this.isCommand(content)) return null;
    
    const parts = content.slice(this.prefix.length).trim().split(/\s+/);
    const name = parts[0]?.toLowerCase();
    const args = parts.slice(1);
    
    if (!name) return null;
    
    return { name, args };
  }
  
  // Get user level from message sender
  getUserLevel(sender: KickChatMessage['sender'], channelOwnerId: number): UserLevel {
    if (sender.id === channelOwnerId) return 'broadcaster';
    
    const badges = sender.identity?.badges || [];
    
    for (const badge of badges) {
      if (badge.type === 'moderator') return 'moderator';
      if (badge.type === 'vip') return 'vip';
      if (badge.type === 'subscriber' || badge.type === 'sub_gifter') return 'subscriber';
      if (badge.type === 'follower') return 'follower';
    }
    
    return 'everyone';
  }
  
  // Check if user has required level
  hasPermission(userLevel: UserLevel, requiredLevel: UserLevel): boolean {
    const levels: UserLevel[] = ['everyone', 'follower', 'subscriber', 'vip', 'moderator', 'broadcaster'];
    return levels.indexOf(userLevel) >= levels.indexOf(requiredLevel);
  }
  
  // Check cooldown for command
  isOnCooldown(commandName: string, userId: number, cooldownSeconds: number): boolean {
    const key = commandName.toLowerCase();
    
    if (!cooldowns.has(key)) {
      cooldowns.set(key, new Map());
    }
    
    const cmdCooldowns = cooldowns.get(key)!;
    const lastUsed = cmdCooldowns.get(userId);
    
    if (!lastUsed) return false;
    
    const now = Date.now();
    const elapsed = (now - lastUsed) / 1000;
    
    return elapsed < cooldownSeconds;
  }
  
  // Set cooldown for command
  setCooldown(commandName: string, userId: number): void {
    const key = commandName.toLowerCase();
    
    if (!cooldowns.has(key)) {
      cooldowns.set(key, new Map());
    }
    
    cooldowns.get(key)!.set(userId, Date.now());
  }
  
  // Get remaining cooldown time
  getRemainingCooldown(commandName: string, userId: number, cooldownSeconds: number): number {
    const key = commandName.toLowerCase();
    const cmdCooldowns = cooldowns.get(key);
    const lastUsed = cmdCooldowns?.get(userId);
    
    if (!lastUsed) return 0;
    
    const now = Date.now();
    const elapsed = (now - lastUsed) / 1000;
    const remaining = cooldownSeconds - elapsed;
    
    return Math.max(0, Math.ceil(remaining));
  }
  
  // Find command by name or alias
  findCommand(name: string): typeof schema.commands.$inferSelect | null {
    const lowerName = name.toLowerCase();
    
    // First try exact name match
    let command = db.select()
      .from(schema.commands)
      .where(eq(schema.commands.name, lowerName))
      .get();
    
    if (command) return command;
    
    // Then search aliases
    const allCommands = db.select().from(schema.commands).all();
    
    for (const cmd of allCommands) {
      const aliases = cmd.aliases as string[];
      if (aliases.includes(lowerName)) {
        return cmd;
      }
    }
    
    return null;
  }
  
  // Process a command message
  async processCommand(
    message: KickChatMessage,
    channel: KickChannel,
    sendMessage: (content: string) => Promise<void>,
    accountId?: number
  ): Promise<boolean> {
    const parsed = this.parseCommand(message.content);
    if (!parsed) return false;
    
    const { name, args } = parsed;
    
    // Track user for $(randomuser)
    this.trackUser(message.chatroom_id, message.sender.username);
    
    // Check for built-in commands first
    if (name === 'clip' && accountId) {
      return await this.handleClipCommand(
        accountId,
        message,
        channel,
        args,
        sendMessage
      );
    }
    
    // Find command
    const command = this.findCommand(name);
    if (!command || !command.enabled) {
      log.debug({ command: name }, 'Command not found or disabled');
      return false;
    }
    
    // Build context
    const userLevel = this.getUserLevel(message.sender, channel.user_id);
    const ctx: CommandContext = {
      message,
      channel,
      args,
      commandName: name,
      user: {
        id: message.sender.id,
        username: message.sender.username,
        displayName: message.sender.username,
        level: userLevel,
        isBroadcaster: userLevel === 'broadcaster',
        isModerator: userLevel === 'moderator' || userLevel === 'broadcaster',
        isSubscriber: ['subscriber', 'vip', 'moderator', 'broadcaster'].includes(userLevel),
        isVip: ['vip', 'moderator', 'broadcaster'].includes(userLevel),
      },
    };
    
    // Check permission
    if (!this.hasPermission(userLevel, command.userLevel as UserLevel)) {
      log.debug({ command: name, userLevel, required: command.userLevel }, 'Permission denied');
      return false;
    }
    
    // Check cooldown (mods/broadcaster bypass)
    if (!ctx.user.isModerator && this.isOnCooldown(name, ctx.user.id, command.cooldown)) {
      const remaining = this.getRemainingCooldown(name, ctx.user.id, command.cooldown);
      log.debug({ command: name, remaining }, 'Command on cooldown');
      // Optionally send cooldown message (commented out to reduce spam)
      // await sendMessage(`@${ctx.user.displayName} Command is on cooldown. ${remaining}s remaining.`);
      return false;
    }
    
    // Build variable context
    const varCtx: VariableContext = {
      user: ctx.user,
      channel,
      args,
      touser: args[0]?.startsWith('@') ? args[0] : (args[0] || null),
      message: message.content,
      chatUsers: this.getChatUsers(message.chatroom_id),
    };
    
    // Parse response with variables
    try {
      const response = await parseVariables(command.response, varCtx);
      
      // Send response
      await sendMessage(response);
      
      // Set cooldown
      this.setCooldown(name, ctx.user.id);
      
      // Increment usage count
      db.update(schema.commands)
        .set({ usageCount: command.usageCount + 1 })
        .where(eq(schema.commands.id, command.id))
        .run();
      
      log.info({ command: name, user: ctx.user.username }, 'Command executed');
      return true;
    } catch (error) {
      log.error({ error, command: name }, 'Error executing command');
      return false;
    }
  }
  
  // Handle !clip command
  private async handleClipCommand(
    accountId: number,
    message: KickChatMessage,
    channel: KickChannel,
    args: string[],
    sendMessage: (content: string) => Promise<void>
  ): Promise<boolean> {
    const settings = getClipSettings(accountId);
    
    // Check if clip command is enabled
    if (!settings.enabled) {
      log.debug('Clip command is disabled');
      return false;
    }
    
    const userLevel = this.getUserLevel(message.sender, channel.user_id);
    
    // Check permission
    if (!this.hasPermission(userLevel, settings.minUserLevel as UserLevel)) {
      log.debug({ userLevel, required: settings.minUserLevel }, 'Clip permission denied');
      return false;
    }
    
    // Check cooldown (mods/broadcaster bypass)
    const isMod = userLevel === 'moderator' || userLevel === 'broadcaster';
    if (!isMod && isClipOnCooldown(accountId, message.sender.id)) {
      const remaining = getClipRemainingCooldown(accountId, message.sender.id);
      if (remaining > 0) {
        await sendMessage(`@${message.sender.username} Clip command is on cooldown. ${remaining}s remaining.`);
        return true;
      }
    }
    
    // Parse duration from args
    let duration = settings.defaultDuration;
    if (args[0]) {
      const requestedDuration = parseInt(args[0], 10);
      if (!isNaN(requestedDuration) && requestedDuration > 0) {
        duration = Math.min(requestedDuration, settings.maxDuration);
      }
    }
    
    // Send acknowledgment
    await sendMessage(`@${message.sender.username} Creating ${duration}s clip... This may take 1-2 minutes.`);
    
    // Set cooldown
    if (!isMod) {
      setClipCooldown(accountId, message.sender.id);
    }
    
    // Get account info for channel details
    const account = db.select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId))
      .get();
    
    if (!account || !account.kickChannelSlug) {
      log.error({ accountId }, 'Account or channel slug not found');
      await sendMessage(`@${message.sender.username} Error: Channel information not available.`);
      return true;
    }
    
    // Create clip in background (don't await)
    createClip(
      accountId,
      account.kickChannelSlug,
      account.kickDisplayName || account.kickUsername,
      message.sender.username,
      message.sender.id,
      duration
    ).then(async (result) => {
      if (result.success) {
        log.info({ 
          clipId: result.clipId, 
          duration: result.duration,
          requestedBy: message.sender.username 
        }, 'Clip created successfully');
        
        // Send success message to chat
        await sendMessage(`@${message.sender.username} Clip created! (${result.duration}s)`);
      } else {
        log.error({ error: result.error }, 'Failed to create clip');
        await sendMessage(`@${message.sender.username} Failed to create clip: ${result.error}`);
      }
    }).catch(async (error) => {
      log.error({ error }, 'Error creating clip');
      await sendMessage(`@${message.sender.username} An error occurred while creating the clip.`);
    });
    
    return true;
  }
  
  // CRUD operations for commands
  createCommand(data: {
    name: string;
    response: string;
    cooldown?: number;
    userLevel?: UserLevel;
    aliases?: string[];
  }): typeof schema.commands.$inferSelect {
    // Strip ! prefix if user included it
    const cleanName = data.name.toLowerCase().replace(/^!/, '');
    
    const result = db.insert(schema.commands).values({
      name: cleanName,
      response: data.response,
      cooldown: data.cooldown || 5,
      userLevel: data.userLevel || 'everyone',
      aliases: data.aliases || [],
      enabled: true,
      usageCount: 0,
    }).returning().get();
    
    log.info({ command: cleanName }, 'Command created');
    return result;
  }
  
  updateCommand(id: number, data: Partial<{
    name: string;
    response: string;
    cooldown: number;
    userLevel: UserLevel;
    aliases: string[];
    enabled: boolean;
  }>): typeof schema.commands.$inferSelect | null {
    // Get current command first
    const current = this.getCommand(id);
    if (!current) {
      log.warn({ commandId: id }, 'Command not found for update');
      return null;
    }
    
    // Only pick allowed fields to prevent issues with extra fields like id, usageCount, createdAt, etc.
    const allowedUpdates: Record<string, any> = {};
    
    if (data.name !== undefined) {
      // Strip ! prefix if user included it
      const newName = data.name.toLowerCase().replace(/^!/, '');
      // Only update name if it's actually different (avoid unique constraint on self)
      if (newName !== current.name) {
        // Check if new name already exists
        const existing = this.findCommand(newName);
        if (existing && existing.id !== id) {
          log.warn({ commandId: id, newName, existingId: existing.id }, 'Command name already exists');
          throw new Error(`Command name "${newName}" already exists`);
        }
        allowedUpdates.name = newName;
      }
    }
    if (data.response !== undefined) {
      allowedUpdates.response = data.response;
    }
    if (data.cooldown !== undefined) {
      allowedUpdates.cooldown = data.cooldown;
    }
    if (data.userLevel !== undefined) {
      allowedUpdates.userLevel = data.userLevel;
    }
    if (data.aliases !== undefined) {
      allowedUpdates.aliases = data.aliases;
    }
    if (data.enabled !== undefined) {
      allowedUpdates.enabled = data.enabled;
    }
    
    // Always update timestamp
    allowedUpdates.updatedAt = new Date();
    
    const result = db.update(schema.commands)
      .set(allowedUpdates)
      .where(eq(schema.commands.id, id))
      .returning()
      .get();
    
    if (result) {
      log.info({ commandId: id, updates: Object.keys(allowedUpdates) }, 'Command updated');
    }
    return result || null;
  }
  
  deleteCommand(id: number): boolean {
    const result = db.delete(schema.commands)
      .where(eq(schema.commands.id, id))
      .returning()
      .get();
    
    if (result) {
      log.info({ commandId: id }, 'Command deleted');
      return true;
    }
    return false;
  }
  
  getCommand(id: number): typeof schema.commands.$inferSelect | null {
    return db.select()
      .from(schema.commands)
      .where(eq(schema.commands.id, id))
      .get() || null;
  }
  
  getAllCommands(): (typeof schema.commands.$inferSelect)[] {
    return db.select().from(schema.commands).all();
  }
}

export const commandHandler = new CommandHandler();
