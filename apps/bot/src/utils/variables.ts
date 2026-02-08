import type { VariableContext, VariableFunction } from '@kaoticbot/shared';
import { db, schema } from '../db/index.js';
import { eq, sql, and } from 'drizzle-orm';
import { createChildLogger } from './logger.js';
import { getKickChannelData } from '../kick/channel-data.js';

const log = createChildLogger('variables');

// Registry of all available variables
const variables: Map<string, VariableFunction> = new Map();

// Store latency value (set by connection manager)
let currentLatency = 0;

export function setLatency(ms: number): void {
  currentLatency = ms;
}

export function getLatency(): number {
  return currentLatency;
}

// Register a variable handler
export function registerVariable(name: string, handler: VariableFunction): void {
  variables.set(name.toLowerCase(), handler);
}

// Parse and replace all variables in a template string
export async function parseVariables(template: string, ctx: VariableContext): Promise<string> {
  let result = template;
  
  // Handle Rand[min,max] syntax first
  result = await replaceRandom(result);
  
  // Handle $(variable) and $(variable args) syntax
  result = await replaceVariables(result, ctx);
  
  return result;
}

// Replace Rand[min,max] with random number
async function replaceRandom(template: string): Promise<string> {
  const randRegex = /Rand\[(-?\d+),(-?\d+)\]/gi;
  
  return template.replace(randRegex, (_, minStr, maxStr) => {
    const min = parseInt(minStr, 10);
    const max = parseInt(maxStr, 10);
    const randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
    return randomNum.toString();
  });
}

// Replace $(variable) patterns
async function replaceVariables(template: string, ctx: VariableContext): Promise<string> {
  // Match $(variableName) or $(variableName arg1 arg2 ...)
  const varRegex = /\$\(([^)]+)\)/g;
  const matches = [...template.matchAll(varRegex)];
  
  let result = template;
  
  for (const match of matches) {
    const fullMatch = match[0];
    const inner = match[1].trim();
    
    // Parse variable name and arguments
    const parts = parseVariableParts(inner);
    const varName = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    const handler = variables.get(varName);
    if (handler) {
      try {
        const replacement = await handler(ctx, ...args);
        result = result.replace(fullMatch, replacement);
      } catch (error) {
        log.error({ error, variable: varName }, 'Error processing variable');
        result = result.replace(fullMatch, `[error: ${varName}]`);
      }
    } else {
      // Unknown variable - leave as is or replace with empty
      log.debug({ variable: varName }, 'Unknown variable');
    }
  }
  
  return result;
}

// Parse variable parts handling quoted strings
function parseVariableParts(inner: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    
    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  
  if (current.length > 0) {
    parts.push(current);
  }
  
  return parts;
}

// ============================================
// Helper: fetch live channel data for stream variables
// ============================================

async function getLiveChannelData(ctx: VariableContext): Promise<any | null> {
  // Get channel slug from the context
  const slug = ctx.channel.slug || (ctx.channel as any).channelSlug;
  if (!slug) return null;

  try {
    const data = await getKickChannelData(slug);
    return data;
  } catch (err) {
    log.debug({ err }, 'Failed to fetch live channel data for variable');
    return null;
  }
}

// ============================================
// Built-in Variable Handlers
// ============================================

// User variables
registerVariable('user', (ctx) => ctx.user.displayName);
registerVariable('username', (ctx) => ctx.user.username);
registerVariable('userid', (ctx) => ctx.user.id.toString());

// User without @ prefix
registerVariable('name', (ctx) => ctx.user.displayName);

// Target user (for commands like !hug @someone)
registerVariable('touser', (ctx) => ctx.touser || ctx.user.displayName);
registerVariable('toname', (ctx) => {
  if (ctx.touser) {
    return ctx.touser.replace(/^@/, '').toLowerCase();
  }
  return ctx.user.username;
});

// Random user from chat
registerVariable('randomuser', (ctx) => {
  if (ctx.chatUsers.length === 0) {
    return ctx.user.displayName;
  }
  const others = ctx.chatUsers.filter(u => u.toLowerCase() !== ctx.user.username.toLowerCase());
  if (others.length === 0) {
    return ctx.chatUsers[Math.floor(Math.random() * ctx.chatUsers.length)];
  }
  return others[Math.floor(Math.random() * others.length)];
});

// ============================================
// Stream variables - fetch LIVE data from Kick API
// ============================================

registerVariable('channel', (ctx) => {
  return ctx.channel.slug || ctx.channel.user?.username || 'Unknown';
});

registerVariable('title', async (ctx) => {
  const data = await getLiveChannelData(ctx);
  if (data?.livestream?.session_title) {
    return data.livestream.session_title;
  }
  return 'Offline';
});

registerVariable('game', async (ctx) => {
  const data = await getLiveChannelData(ctx);
  if (data?.livestream?.categories?.[0]?.name) {
    return data.livestream.categories[0].name;
  }
  return 'No category';
});

registerVariable('viewers', async (ctx) => {
  const data = await getLiveChannelData(ctx);
  if (data?.livestream?.viewer_count !== undefined) {
    return data.livestream.viewer_count.toString();
  }
  return '0';
});

registerVariable('followers', async (ctx) => {
  const data = await getLiveChannelData(ctx);
  if (data?.followers_count !== undefined) {
    return data.followers_count.toString();
  }
  return '0';
});

registerVariable('uptime', async (ctx) => {
  const data = await getLiveChannelData(ctx);

  // Try created_at from livestream (v2 API field)
  const startTimeStr = data?.livestream?.created_at || data?.livestream?.start_time;

  if (!startTimeStr) {
    return 'Stream is offline';
  }

  const start = new Date(startTimeStr);
  const now = new Date();
  const diff = now.getTime() - start.getTime();

  if (diff < 0) return 'Stream is offline';

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
});

// ============================================
// Followage - check local database
// ============================================

registerVariable('followage', async (ctx) => {
  try {
    // Look up the user in channelUsers table
    const channelUser = db.select()
      .from(schema.channelUsers)
      .where(
        and(
          eq(schema.channelUsers.kickUserId, ctx.user.id),
          eq(schema.channelUsers.isFollower, true)
        )
      )
      .get();

    if (channelUser?.followedAt) {
      const followDate = new Date(channelUser.followedAt);
      const now = new Date();
      const diff = now.getTime() - followDate.getTime();

      const days = Math.floor(diff / 86400000);
      const months = Math.floor(days / 30);
      const years = Math.floor(days / 365);

      if (years > 0) {
        const remainingMonths = Math.floor((days % 365) / 30);
        return remainingMonths > 0
          ? `${years} year${years > 1 ? 's' : ''}, ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`
          : `${years} year${years > 1 ? 's' : ''}`;
      } else if (months > 0) {
        const remainingDays = days % 30;
        return remainingDays > 0
          ? `${months} month${months > 1 ? 's' : ''}, ${remainingDays} day${remainingDays > 1 ? 's' : ''}`
          : `${months} month${months > 1 ? 's' : ''}`;
      } else if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''}`;
      } else {
        return 'today';
      }
    }

    // User found but no follow date recorded
    if (channelUser) {
      return 'Following (date unknown)';
    }

    return 'Not following';
  } catch (err) {
    log.debug({ err }, 'Followage lookup failed');
    return 'Unknown';
  }
});

// ============================================
// Args handling
// ============================================

registerVariable('args', (ctx) => ctx.args.join(' ') || '');
registerVariable('1', (ctx) => ctx.args[0] || '');
registerVariable('2', (ctx) => ctx.args[1] || '');
registerVariable('3', (ctx) => ctx.args[2] || '');
registerVariable('4', (ctx) => ctx.args[3] || '');
registerVariable('5', (ctx) => ctx.args[4] || '');

// Random selection from list: $(random "option1" "option2" "option3")
registerVariable('random', (ctx, ...options) => {
  if (options.length === 0) return '';
  return options[Math.floor(Math.random() * options.length)];
});

// ============================================
// Counter system
// ============================================

registerVariable('counter', async (ctx, counterName) => {
  if (!counterName) return '0';
  
  const counter = db.select()
    .from(schema.counters)
    .where(eq(schema.counters.name, counterName))
    .get();
  
  return (counter?.value || 0).toString();
});

registerVariable('counter.add', async (ctx, counterName, amountStr = '1') => {
  if (!counterName) return '0';
  
  const amount = parseInt(amountStr, 10) || 1;
  
  db.run(sql`
    INSERT INTO counters (name, value) VALUES (${counterName}, ${amount})
    ON CONFLICT(name) DO UPDATE SET value = value + ${amount}
  `);
  
  const counter = db.select()
    .from(schema.counters)
    .where(eq(schema.counters.name, counterName))
    .get();
  
  return (counter?.value || 0).toString();
});

registerVariable('counter.set', async (ctx, counterName, valueStr = '0') => {
  if (!counterName) return '0';
  
  const value = parseInt(valueStr, 10) || 0;
  
  db.run(sql`
    INSERT INTO counters (name, value) VALUES (${counterName}, ${value})
    ON CONFLICT(name) DO UPDATE SET value = ${value}
  `);
  
  return value.toString();
});

// ============================================
// Time variables
// ============================================

registerVariable('time', () => {
  return new Date().toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
});

registerVariable('date', () => {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
});

// ============================================
// Misc variables
// ============================================

registerVariable('latency', () => `${currentLatency}`);

registerVariable('commandlist', () => {
  const cmds = db.select({ name: schema.commands.name })
    .from(schema.commands)
    .where(eq(schema.commands.enabled, true))
    .all();
  
  return cmds.map(c => `!${c.name}`).join(', ');
});

// Export for testing
export { variables };
