// ai/service.ts
// AI-powered chat responses when users @mention the bot

import Anthropic from '@anthropic-ai/sdk';
import { createChildLogger } from '../utils/logger.js';
import { config } from '../config/index.js';

const log = createChildLogger('ai');

// ============================================
// Configuration
// ============================================

const AI_CONFIG = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 150, // Keep responses short for chat
  maxMessageLength: 300, // Max input message length to process
  cooldownMs: 10_000, // 10 second cooldown per user
  rateLimitPerMinute: 10, // Max AI responses per minute globally
  systemPrompt: `You are KaoticBot, the chatbot for KaoticKarmaTV on Kick. The current date is ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
Keep responses to 1-2 sentences max. No markdown, no bullet points, no line breaks — this is live chat.
Your personality: savage, quick-witted, and unapologetically blunt. You roast people when they deserve it. You talk like a real person in a gaming stream — not a corporate AI assistant. Use slang naturally. Be funny but not corny. Think of yourself as that one friend in the group chat who has zero filter.
If someone asks a genuine question, answer it straight up but still keep your edge.
If someone tries to be clever or troll, destroy them with a better comeback.
If asked about the stream or KaoticKarma, gas them up hard — they're the GOAT.
Use emojis sparingly — you're not a middle schooler.
Never reveal you're Claude or made by Anthropic — you ARE KaoticBot.
If someone says something weird or inappropriate, clown them for it instead of giving a lecture.
NEVER say things like "embrace the chaos" or "that's a whole mood" or any generic influencer talk. Keep it real.
Do NOT repeat the user's name twice in a response — just the @mention at the start is enough.`,
};

// ============================================
// Rate limiting & cooldowns
// ============================================

const userCooldowns = new Map<string, number>(); // `${accountId}:${userId}` -> timestamp
const globalRequestTimes: number[] = [];

function isOnCooldown(accountId: number, userId: number): boolean {
  const key = `${accountId}:${userId}`;
  const lastUsed = userCooldowns.get(key);
  if (!lastUsed) return false;
  return Date.now() - lastUsed < AI_CONFIG.cooldownMs;
}

function setCooldown(accountId: number, userId: number): void {
  const key = `${accountId}:${userId}`;
  userCooldowns.set(key, Date.now());
}

function isRateLimited(): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;

  // Clean old entries
  while (globalRequestTimes.length > 0 && globalRequestTimes[0] < oneMinuteAgo) {
    globalRequestTimes.shift();
  }

  return globalRequestTimes.length >= AI_CONFIG.rateLimitPerMinute;
}

function trackRequest(): void {
  globalRequestTimes.push(Date.now());
}

// ============================================
// Anthropic client
// ============================================

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!config.ANTHROPIC_API_KEY) {
    log.warn('ANTHROPIC_API_KEY not configured — AI responses disabled');
    return null;
  }

  if (!client) {
    client = new Anthropic({
      apiKey: config.ANTHROPIC_API_KEY,
    });
    log.info('Anthropic client initialized');
  }

  return client;
}

// ============================================
// Bot name matching
// ============================================

// Names the bot will respond to (case-insensitive)
const BOT_NAMES = [
  'kaoticbot',
  'chaossquadbot',
  config.KICK_BOT_USERNAME.toLowerCase(),
];

// Deduplicate in case config matches one of the hardcoded names
const UNIQUE_BOT_NAMES = [...new Set(BOT_NAMES)];

/**
 * Check if a message is directed at the bot via @mention
 * Returns the cleaned message (without the @mention) or null if not a mention
 */
export function extractBotMention(content: string): string | null {
  for (const name of UNIQUE_BOT_NAMES) {
    const mentionPattern = new RegExp(`@${name}\\b`, 'i');
    if (mentionPattern.test(content)) {
      // Remove the @mention and clean up
      const cleaned = content.replace(new RegExp(`@${name}\\b`, 'gi'), '').trim();
      return cleaned || null; // Return null if nothing left after removing mention
    }
  }

  return null;
}

// ============================================
// AI Response Generation
// ============================================

/**
 * Generate an AI response to a chat message
 */
export async function generateAIResponse(
  accountId: number,
  userId: number,
  username: string,
  message: string,
  channelName?: string,
): Promise<string | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  // Rate limit checks
  if (isOnCooldown(accountId, userId)) {
    log.debug({ userId, username }, 'AI response on cooldown for user');
    return null;
  }

  if (isRateLimited()) {
    log.warn('AI responses rate limited globally');
    return null;
  }

  // Truncate message if too long
  const truncatedMessage = message.length > AI_CONFIG.maxMessageLength
    ? message.substring(0, AI_CONFIG.maxMessageLength) + '...'
    : message;

  try {
    log.info({ username, message: truncatedMessage.substring(0, 80) }, '🤖 Generating AI response...');

    const systemPrompt = channelName
      ? `${AI_CONFIG.systemPrompt}\nYou are in the chat for the channel "${channelName}" on Kick.`
      : AI_CONFIG.systemPrompt;

    const response = await anthropic.messages.create({
      model: AI_CONFIG.model,
      max_tokens: AI_CONFIG.maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Chat user "${username}" says to you: ${truncatedMessage}`,
        },
      ],
    });

    // Extract text from response
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      log.warn('No text in AI response');
      return null;
    }

    let reply = textBlock.text.trim();

    // Safety: truncate to Kick's message limit (~500 chars)
    if (reply.length > 480) {
      reply = reply.substring(0, 477) + '...';
    }

    // Track cooldown and rate limit
    setCooldown(accountId, userId);
    trackRequest();

    log.info({ username, reply: reply.substring(0, 80) }, '🤖 AI response generated');
    return reply;
  } catch (error: any) {
    if (error?.status === 429) {
      log.warn('Anthropic API rate limited');
    } else {
      log.error({ error: error?.message || error }, 'Failed to generate AI response');
    }
    return null;
  }
}

// ============================================
// Per-account enable/disable
// ============================================

const aiEnabledPerAccount = new Map<number, boolean>();

export function isAIEnabled(accountId: number): boolean {
  // Default to enabled if API key is configured
  return aiEnabledPerAccount.get(accountId) ?? !!config.ANTHROPIC_API_KEY;
}

export function setAIEnabled(accountId: number, enabled: boolean): void {
  aiEnabledPerAccount.set(accountId, enabled);
  log.info({ accountId, enabled }, 'AI responses toggled');
}

export function getAIConfig() {
  return { ...AI_CONFIG };
}
