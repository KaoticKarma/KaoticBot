import { config } from '../config/index.js';
import { db, schema, seedAccountDefaults } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { createChildLogger } from '../utils/logger.js';
import crypto from 'crypto';

const log = createChildLogger('oauth');

// PKCE code verifier storage (state -> { verifier, isBot })
const codeVerifiers = new Map<string, { verifier: string; isBot: boolean }>();

// Kick OAuth endpoints
const KICK_AUTH_URL = 'https://id.kick.com/oauth/authorize';
const KICK_TOKEN_URL = 'https://id.kick.com/oauth/token';
const KICK_USER_URL = 'https://api.kick.com/public/v1/users';
const KICK_CHANNEL_URL = 'https://api.kick.com/public/v1/channels';
// Public API for getting chatroom ID (doesn't require auth)
const KICK_PUBLIC_CHANNEL_URL = 'https://kick.com/api/v2/channels';

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  
  return { verifier, challenge };
}

/**
 * Generate OAuth authorization URL for user accounts
 */
export function generateAuthUrl(): { url: string; state: string } {
  const state = crypto.randomBytes(16).toString('hex');
  const { verifier, challenge } = generatePKCE();
  
  codeVerifiers.set(state, { verifier, isBot: false });
  setTimeout(() => codeVerifiers.delete(state), 10 * 60 * 1000);
  
  const params = new URLSearchParams({
    client_id: config.KICK_CLIENT_ID,
    redirect_uri: config.KICK_REDIRECT_URI,
    response_type: 'code',
    scope: 'user:read channel:read channel:write chat:write chat:read events:subscribe',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  
  const url = `${KICK_AUTH_URL}?${params.toString()}`;
  log.info({ state }, 'Generated OAuth URL');
  
  return { url, state };
}

/**
 * Generate OAuth authorization URL for the BOT account
 * This is a one-time setup to authenticate the bot
 */
export function generateBotAuthUrl(): { url: string; state: string } {
  const state = 'bot_' + crypto.randomBytes(16).toString('hex');
  const { verifier, challenge } = generatePKCE();
  
  codeVerifiers.set(state, { verifier, isBot: true });
  setTimeout(() => codeVerifiers.delete(state), 10 * 60 * 1000);
  
  // Bot needs chat:write scope to send messages
  const params = new URLSearchParams({
    client_id: config.KICK_CLIENT_ID,
    redirect_uri: config.KICK_REDIRECT_URI,
    response_type: 'code',
    scope: 'user:read chat:write chat:read',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  
  const url = `${KICK_AUTH_URL}?${params.toString()}`;
  log.info({ state }, 'Generated Bot OAuth URL');
  
  return { url, state };
}

/**
 * Check if a state is for bot authentication
 */
export function isBotAuthState(state: string): boolean {
  const stored = codeVerifiers.get(state);
  return stored?.isBot === true;
}

/**
 * Exchange authorization code for tokens and create/update account
 */
export async function exchangeCode(code: string, state: string): Promise<{
  accountId: number;
  isNewAccount: boolean;
} | null> {
  const stored = codeVerifiers.get(state);
  
  if (!stored) {
    log.error({ state }, 'Code verifier not found');
    return null;
  }
  
  const { verifier, isBot } = stored;
  codeVerifiers.delete(state);
  
  // If this is bot auth, handle separately
  if (isBot) {
    const success = await exchangeBotCode(code, verifier);
    if (success) {
      // Return a fake result - bot auth doesn't create a user session
      return { accountId: -1, isNewAccount: false };
    }
    return null;
  }
  
  try {
    log.info('Exchanging authorization code...');
    
    const tokenResponse = await fetch(KICK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.KICK_CLIENT_ID,
        client_secret: config.KICK_CLIENT_SECRET,
        redirect_uri: config.KICK_REDIRECT_URI,
        code,
        code_verifier: verifier,
      }),
    });
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      log.error({ status: tokenResponse.status, error }, 'Token exchange failed');
      return null;
    }
    
    const tokenData = await tokenResponse.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type: string;
      scope?: string;
    };
    
    log.info('Token exchange successful, fetching user info...');
    
    const userInfo = await fetchUserInfo(tokenData.access_token);
    if (!userInfo) {
      log.error('Failed to fetch user info');
      return null;
    }
    
    const channelInfo = await fetchChannelInfo(tokenData.access_token, userInfo.username);
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    
    // Check if account exists
    const existingAccount = db.select()
      .from(schema.accounts)
      .where(eq(schema.accounts.kickUserId, userInfo.user_id))
      .get();
    
    let accountId: number;
    let isNewAccount = false;
    
    if (existingAccount) {
      log.info({ accountId: existingAccount.id, username: userInfo.username }, 'Updating existing account');
      
      db.update(schema.accounts)
        .set({
          kickUsername: userInfo.username,
          kickDisplayName: userInfo.username,
          kickEmail: userInfo.email || null,
          kickProfilePic: userInfo.profile_pic || null,
          kickChannelId: channelInfo?.channel_id || null,
          kickChatroomId: channelInfo?.chatroom_id || null,
          kickChannelSlug: channelInfo?.slug || userInfo.username,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          tokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.accounts.id, existingAccount.id))
        .run();
      
      accountId = existingAccount.id;
    } else {
      log.info({ userId: userInfo.user_id, username: userInfo.username }, 'Creating new account');
      
      const result = db.insert(schema.accounts)
        .values({
          kickUserId: userInfo.user_id,
          kickUsername: userInfo.username,
          kickDisplayName: userInfo.username,
          kickEmail: userInfo.email || null,
          kickProfilePic: userInfo.profile_pic || null,
          kickChannelId: channelInfo?.channel_id || null,
          kickChatroomId: channelInfo?.chatroom_id || null,
          kickChannelSlug: channelInfo?.slug || userInfo.username,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          tokenExpiresAt: expiresAt,
          subscriptionTier: 'free',
          botEnabled: false,
        })
        .run();
      
      accountId = Number(result.lastInsertRowid);
      isNewAccount = true;
      
      // Seed default data for new account
      await seedAccountDefaults(accountId);
    }
    
    // Also store in legacy tokens table for backwards compatibility
    db.delete(schema.tokens).where(eq(schema.tokens.type, 'kick')).run();
    db.insert(schema.tokens).values({
      type: 'kick',
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      expiresAt: expiresAt,
      scope: tokenData.scope || null,
    }).run();
    
    log.info({ accountId, isNewAccount, username: userInfo.username }, 'OAuth flow completed');
    
    return { accountId, isNewAccount };
    
  } catch (error) {
    log.error({ error }, 'OAuth exchange error');
    return null;
  }
}

/**
 * Exchange authorization code for BOT account tokens
 * Stores in bot_config table
 */
async function exchangeBotCode(code: string, verifier: string): Promise<boolean> {
  try {
    log.info('Exchanging bot authorization code...');
    
    const tokenResponse = await fetch(KICK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.KICK_CLIENT_ID,
        client_secret: config.KICK_CLIENT_SECRET,
        redirect_uri: config.KICK_REDIRECT_URI,
        code,
        code_verifier: verifier,
      }),
    });
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      log.error({ status: tokenResponse.status, error }, 'Bot token exchange failed');
      return false;
    }
    
    const tokenData = await tokenResponse.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    
    log.info('Bot token exchange successful, fetching bot user info...');
    
    const userInfo = await fetchUserInfo(tokenData.access_token);
    if (!userInfo) {
      log.error('Failed to fetch bot user info');
      return false;
    }
    
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    
    // Check if bot config exists
    const existingConfig = db.select()
      .from(schema.botConfig)
      .get();
    
    if (existingConfig) {
      log.info({ botUserId: userInfo.user_id, username: userInfo.username }, 'Updating existing bot config');
      
      db.update(schema.botConfig)
        .set({
          botUserId: userInfo.user_id,
          botUsername: userInfo.username,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          tokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.botConfig.id, existingConfig.id))
        .run();
    } else {
      log.info({ botUserId: userInfo.user_id, username: userInfo.username }, 'Creating bot config');
      
      db.insert(schema.botConfig)
        .values({
          botUserId: userInfo.user_id,
          botUsername: userInfo.username,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          tokenExpiresAt: expiresAt,
        })
        .run();
    }
    
    log.info({ botUsername: userInfo.username }, 'Bot authentication completed successfully');
    return true;
    
  } catch (error) {
    log.error({ error }, 'Bot OAuth exchange error');
    return false;
  }
}

/**
 * Refresh the bot account token
 */
export async function refreshBotToken(): Promise<boolean> {
  const botConfig = db.select()
    .from(schema.botConfig)
    .get();
  
  if (!botConfig || !botConfig.refreshToken) {
    log.error('No bot refresh token available');
    return false;
  }
  
  try {
    log.info('Refreshing bot token...');
    
    const response = await fetch(KICK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.KICK_CLIENT_ID,
        client_secret: config.KICK_CLIENT_SECRET,
        refresh_token: botConfig.refreshToken,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      log.error({ status: response.status, error }, 'Bot token refresh failed');
      return false;
    }
    
    const tokenData = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    
    db.update(schema.botConfig)
      .set({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || botConfig.refreshToken,
        tokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.botConfig.id, botConfig.id))
      .run();
    
    log.info('Bot token refreshed successfully');
    return true;
    
  } catch (error) {
    log.error({ error }, 'Error refreshing bot token');
    return false;
  }
}

/**
 * Get bot configuration
 */
export function getBotConfig(): typeof schema.botConfig.$inferSelect | null {
  return db.select().from(schema.botConfig).get() || null;
}

async function fetchUserInfo(accessToken: string): Promise<{
  user_id: number;
  username: string;
  email?: string;
  profile_pic?: string;
} | null> {
  try {
    const response = await fetch(KICK_USER_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    
    log.info({ status: response.status, url: KICK_USER_URL }, 'User info response');
    
    if (!response.ok) {
      const error = await response.text();
      log.error({ status: response.status, error, url: KICK_USER_URL }, 'Failed to fetch user info');
      return null;
    }
    
    const data = await response.json() as {
      data?: Array<{
        user_id: number;
        name: string;
        email?: string;
        profile_picture?: string;
      }> | {
        user_id: number;
        name: string;
        email?: string;
        profile_picture?: string;
      };
    };
    
    log.info({ data }, 'User info response data');
    
    // Handle both array and object responses
    let userData: { user_id: number; name: string; email?: string; profile_picture?: string } | undefined;
    
    if (Array.isArray(data.data)) {
      userData = data.data[0];
    } else if (data.data) {
      userData = data.data;
    }
    
    if (!userData) {
      log.error({ data }, 'Invalid user info response - no user data');
      return null;
    }
    
    return {
      user_id: userData.user_id,
      username: userData.name,
      email: userData.email,
      profile_pic: userData.profile_picture,
    };
    
  } catch (error) {
    log.error({ error }, 'Error fetching user info');
    return null;
  }
}

/**
 * Fetch channel info including chatroom ID
 * First tries the authenticated v1 API, then fetches chatroom from public v2 API
 */
async function fetchChannelInfo(accessToken: string, username: string): Promise<{
  channel_id: number;
  chatroom_id: number;
  slug: string;
} | null> {
  try {
    // First, get basic channel info from v1 API
    const response = await fetch(KICK_CHANNEL_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    
    log.info({ status: response.status, url: KICK_CHANNEL_URL }, 'Channel info response (v1 API)');
    
    if (!response.ok) {
      log.info({ status: response.status }, 'Could not fetch channel info from v1 API');
      // Try public API as fallback
      return await fetchChannelInfoFromPublicApi(username);
    }
    
    const data = await response.json() as {
      data?: Array<{
        broadcaster_user_id: number;
        id?: number;
        slug: string;
        chatroom?: { id: number };
      }> | {
        broadcaster_user_id: number;
        id?: number;
        slug: string;
        chatroom?: { id: number };
      };
    };
    
    log.info({ data }, 'Channel info response data (v1 API)');
    
    // Handle both array and object responses
    let channelData: { broadcaster_user_id: number; id?: number; slug: string; chatroom?: { id: number } } | undefined;
    
    if (Array.isArray(data.data)) {
      channelData = data.data[0];
    } else if (data.data) {
      channelData = data.data;
    }
    
    if (!channelData) {
      return await fetchChannelInfoFromPublicApi(username);
    }
    
    const channelId = channelData.broadcaster_user_id || channelData.id;
    const slug = channelData.slug || username;
    
    // Check if v1 API returned chatroom ID
    if (channelData.chatroom?.id) {
      log.info({ channelId, chatroomId: channelData.chatroom.id, slug }, 'Got chatroom ID from v1 API');
      return {
        channel_id: channelId!,
        chatroom_id: channelData.chatroom.id,
        slug,
      };
    }
    
    // v1 API didn't return chatroom ID - fetch from public API
    log.info({ slug }, 'v1 API missing chatroom ID, fetching from public API...');
    const publicInfo = await fetchChannelInfoFromPublicApi(slug);
    
    if (publicInfo) {
      return publicInfo;
    }
    
    // Last resort - use channelId as chatroomId (might not work for chat)
    log.warn({ channelId }, 'Could not get chatroom ID - using channelId as fallback');
    return {
      channel_id: channelId!,
      chatroom_id: channelId!,
      slug,
    };
    
  } catch (error) {
    log.error({ error }, 'Error fetching channel info');
    return await fetchChannelInfoFromPublicApi(username);
  }
}

/**
 * Fetch channel info from Kick's public v2 API (no auth required)
 * This endpoint returns the chatroom ID
 */
async function fetchChannelInfoFromPublicApi(slug: string): Promise<{
  channel_id: number;
  chatroom_id: number;
  slug: string;
} | null> {
  try {
    const url = `${KICK_PUBLIC_CHANNEL_URL}/${slug}`;
    log.info({ url }, 'Fetching channel info from public API');
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    log.info({ status: response.status, url }, 'Public API response');
    
    if (!response.ok) {
      log.error({ status: response.status }, 'Public API request failed');
      return null;
    }
    
    const data = await response.json() as {
      id?: number;
      user_id?: number;
      slug?: string;
      chatroom?: {
        id: number;
      };
    };
    
    log.info({ 
      id: data.id,
      user_id: data.user_id,
      slug: data.slug,
      chatroom_id: data.chatroom?.id 
    }, 'Public API channel data');
    
    if (!data.chatroom?.id) {
      log.error('Public API response missing chatroom ID');
      return null;
    }
    
    const channelId = data.user_id || data.id;
    
    log.info({ 
      channelId, 
      chatroomId: data.chatroom.id, 
      slug: data.slug 
    }, '✅ Successfully fetched chatroom ID from public API');
    
    return {
      channel_id: channelId!,
      chatroom_id: data.chatroom.id,
      slug: data.slug || slug,
    };
    
  } catch (error) {
    log.error({ error, slug }, 'Error fetching from public API');
    return null;
  }
}

export async function refreshAccountTokens(accountId: number): Promise<boolean> {
  const account = db.select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, accountId))
    .get();
  
  if (!account || !account.refreshToken) {
    log.error({ accountId }, 'No refresh token available');
    return false;
  }
  
  try {
    const response = await fetch(KICK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.KICK_CLIENT_ID,
        client_secret: config.KICK_CLIENT_SECRET,
        refresh_token: account.refreshToken,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      log.error({ status: response.status, error, accountId }, 'Token refresh failed');
      return false;
    }
    
    const tokenData = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    
    db.update(schema.accounts)
      .set({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || account.refreshToken,
        tokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.accounts.id, accountId))
      .run();
    
    log.info({ accountId }, 'Tokens refreshed successfully');
    return true;
    
  } catch (error) {
    log.error({ error, accountId }, 'Error refreshing tokens');
    return false;
  }
}

export async function getAccountWithValidTokens(accountId: number): Promise<typeof schema.accounts.$inferSelect | null> {
  const account = db.select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, accountId))
    .get();
  
  if (!account) return null;
  
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  
  if (account.tokenExpiresAt <= fiveMinutesFromNow) {
    log.info({ accountId }, 'Token expiring soon, refreshing...');
    const refreshed = await refreshAccountTokens(accountId);
    
    if (!refreshed) return null;
    
    return db.select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId))
      .get() || null;
  }
  
  return account;
}
