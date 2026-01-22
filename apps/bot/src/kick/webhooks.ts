// kick/webhooks.ts
// Handler for Kick webhook events - integrate with existing webhook server

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { onStreamLive, onStreamOffline, onChatMessage, onViewerCountUpdate, onNewFollower, onNewSub, onGiftedSub } from '../stats/tracker.js';
import { logger } from '../utils/logger.js';

// Kick webhook event types
interface KickWebhookEvent {
  event: string;
  data: any;
}

interface LivestreamStatusData {
  broadcaster: {
    user_id: number;
    slug: string;
  };
  is_live: boolean;
  livestream?: {
    id: string;
    title: string;
    categories?: Array<{ name: string }>;
    viewer_count?: number;
    thumbnail?: { url: string };
  };
}

interface ChatMessageData {
  message_id: string;
  broadcaster: { user_id: number };
  sender: {
    user_id: number;
    username: string;
  };
  content: string;
}

interface FollowData {
  broadcaster: { user_id: number };
  follower: { user_id: number; username: string };
}

interface SubscriptionData {
  broadcaster: { user_id: number };
  subscriber: { user_id: number; username: string };
}

interface GiftedSubsData {
  broadcaster: { user_id: number };
  gifter: { user_id: number; username: string };
  gift_count: number;
}

/**
 * Register webhook routes for Kick events
 * Add this to your existing Fastify server setup
 */
export async function registerKickWebhooks(fastify: FastifyInstance): Promise<void> {
  
  // Main webhook endpoint for Kick events
  fastify.post('/webhooks/kick', async (request: FastifyRequest<{ Body: KickWebhookEvent }>, reply: FastifyReply) => {
    try {
      const { event, data } = request.body;
      
      logger.info(`Received Kick webhook: ${event}`);
      
      switch (event) {
        case 'livestream.status':
          await handleLivestreamStatus(data as LivestreamStatusData);
          break;
          
        case 'chat.message.sent':
          handleChatMessage(data as ChatMessageData);
          break;
          
        case 'channel.follow':
          handleFollow(data as FollowData);
          break;
          
        case 'channel.subscription':
          handleSubscription(data as SubscriptionData);
          break;
          
        case 'kicks.gifted':
          handleGiftedSubs(data as GiftedSubsData);
          break;
          
        default:
          logger.debug(`Unhandled webhook event: ${event}`);
      }
      
      return { success: true };
      
    } catch (error) {
      logger.error('Webhook processing error:', error);
      reply.status(500).send({ error: 'Internal server error' });
    }
  });
  
  // Health check for webhook endpoint
  fastify.get('/webhooks/kick/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
}

/**
 * Handle livestream status changes (live/offline)
 */
async function handleLivestreamStatus(data: LivestreamStatusData): Promise<void> {
  logger.info(`Livestream status: ${data.is_live ? 'LIVE' : 'OFFLINE'}`);
  
  if (data.is_live && data.livestream) {
    // Stream went live
    await onStreamLive({
      title: data.livestream.title,
      category: data.livestream.categories?.[0]?.name,
      viewerCount: data.livestream.viewer_count || 0,
      streamId: data.livestream.id,
      thumbnailUrl: data.livestream.thumbnail?.url,
    });
  } else {
    // Stream went offline
    // Try to get VOD URL - Kick format is typically /channel/videos
    const vodUrl = `https://kick.com/${data.broadcaster.slug}/videos`;
    await onStreamOffline(vodUrl);
  }
}

/**
 * Handle chat messages for stats tracking
 */
function handleChatMessage(data: ChatMessageData): void {
  onChatMessage(
    data.sender.user_id.toString(),
    data.sender.username
  );
}

/**
 * Handle new follower
 */
function handleFollow(data: FollowData): void {
  logger.info(`New follower: ${data.follower.username}`);
  onNewFollower();
}

/**
 * Handle new subscription
 */
function handleSubscription(data: SubscriptionData): void {
  logger.info(`New subscriber: ${data.subscriber.username}`);
  onNewSub();
}

/**
 * Handle gifted subs
 */
function handleGiftedSubs(data: GiftedSubsData): void {
  logger.info(`Gifted subs: ${data.gifter.username} gifted ${data.gift_count}`);
  onGiftedSub(data.gift_count);
}

/**
 * Verify Kick webhook signature (if Kick provides one)
 * Implement based on Kick's webhook security documentation
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // TODO: Implement signature verification based on Kick's webhook security
  // This would typically involve HMAC-SHA256 verification
  return true;
}

export default registerKickWebhooks;
