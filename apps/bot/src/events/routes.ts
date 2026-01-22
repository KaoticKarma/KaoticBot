import { FastifyInstance } from 'fastify';
import { eventMessagesService } from './service.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('events-routes');

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  // Get all event messages
  app.get('/api/events', async () => {
    return eventMessagesService.getAll();
  });

  // Get specific event message
  app.get('/api/events/:type', async (request) => {
    const { type } = request.params as { type: string };
    const message = eventMessagesService.getByType(type);
    
    if (!message) {
      return { error: 'Event type not found' };
    }
    
    return message;
  });

  // Update event message
  app.patch('/api/events/:type', async (request, reply) => {
    const { type } = request.params as { type: string };
    const body = request.body as { enabled?: boolean; message?: string };
    
    const validTypes = ['follow', 'subscription', 'gifted_sub', 'raid', 'kick'];
    if (!validTypes.includes(type)) {
      return reply.code(400).send({ error: 'Invalid event type' });
    }

    try {
      const result = eventMessagesService.update(type, body);
      log.info({ type, updates: body }, 'Event message updated');
      return result;
    } catch (err) {
      log.error({ err, type }, 'Failed to update event message');
      return reply.code(500).send({ error: 'Failed to update event message' });
    }
  });

  // Reload event messages cache
  app.post('/api/events/reload', async () => {
    await eventMessagesService.loadMessages();
    return { success: true, message: 'Event messages reloaded' };
  });

  // Test event message (for debugging)
  app.post('/api/events/test/:type', async (request, reply) => {
    const { type } = request.params as { type: string };
    const body = request.body as { username?: string; amount?: number };
    
    const username = body.username || 'TestUser';
    const amount = body.amount || 1;

    try {
      switch (type) {
        case 'follow':
          await eventMessagesService.onFollow(username);
          break;
        case 'subscription':
          await eventMessagesService.onSubscription(username);
          break;
        case 'gifted_sub':
          await eventMessagesService.onGiftedSub(username, amount);
          break;
        case 'raid':
          await eventMessagesService.onRaid(username, amount);
          break;
        case 'kick':
          await eventMessagesService.onKick(username, amount);
          break;
        default:
          return reply.code(400).send({ error: 'Invalid event type' });
      }
      
      return { success: true, message: `Test ${type} event sent` };
    } catch (err) {
      log.error({ err, type }, 'Failed to send test event');
      return reply.code(500).send({ error: 'Failed to send test event' });
    }
  });

  log.info('Event routes registered');
}
