// discord/service.ts
// Handles Discord bot notifications using discord.js

import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, TextChannel } from 'discord.js';
import { readScreenshotBuffer } from './screenshot.js';
import { createChildLogger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { promises as fs } from 'fs';

const log = createChildLogger('discord-service');

// Bot constants
const BOT_NAME = 'KaoticBot';

// Discord client singleton
let discordClient: Client | null = null;
let isReady = false;

interface DiscordSettings {
  guildId: string;
  channelId: string;
  pingEveryone?: boolean | null;
  pingRoleId?: string | null;
  customMessage?: string | null;
  embedColor?: string | null;
  offlineColor?: string | null;
}

interface StreamInfo {
  channelName: string;
  channelUrl: string;
  title: string;
  category: string;
  viewerCount?: number;
  screenshotPath?: string;
  thumbnailUrl?: string;
  profilePicUrl?: string;
}

interface OfflineInfo {
  messageId: string;
  channelId: string;
  channelName: string;
  channelUrl: string;
  duration: number;
  peakViewers: number;
  totalMessages: number;
  uniqueChatters: number;
  newFollowers: number;
  newSubs: number;
  giftedSubs: number;
  title: string;
  category: string;
  vodUrl?: string;
  screenshotPath?: string;
}

interface NotificationResult {
  messageId: string;
  channelId: string;
}

interface ClipInfo {
  guildId: string;
  channelId: string;
  clipPath: string;
  clipFilename: string;
  channelName: string;
  channelSlug: string;
  duration: number;
  requestedBy: string;
}

// Convert hex color to Discord integer color
function hexToDecimal(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

// Format duration in HH:MM:SS
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

// Format seconds to mm:ss
function formatSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Initialize the Discord bot client
 */
export async function initializeDiscordBot(): Promise<boolean> {
  if (!config.DISCORD_BOT_TOKEN) {
    log.warn('Discord bot token not configured, Discord integration disabled');
    return false;
  }
  
  if (discordClient && isReady) {
    log.info('Discord bot already initialized');
    return true;
  }
  
  try {
    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
      ],
    });
    
    // Set up event handlers
    discordClient.once('ready', (client) => {
      isReady = true;
      log.info({ username: client.user.tag, guilds: client.guilds.cache.size }, 'Discord bot connected');
    });
    
    discordClient.on('error', (error) => {
      log.error({ error }, 'Discord client error');
    });
    
    discordClient.on('disconnect', () => {
      isReady = false;
      log.warn('Discord bot disconnected');
    });
    
    // Login to Discord
    await discordClient.login(config.DISCORD_BOT_TOKEN);
    
    // Wait for ready state (max 10 seconds)
    const startTime = Date.now();
    while (!isReady && Date.now() - startTime < 10000) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (!isReady) {
      log.error('Discord bot failed to become ready in time');
      return false;
    }
    
    return true;
  } catch (error) {
    log.error({ error }, 'Failed to initialize Discord bot');
    return false;
  }
}

/**
 * Shutdown the Discord bot
 */
export async function shutdownDiscordBot(): Promise<void> {
  if (discordClient) {
    discordClient.destroy();
    discordClient = null;
    isReady = false;
    log.info('Discord bot disconnected');
  }
}

/**
 * Check if Discord bot is ready
 */
export function isDiscordReady(): boolean {
  return isReady && discordClient !== null;
}

/**
 * Test Discord connection by sending a test message
 */
export async function testDiscordConnection(settings: DiscordSettings): Promise<boolean> {
  if (!isDiscordReady() || !discordClient) {
    log.error('Discord bot not ready');
    return false;
  }
  
  try {
    const channel = await discordClient.channels.fetch(settings.channelId);
    
    if (!channel || !channel.isTextBased()) {
      log.error({ channelId: settings.channelId }, 'Channel not found or not a text channel');
      return false;
    }
    
    const textChannel = channel as TextChannel;
    
    await textChannel.send({
      content: `✅ **Test Successful!**\nYour ${BOT_NAME} Discord integration is working correctly.`,
    });
    
    return true;
  } catch (error) {
    log.error({ error }, 'Discord test failed');
    return false;
  }
}

/**
 * Send go-live notification to Discord
 */
export async function sendGoLiveNotification(
  settings: DiscordSettings, 
  streamInfo: StreamInfo
): Promise<NotificationResult | null> {
  if (!isDiscordReady() || !discordClient) {
    log.error('Discord bot not ready');
    return null;
  }
  
  try {
    const channel = await discordClient.channels.fetch(settings.channelId);
    
    if (!channel || !channel.isTextBased()) {
      log.error({ channelId: settings.channelId }, 'Channel not found or not a text channel');
      return null;
    }
    
    const textChannel = channel as TextChannel;
    const embedColor = hexToDecimal(settings.embedColor || '#53fc18');
    
    // Build embed
    const embed = new EmbedBuilder()
      .setAuthor({ name: '🔴 LIVE NOW' })
      .setTitle(`**${streamInfo.channelName} is LIVE!**`)
      .setDescription(settings.customMessage || 'Come hang out! 🎮')
      .setColor(embedColor)
      .addFields(
        { name: '🎮 Playing', value: streamInfo.category || 'Just Chatting', inline: true },
        { name: '📺 Title', value: streamInfo.title || 'No title', inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Kick' });
    
    // Add thumbnail if available
    if (streamInfo.thumbnailUrl) {
      embed.setThumbnail(streamInfo.thumbnailUrl);
    }
    
    // Build action row with Watch Now button
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('🔗 Watch Now')
          .setStyle(ButtonStyle.Link)
          .setURL(streamInfo.channelUrl)
      );
    
    // Build message content
    let content = '';
    if (settings.pingEveryone) {
      content = '@everyone — Come hang out!';
    } else if (settings.pingRoleId) {
      content = `<@&${settings.pingRoleId}> — Come hang out!`;
    }
    
    // Prepare message options
    const messageOptions: any = {
      content: content || undefined,
      embeds: [embed],
      components: [row],
    };
    
    // Add screenshot if available
    if (streamInfo.screenshotPath) {
      try {
        const screenshotBuffer = await readScreenshotBuffer(streamInfo.screenshotPath);
        if (screenshotBuffer) {
          const attachment = new AttachmentBuilder(screenshotBuffer, { name: 'stream-screenshot.png' });
          messageOptions.files = [attachment];
          embed.setImage('attachment://stream-screenshot.png');
        }
      } catch (error) {
        log.warn({ error }, 'Failed to read screenshot, sending without image');
      }
    }
    
    // Send the message
    const message = await textChannel.send(messageOptions);
    
    log.info({ messageId: message.id, channelId: textChannel.id }, 'Go-live notification sent');
    
    return {
      messageId: message.id,
      channelId: textChannel.id,
    };
  } catch (error) {
    log.error({ error }, 'Failed to send go-live notification');
    return null;
  }
}

/**
 * Update go-live message to show stream ended
 */
export async function sendOfflineNotification(
  settings: DiscordSettings,
  offlineInfo: OfflineInfo
): Promise<boolean> {
  if (!isDiscordReady() || !discordClient) {
    log.error('Discord bot not ready');
    return false;
  }
  
  try {
    const channel = await discordClient.channels.fetch(offlineInfo.channelId);
    
    if (!channel || !channel.isTextBased()) {
      log.error({ channelId: offlineInfo.channelId }, 'Channel not found or not a text channel');
      return false;
    }
    
    const textChannel = channel as TextChannel;
    
    // Fetch the original message to edit
    let originalMessage;
    try {
      originalMessage = await textChannel.messages.fetch(offlineInfo.messageId);
    } catch {
      log.warn({ messageId: offlineInfo.messageId }, 'Could not find original message, sending new offline notification');
      // Send as new message instead
      return await sendNewOfflineNotification(textChannel, settings, offlineInfo);
    }
    
    const embedColor = hexToDecimal(settings.offlineColor || '#ff6b6b');
    
    // Build stats string
    const statsText = [
      `⏱️ Duration: **${formatDuration(offlineInfo.duration)}**`,
      `👀 Peak Viewers: **${offlineInfo.peakViewers.toLocaleString()}**`,
      `💬 Messages: **${offlineInfo.totalMessages.toLocaleString()}**`,
      `👥 Chatters: **${offlineInfo.uniqueChatters.toLocaleString()}**`,
      `➕ New Followers: **+${offlineInfo.newFollowers}**`,
      `⭐ New Subs: **+${offlineInfo.newSubs}**`,
      `🎁 Gift Subs: **${offlineInfo.giftedSubs}**`,
    ].join('\n');
    
    const embed = new EmbedBuilder()
      .setAuthor({ name: '⚫ STREAM ENDED' })
      .setTitle(`**${offlineInfo.channelName}'s stream has ended!**`)
      .setDescription('Thanks for watching! 💚')
      .setColor(embedColor)
      .addFields(
        { name: '📊 Stream Statistics', value: statsText, inline: false },
        { name: '🎮 Category', value: offlineInfo.category || 'Just Chatting', inline: true },
        { name: '📺 Title', value: offlineInfo.title || 'No title', inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Kick' });
    
    // Build components
    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    
    if (offlineInfo.vodUrl) {
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setLabel('📼 Watch VOD')
            .setStyle(ButtonStyle.Link)
            .setURL(offlineInfo.vodUrl)
        );
      components.push(row);
    }
    
    // Edit the original message
    await originalMessage.edit({
      content: 'Stream has ended — see you next time! 👋',
      embeds: [embed],
      components: components.length > 0 ? components : [],
    });
    
    log.info({ messageId: offlineInfo.messageId }, 'Offline notification sent (message edited)');
    return true;
  } catch (error) {
    log.error({ error }, 'Failed to send offline notification');
    return false;
  }
}

/**
 * Send a new offline notification (fallback if original message can't be edited)
 */
async function sendNewOfflineNotification(
  channel: TextChannel,
  settings: DiscordSettings,
  offlineInfo: OfflineInfo
): Promise<boolean> {
  try {
    const embedColor = hexToDecimal(settings.offlineColor || '#ff6b6b');
    
    const statsText = [
      `⏱️ Duration: **${formatDuration(offlineInfo.duration)}**`,
      `👀 Peak Viewers: **${offlineInfo.peakViewers.toLocaleString()}**`,
      `💬 Messages: **${offlineInfo.totalMessages.toLocaleString()}**`,
      `👥 Chatters: **${offlineInfo.uniqueChatters.toLocaleString()}**`,
      `➕ New Followers: **+${offlineInfo.newFollowers}**`,
      `⭐ New Subs: **+${offlineInfo.newSubs}**`,
      `🎁 Gift Subs: **${offlineInfo.giftedSubs}**`,
    ].join('\n');
    
    const embed = new EmbedBuilder()
      .setAuthor({ name: '⚫ STREAM ENDED' })
      .setTitle(`**${offlineInfo.channelName}'s stream has ended!**`)
      .setDescription('Thanks for watching! 💚')
      .setColor(embedColor)
      .addFields(
        { name: '📊 Stream Statistics', value: statsText, inline: false },
        { name: '🎮 Category', value: offlineInfo.category || 'Just Chatting', inline: true },
        { name: '📺 Title', value: offlineInfo.title || 'No title', inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Kick' });
    
    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    
    if (offlineInfo.vodUrl) {
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setLabel('📼 Watch VOD')
            .setStyle(ButtonStyle.Link)
            .setURL(offlineInfo.vodUrl)
        );
      components.push(row);
    }
    
    await channel.send({
      content: 'Stream has ended — see you next time! 👋',
      embeds: [embed],
      components: components.length > 0 ? components : [],
    });
    
    return true;
  } catch (error) {
    log.error({ error }, 'Failed to send new offline notification');
    return false;
  }
}

/**
 * Send a clip to Discord
 */
export async function sendClipToDiscord(clipInfo: ClipInfo): Promise<boolean> {
  if (!isDiscordReady() || !discordClient) {
    log.error('Discord bot not ready');
    return false;
  }
  
  try {
    const channel = await discordClient.channels.fetch(clipInfo.channelId);
    
    if (!channel || !channel.isTextBased()) {
      log.error({ channelId: clipInfo.channelId }, 'Channel not found or not a text channel');
      return false;
    }
    
    const textChannel = channel as TextChannel;
    
    // Read the clip file
    const clipBuffer = await fs.readFile(clipInfo.clipPath);
    
    // Check file size - Discord has 25MB limit for non-nitro servers
    const fileSizeMB = clipBuffer.length / (1024 * 1024);
    if (fileSizeMB > 25) {
      log.warn({ fileSizeMB }, 'Clip file too large for Discord (>25MB)');
      
      // Send message without attachment
      const embed = new EmbedBuilder()
        .setAuthor({ name: '🎬 New Clip Created' })
        .setTitle(`Clip from ${clipInfo.channelName}'s stream`)
        .setDescription(`⚠️ Clip file is too large to upload (${fileSizeMB.toFixed(1)}MB). Please download from the dashboard.`)
        .setColor(hexToDecimal('#53fc18'))
        .addFields(
          { name: '⏱️ Duration', value: formatSeconds(clipInfo.duration), inline: true },
          { name: '👤 Clipped by', value: clipInfo.requestedBy, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'KaoticBot Clips' });
      
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setLabel('🔗 Watch on Kick')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://kick.com/${clipInfo.channelSlug}`)
        );
      
      await textChannel.send({
        embeds: [embed],
        components: [row],
      });
      
      return true;
    }
    
    // Create attachment
    const attachment = new AttachmentBuilder(clipBuffer, { name: clipInfo.clipFilename });
    
    // Build embed
    const embed = new EmbedBuilder()
      .setAuthor({ name: '🎬 New Clip Created' })
      .setTitle(`Clip from ${clipInfo.channelName}'s stream`)
      .setColor(hexToDecimal('#53fc18'))
      .addFields(
        { name: '⏱️ Duration', value: formatSeconds(clipInfo.duration), inline: true },
        { name: '👤 Clipped by', value: clipInfo.requestedBy, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'KaoticBot Clips' });
    
    // Build action row
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('🔗 Watch on Kick')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://kick.com/${clipInfo.channelSlug}`)
      );
    
    // Send message with clip
    await textChannel.send({
      embeds: [embed],
      files: [attachment],
      components: [row],
    });
    
    log.info({ 
      channelId: clipInfo.channelId, 
      filename: clipInfo.clipFilename,
      duration: clipInfo.duration,
      requestedBy: clipInfo.requestedBy
    }, 'Clip sent to Discord');
    
    return true;
  } catch (error) {
    log.error({ error }, 'Failed to send clip to Discord');
    return false;
  }
}

/**
 * Send a custom message to Discord
 */
export async function sendCustomMessage(
  settings: DiscordSettings,
  message: string
): Promise<boolean> {
  if (!isDiscordReady() || !discordClient) {
    log.error('Discord bot not ready');
    return false;
  }
  
  try {
    const channel = await discordClient.channels.fetch(settings.channelId);
    
    if (!channel || !channel.isTextBased()) {
      log.error({ channelId: settings.channelId }, 'Channel not found or not a text channel');
      return false;
    }
    
    await (channel as TextChannel).send(message);
    return true;
  } catch (error) {
    log.error({ error }, 'Failed to send custom message');
    return false;
  }
}

/**
 * Get list of guilds the bot is in (for dashboard display)
 */
export function getBotGuilds(): Array<{ id: string; name: string }> {
  if (!isDiscordReady() || !discordClient) {
    return [];
  }
  
  return discordClient.guilds.cache.map(guild => ({
    id: guild.id,
    name: guild.name,
  }));
}

/**
 * Get text channels in a guild (for dashboard display)
 */
export async function getGuildChannels(guildId: string): Promise<Array<{ id: string; name: string }>> {
  if (!isDiscordReady() || !discordClient) {
    return [];
  }
  
  try {
    const guild = await discordClient.guilds.fetch(guildId);
    const channels = await guild.channels.fetch();
    
    return channels
      .filter(channel => channel !== null && channel.isTextBased() && !channel.isThread())
      .map(channel => ({
        id: channel!.id,
        name: channel!.name,
      }));
  } catch (error) {
    log.error({ error, guildId }, 'Failed to fetch guild channels');
    return [];
  }
}

/**
 * Get roles in a guild (for ping role selection)
 */
export async function getGuildRoles(guildId: string): Promise<Array<{ id: string; name: string }>> {
  if (!isDiscordReady() || !discordClient) {
    return [];
  }
  
  try {
    const guild = await discordClient.guilds.fetch(guildId);
    const roles = await guild.roles.fetch();
    
    return roles
      .filter(role => role.name !== '@everyone')
      .map(role => ({
        id: role.id,
        name: role.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    log.error({ error, guildId }, 'Failed to fetch guild roles');
    return [];
  }
}

/**
 * Generate bot invite URL
 */
export function getBotInviteUrl(): string {
  // Permissions: Send Messages, Embed Links, Attach Files, Read Message History
  const permissions = '52224';
  return `https://discord.com/api/oauth2/authorize?client_id=${config.DISCORD_APP_ID}&permissions=${permissions}&integration_type=0&scope=bot`;
}
