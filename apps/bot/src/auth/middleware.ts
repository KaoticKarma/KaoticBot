import { FastifyRequest, FastifyReply } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and, gt, lt } from 'drizzle-orm';
import { createChildLogger } from '../utils/logger.js';
import { config } from '../config/index.js';
import crypto from 'crypto';

const log = createChildLogger('auth');

// Session duration: 7 days
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// Cookie name
export const SESSION_COOKIE = 'csb_session';

// Type for authenticated request
export interface AuthenticatedRequest extends FastifyRequest {
  account: typeof schema.accounts.$inferSelect;
}

/**
 * Generate a secure session ID
 */
export function generateSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Create a new session for an account
 */
export async function createSession(accountId: number): Promise<string> {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  
  db.insert(schema.sessions).values({
    id: sessionId,
    accountId,
    expiresAt,
  }).run();
  
  log.info({ accountId, sessionId: sessionId.slice(0, 8) + '...' }, 'Session created');
  
  return sessionId;
}

/**
 * Get session and associated account if valid
 */
export function getSessionWithAccount(sessionId: string): typeof schema.accounts.$inferSelect | null {
  const now = Date.now();
  
  // Find session that hasn't expired
  const session = db.select()
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.id, sessionId),
        gt(schema.sessions.expiresAt, new Date(now))
      )
    )
    .get();
  
  if (!session) {
    log.debug({ sessionId: sessionId.slice(0, 8) + '...' }, 'Session not found or expired');
    return null;
  }
  
  // Get account
  const account = db.select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, session.accountId))
    .get();
  
  if (!account) {
    log.debug({ sessionId: sessionId.slice(0, 8) + '...', accountId: session.accountId }, 'Account not found for session');
  }
  
  return account || null;
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): void {
  db.delete(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .run();
  
  log.info({ sessionId: sessionId.slice(0, 8) + '...' }, 'Session deleted');
}

/**
 * Delete all sessions for an account
 */
export function deleteAllSessions(accountId: number): void {
  db.delete(schema.sessions)
    .where(eq(schema.sessions.accountId, accountId))
    .run();
  
  log.info({ accountId }, 'All sessions deleted for account');
}

/**
 * Clean up expired sessions (call periodically)
 */
export function cleanupExpiredSessions(): number {
  try {
    const now = new Date();
    
    const result = db.delete(schema.sessions)
      .where(lt(schema.sessions.expiresAt, now))
      .run();
    
    if (result.changes > 0) {
      log.info({ count: result.changes }, 'Cleaned up expired sessions');
    }
    
    return result.changes;
  } catch (err) {
    // Table may not exist yet during startup
    log.debug('Session cleanup skipped - table may not exist yet');
    return 0;
  }
}

/**
 * Auth middleware - requires valid session
 * Adds `account` to the request object
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const sessionId = request.cookies[SESSION_COOKIE];
  
  // Debug logging for production
  log.debug({ 
    hasCookie: !!sessionId,
    cookiePreview: sessionId ? sessionId.slice(0, 8) + '...' : 'none',
    allCookies: Object.keys(request.cookies),
    url: request.url
  }, 'Auth check');
  
  if (!sessionId) {
    log.debug({ url: request.url }, 'No session cookie found');
    return reply.code(401).send({ 
      error: 'Unauthorized',
      message: 'No session found. Please log in.' 
    });
  }
  
  const account = getSessionWithAccount(sessionId);
  
  if (!account) {
    log.debug({ sessionId: sessionId.slice(0, 8) + '...' }, 'Invalid or expired session');
    // Clear invalid cookie
    clearSessionCookie(reply);
    return reply.code(401).send({ 
      error: 'Unauthorized',
      message: 'Session expired or invalid. Please log in again.' 
    });
  }
  
  log.debug({ accountId: account.id, username: account.kickUsername }, 'Auth successful');
  
  // Attach account to request
  (request as AuthenticatedRequest).account = account;
}

/**
 * Optional auth middleware - doesn't fail if not authenticated
 * Adds `account` to request if authenticated
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const sessionId = request.cookies[SESSION_COOKIE];
  
  if (!sessionId) {
    return;
  }
  
  const account = getSessionWithAccount(sessionId);
  
  if (account) {
    (request as AuthenticatedRequest).account = account;
  }
}

/**
 * Get cookie options for current environment
 */
function getCookieOptions(isProduction: boolean) {
  const options: any = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    maxAge: SESSION_DURATION_MS / 1000, // in seconds
    path: '/',
  };
  
  // In production, explicitly set domain if configured
  // This helps with reverse proxy setups
  if (isProduction && config.BOT_HOST) {
    // Don't set domain - let browser infer it from the request
    // Setting explicit domain can cause issues with some proxy setups
  }
  
  return options;
}

/**
 * Set session cookie on reply
 */
export function setSessionCookie(
  reply: FastifyReply, 
  sessionId: string,
  isProduction: boolean
): void {
  const options = getCookieOptions(isProduction);
  
  log.debug({ 
    sessionId: sessionId.slice(0, 8) + '...',
    options: { ...options, httpOnly: true }
  }, 'Setting session cookie');
  
  reply.setCookie(SESSION_COOKIE, sessionId, options);
}

/**
 * Clear session cookie on reply
 */
export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

// Track if cleanup has been started
let cleanupStarted = false;

/**
 * Start periodic session cleanup - call after database is initialized
 */
export function startSessionCleanup(): void {
  if (cleanupStarted) return;
  cleanupStarted = true;
  
  // Initial cleanup
  cleanupExpiredSessions();
  
  // Start periodic cleanup (every hour)
  setInterval(() => {
    cleanupExpiredSessions();
  }, 60 * 60 * 1000);
  
  log.info('Session cleanup scheduler started');
}
