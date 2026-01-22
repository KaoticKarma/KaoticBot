import type { VariableContext, VariableFunction } from '@kaoticbot/shared';
import { db, schema } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';
import { createChildLogger } from './logger.js';

const log = createChildLogger('variables');

// Registry of all available variables
const variables: Map<string, VariableFunction> = new Map();

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
// Built-in Variable Handlers
// ============================================

// User variables
registerVariable('user', (ctx) => ctx.user.displayName);
registerVariable('username', (ctx) => ctx.user.username);
registerVariable('userid', (ctx) => ctx.user.id.toString());

// Target user (for commands like !hug @someone)
registerVariable('touser', (ctx) => ctx.touser || ctx.user.displayName);
registerVariable('toname', (ctx) => {
  if (ctx.touser) {
    // Remove @ if present and return lowercase
    return ctx.touser.replace(/^@/, '').toLowerCase();
  }
  return ctx.user.username;
});

// Random user from chat
registerVariable('randomuser', (ctx) => {
  if (ctx.chatUsers.length === 0) {
    return ctx.user.displayName;
  }
  // Filter out the command sender for more interesting results
  const others = ctx.chatUsers.filter(u => u.toLowerCase() !== ctx.user.username.toLowerCase());
  if (others.length === 0) {
    return ctx.chatUsers[Math.floor(Math.random() * ctx.chatUsers.length)];
  }
  return others[Math.floor(Math.random() * others.length)];
});

// Channel info
registerVariable('channel', (ctx) => ctx.channel.user?.username || 'Unknown');
registerVariable('title', (ctx) => ctx.channel.livestream?.session_title || 'Offline');
registerVariable('game', (ctx) => ctx.channel.livestream?.categories?.[0]?.name || 'No category');
registerVariable('viewers', (ctx) => (ctx.channel.livestream?.viewer_count || 0).toString());

// Stream status
registerVariable('uptime', (ctx) => {
  if (!ctx.channel.livestream?.start_time) {
    return 'Stream is offline';
  }
  const start = new Date(ctx.channel.livestream.start_time);
  const now = new Date();
  const diff = now.getTime() - start.getTime();
  
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

// Args handling
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

// Counter system
registerVariable('counter', async (ctx, counterName) => {
  if (!counterName) return '0';
  
  const counter = db.select()
    .from(schema.counters)
    .where(eq(schema.counters.name, counterName))
    .get();
  
  return (counter?.value || 0).toString();
});

// Counter increment: $(counter.add deaths 1)
registerVariable('counter.add', async (ctx, counterName, amountStr = '1') => {
  if (!counterName) return '0';
  
  const amount = parseInt(amountStr, 10) || 1;
  
  // Upsert counter
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

// Counter set: $(counter.set deaths 0)
registerVariable('counter.set', async (ctx, counterName, valueStr = '0') => {
  if (!counterName) return '0';
  
  const value = parseInt(valueStr, 10) || 0;
  
  db.run(sql`
    INSERT INTO counters (name, value) VALUES (${counterName}, ${value})
    ON CONFLICT(name) DO UPDATE SET value = ${value}
  `);
  
  return value.toString();
});

// Time variables
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

// Latency placeholder (will be replaced by command handler with actual value)
registerVariable('latency', () => '0');

// Followage placeholder (requires API call - will be implemented in command handler)
registerVariable('followage', () => 'Unknown');

// Command list
registerVariable('commandlist', () => {
  const cmds = db.select({ name: schema.commands.name })
    .from(schema.commands)
    .where(eq(schema.commands.enabled, true))
    .all();
  
  return cmds.map(c => `!${c.name}`).join(', ');
});

// Export for testing
export { variables };
