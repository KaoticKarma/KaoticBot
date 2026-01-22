import { FastifyInstance } from 'fastify';
import { moderationService } from '../moderation/service.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('api:moderation');

export async function moderationRoutes(app: FastifyInstance): Promise<void> {
  
  // ============================================
  // SETTINGS
  // ============================================
  
  // Get moderation settings
  app.get('/api/moderation/settings', async (request, reply) => {
    const settings = moderationService.getSettings();
    if (!settings) {
      return reply.code(500).send({ error: 'Settings not loaded' });
    }
    return settings;
  });
  
  // Update moderation settings
  app.patch('/api/moderation/settings', async (request, reply) => {
    try {
      const body = request.body as any;
      log.info({ body }, 'Updating moderation settings');
      
      const updated = moderationService.updateSettings(body);
      if (!updated) {
        return reply.code(500).send({ error: 'Failed to update settings' });
      }
      
      return updated;
    } catch (error) {
      log.error({ error }, 'Failed to update moderation settings');
      return reply.code(500).send({ error: 'Failed to update settings' });
    }
  });
  
  // Reload moderation settings (after external changes)
  app.post('/api/moderation/reload', async (request, reply) => {
    try {
      await moderationService.reload();
      return { success: true };
    } catch (error) {
      log.error({ error }, 'Failed to reload moderation settings');
      return reply.code(500).send({ error: 'Failed to reload' });
    }
  });
  
  // ============================================
  // BANNED WORDS
  // ============================================
  
  // Get all banned words
  app.get('/api/moderation/banned-words', async (request, reply) => {
    return moderationService.getBannedWords();
  });
  
  // Add banned word
  app.post('/api/moderation/banned-words', async (request, reply) => {
    try {
      const body = request.body as {
        word: string;
        isRegex?: boolean;
        severity?: 'low' | 'medium' | 'high';
        action?: 'delete' | 'timeout' | 'ban';
        timeoutDuration?: number;
      };
      
      if (!body.word || body.word.trim() === '') {
        return reply.code(400).send({ error: 'Word is required' });
      }
      
      log.info({ word: body.word }, 'Adding banned word');
      const result = moderationService.addBannedWord(body);
      return result;
    } catch (error) {
      log.error({ error }, 'Failed to add banned word');
      return reply.code(500).send({ error: 'Failed to add banned word' });
    }
  });
  
  // Update banned word
  app.patch('/api/moderation/banned-words/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<{
        word: string;
        isRegex: boolean;
        severity: 'low' | 'medium' | 'high';
        action: 'delete' | 'timeout' | 'ban';
        timeoutDuration: number;
        enabled: boolean;
      }>;
      
      log.info({ id, body }, 'Updating banned word');
      const result = moderationService.updateBannedWord(parseInt(id, 10), body);
      
      if (!result) {
        return reply.code(404).send({ error: 'Banned word not found' });
      }
      
      return result;
    } catch (error) {
      log.error({ error }, 'Failed to update banned word');
      return reply.code(500).send({ error: 'Failed to update banned word' });
    }
  });
  
  // Delete banned word
  app.delete('/api/moderation/banned-words/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      log.info({ id }, 'Deleting banned word');
      
      const success = moderationService.deleteBannedWord(parseInt(id, 10));
      
      if (!success) {
        return reply.code(404).send({ error: 'Banned word not found' });
      }
      
      return { success: true };
    } catch (error) {
      log.error({ error }, 'Failed to delete banned word');
      return reply.code(500).send({ error: 'Failed to delete banned word' });
    }
  });
  
  // ============================================
  // MOD LOGS
  // ============================================
  
  // Get mod logs
  app.get('/api/moderation/logs', async (request, reply) => {
    const query = request.query as { limit?: string; offset?: string };
    const limit = parseInt(query.limit || '100', 10);
    const offset = parseInt(query.offset || '0', 10);
    
    return moderationService.getModLogs(limit, offset);
  });
  
  // ============================================
  // PERMITS
  // ============================================
  
  // Grant permit (for use by mod commands)
  app.post('/api/moderation/permit', async (request, reply) => {
    try {
      const body = request.body as {
        userId: number;
        username: string;
        type?: 'link' | 'all';
        duration?: number;
        grantedBy: string;
      };
      
      if (!body.userId || !body.username || !body.grantedBy) {
        return reply.code(400).send({ error: 'userId, username, and grantedBy are required' });
      }
      
      await moderationService.grantPermit(
        body.userId,
        body.username,
        body.type || 'link',
        body.grantedBy,
        body.duration || 60
      );
      
      return { success: true };
    } catch (error) {
      log.error({ error }, 'Failed to grant permit');
      return reply.code(500).send({ error: 'Failed to grant permit' });
    }
  });
}
