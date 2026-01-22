import { config } from '../config/index.js';
import { createChildLogger } from '../utils/logger.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaType from '../db/schema.js';
import { eq } from 'drizzle-orm';

const log = createChildLogger('kick-api');

const KICK_API_BASE = 'https://api.kick.com/public/v1';

interface SendMessageResult {
  success: boolean;
  data?: any;
  error?: string;
}

class KickApi {
  private db: BetterSQLite3Database<typeof schemaType> | null = null;
  private schema: typeof schemaType | null = null;
  
  setDb(db: BetterSQLite3Database<typeof schemaType>, schema: typeof schemaType) {
    this.db = db;
    this.schema = schema;
  }
  
  /**
   * Get legacy token from database (for backwards compatibility)
   */
  private getToken(): { accessToken: string; expiresAt: Date } | null {
    if (!this.db || !this.schema) return null;
    
    const token = this.db.select()
      .from(this.schema.tokens)
      .where(eq(this.schema.tokens.type, 'kick'))
      .get();
    
    if (!token) return null;
    
    return {
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
    };
  }
  
  /**
   * Check if legacy authentication is valid
   */
  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;
    
    // Check if token is expired
    return token.expiresAt > new Date();
  }
  
  /**
   * Get legacy auth status
   */
  getAuthStatus(): { authenticated: boolean; expiresAt?: Date } {
    const token = this.getToken();
    
    if (!token) {
      return { authenticated: false };
    }
    
    const isValid = token.expiresAt > new Date();
    
    return {
      authenticated: isValid,
      expiresAt: token.expiresAt,
    };
  }
  
  /**
   * Send message using legacy token (backwards compatibility)
   */
  async sendMessage(chatroomId: number, content: string): Promise<SendMessageResult> {
    const token = this.getToken();
    
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }
    
    return this.sendMessageWithToken(chatroomId, content, token.accessToken);
  }
  
  /**
   * Send message with specific access token (for multi-tenant)
   * Note: broadcasterUserId is the target channel's user ID
   */
  async sendMessageWithToken(
    broadcasterUserId: number, 
    content: string, 
    accessToken: string
  ): Promise<SendMessageResult> {
    // Use config chatroom if 0 passed (legacy behavior)
    const targetBroadcaster = broadcasterUserId || config.KICK_CHATROOM_ID;
    
    if (!targetBroadcaster) {
      return { success: false, error: 'No broadcaster user ID' };
    }
    
    try {
      // Log the full request for debugging
      log.info({ 
        broadcasterUserId: targetBroadcaster, 
        contentLength: content.length,
        tokenPreview: accessToken.substring(0, 20) + '...'
      }, '📤 Sending message to Kick API');
      
      const requestBody = {
        broadcaster_user_id: targetBroadcaster,
        content: content,
        type: 'user',
      };
      
      log.info({ requestBody }, '📦 Request body');
      
      // Kick API v1 uses /chat endpoint with broadcaster_user_id
      const response = await fetch(`${KICK_API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      const responseText = await response.text();
      
      log.info({ 
        status: response.status,
        responseText: responseText.substring(0, 500)
      }, '📥 Kick API response');
      
      if (!response.ok) {
        log.error({ 
          status: response.status, 
          error: responseText,
          broadcasterUserId: targetBroadcaster,
          endpoint: `${KICK_API_BASE}/chat`
        }, 'Failed to send message');
        
        return { 
          success: false, 
          error: `HTTP ${response.status}: ${responseText}` 
        };
      }
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { raw: responseText };
      }
      
      log.info({ broadcasterUserId: targetBroadcaster }, '✅ Message sent successfully');
      
      return { success: true, data };
      
    } catch (error) {
      log.error({ error, broadcasterUserId: targetBroadcaster }, 'Error sending message');
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * Delete a message
   */
  async deleteMessage(messageId: string, accessToken?: string): Promise<SendMessageResult> {
    const token = accessToken || this.getToken()?.accessToken;
    
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }
    
    try {
      const response = await fetch(`${KICK_API_BASE}/chat/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }
      
      return { success: true };
      
    } catch (error) {
      log.error({ error, messageId }, 'Error deleting message');
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * Timeout a user
   */
  async timeoutUser(
    userId: number, 
    duration: number, 
    reason?: string,
    accessToken?: string
  ): Promise<SendMessageResult> {
    const token = accessToken || this.getToken()?.accessToken;
    
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }
    
    try {
      const response = await fetch(`${KICK_API_BASE}/channels/timeouts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          banned_user_id: userId,
          duration: duration,
          reason: reason || 'Moderation action',
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }
      
      return { success: true };
      
    } catch (error) {
      log.error({ error, userId }, 'Error timing out user');
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * Ban a user
   */
  async banUser(
    userId: number, 
    reason?: string,
    accessToken?: string
  ): Promise<SendMessageResult> {
    const token = accessToken || this.getToken()?.accessToken;
    
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }
    
    try {
      const response = await fetch(`${KICK_API_BASE}/channels/bans`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          banned_user_id: userId,
          reason: reason || 'Banned',
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }
      
      return { success: true };
      
    } catch (error) {
      log.error({ error, userId }, 'Error banning user');
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * Get channel info
   */
  async getChannel(channelSlug: string, accessToken?: string): Promise<any | null> {
    const token = accessToken || this.getToken()?.accessToken;
    
    try {
      const response = await fetch(`${KICK_API_BASE}/channels/${channelSlug}`, {
        headers: token ? {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        } : {
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      return data.data || data;
      
    } catch (error) {
      log.error({ error, channelSlug }, 'Error fetching channel');
      return null;
    }
  }
  
  /**
   * Get current user info
   */
  async getCurrentUser(accessToken: string): Promise<any | null> {
    try {
      const response = await fetch(`${KICK_API_BASE}/users`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      // Handle array response
      if (Array.isArray(data.data)) {
        return data.data[0];
      }
      return data.data || data;
      
    } catch (error) {
      log.error({ error }, 'Error fetching current user');
      return null;
    }
  }
}

export const kickApi = new KickApi();
