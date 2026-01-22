// discord/screenshot.ts
// Captures screenshots of the stream using Puppeteer

import puppeteer from 'puppeteer';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('screenshot');

// Get paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../../../');
const screenshotsDir = path.join(rootDir, 'data', 'screenshots');

// Ensure screenshots directory exists
async function ensureScreenshotsDir(): Promise<void> {
  try {
    await fs.mkdir(screenshotsDir, { recursive: true });
  } catch (error) {
    // Directory likely already exists
  }
}

/**
 * Capture a screenshot of a Kick stream
 * @param channelSlug - The channel slug to capture (e.g., 'kaotickarmatv')
 */
export async function captureStreamScreenshot(channelSlug: string): Promise<string | undefined> {
  await ensureScreenshotsDir();
  
  const channelUrl = `https://kick.com/${channelSlug}`;
  const filename = `screenshot-${channelSlug}-${Date.now()}.png`;
  const filepath = path.join(screenshotsDir, filename);
  
  let browser: puppeteer.Browser | null = null;
  
  try {
    log.info({ channelSlug }, 'Launching browser for screenshot capture...');
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    log.info({ url: channelUrl }, 'Navigating to stream page...');
    
    // Navigate to the stream page
    await page.goto(channelUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    
    // Wait for video player to load
    log.info('Waiting for video player...');
    
    try {
      // Wait for video element or player container
      await page.waitForSelector('video, .video-player, [class*="player"]', {
        timeout: 10000,
      });
      
      // Give extra time for video to render
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch {
      log.warn('Video player not found, capturing page anyway');
    }
    
    // Try to click away any overlays/popups
    try {
      await page.click('body');
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch {
      // Ignore click errors
    }
    
    // Take the screenshot
    log.info({ filepath }, 'Capturing screenshot...');
    
    await page.screenshot({
      path: filepath,
      type: 'png',
      fullPage: false,
    });
    
    log.info({ filepath }, 'Screenshot captured successfully');
    
    return filepath;
  } catch (error) {
    log.error({ error }, 'Failed to capture screenshot');
    return undefined;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function readScreenshotBuffer(filepath: string): Promise<Buffer | null> {
  try {
    const buffer = await fs.readFile(filepath);
    return buffer;
  } catch (error) {
    log.error({ error, filepath }, 'Failed to read screenshot file');
    return null;
  }
}

export async function cleanupOldScreenshots(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
  try {
    await ensureScreenshotsDir();
    
    const files = await fs.readdir(screenshotsDir);
    const now = Date.now();
    
    for (const file of files) {
      if (!file.endsWith('.png')) continue;
      
      const filepath = path.join(screenshotsDir, file);
      const stat = await fs.stat(filepath);
      const age = now - stat.mtimeMs;
      
      if (age > maxAgeMs) {
        await fs.unlink(filepath);
        log.info({ file }, 'Deleted old screenshot');
      }
    }
  } catch (error) {
    log.warn({ error }, 'Failed to cleanup old screenshots');
  }
}
