// discord/screenshot.ts
// Captures screenshots of the stream using Puppeteer with stealth

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('screenshot');

// Get paths
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../../../');
const screenshotsDir = path.join(rootDir, 'data', 'screenshots');

// Lazy-loaded puppeteer with stealth
let stealthBrowserReady: any = null;

async function getStealthPuppeteer() {
  if (stealthBrowserReady) return stealthBrowserReady;
  
  const puppeteerExtra = await import('puppeteer-extra');
  const stealthPlugin = await import('puppeteer-extra-plugin-stealth');
  
  const puppeteer = puppeteerExtra.default;
  puppeteer.use(stealthPlugin.default());
  
  stealthBrowserReady = puppeteer;
  return puppeteer;
}

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
  
  let browser: any = null;
  
  try {
    log.info({ channelSlug }, 'Launching stealth browser for screenshot capture...');
    
    const puppeteer = await getStealthPuppeteer();
    
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--disable-blink-features=AutomationControlled',
      ],
    });
    
    const page = await browser.newPage();
    
    // Set a realistic user-agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set extra headers to look more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    });
    
    log.info({ url: channelUrl }, 'Navigating to stream page...');
    
    // Navigate to the stream page
    await page.goto(channelUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    
    // Dismiss age verification gate if present
    try {
      const ageButton = await page.$('button:has-text("I am 18+"), button:has-text("I am 18"), [data-testid="age-verification-confirm"]');
      if (ageButton) {
        await ageButton.click();
        log.info('Clicked age verification button');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        // Try finding by text content via evaluate
        const clicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const ageBtn = buttons.find(b => b.textContent?.includes('18'));
          if (ageBtn) { ageBtn.click(); return true; }
          return false;
        });
        if (clicked) {
          log.info('Clicked age verification button (via evaluate)');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch {
      // No age gate present
    }
    
    // Wait for video element to load
    log.info('Waiting for video player...');
    
    try {
      await page.waitForSelector('video', { timeout: 15000 });
      // Wait for video to actually start playing frames
      await new Promise(resolve => setTimeout(resolve, 8000));
    } catch {
      log.warn('Video element not found, waiting and capturing anyway');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Try to screenshot just the video element for a clean capture
    let captured = false;
    try {
      const videoElement = await page.$('video');
      if (videoElement) {
        // Get the video's bounding box
        const box = await videoElement.boundingBox();
        if (box && box.width > 100 && box.height > 100) {
          await videoElement.screenshot({ path: filepath, type: 'png' });
          captured = true;
          log.info({ filepath, width: box.width, height: box.height }, 'Video element screenshot captured');
        }
      }
    } catch (err: any) {
      log.warn({ err: err?.message }, 'Failed to screenshot video element, trying player container');
    }
    
    // Fallback: try the player container
    if (!captured) {
      try {
        const playerContainer = await page.$('#player-container, .video-player, [class*="VideoPlayer"], [class*="video-player"]');
        if (playerContainer) {
          const box = await playerContainer.boundingBox();
          if (box && box.width > 100 && box.height > 100) {
            await playerContainer.screenshot({ path: filepath, type: 'png' });
            captured = true;
            log.info({ filepath }, 'Player container screenshot captured');
          }
        }
      } catch (err: any) {
        log.warn({ err: err?.message }, 'Failed to screenshot player container');
      }
    }
    
    // Last fallback: clip to top portion of page (stream area)
    if (!captured) {
      await page.screenshot({
        path: filepath,
        type: 'png',
        clip: { x: 0, y: 0, width: 1920, height: 1080 },
      });
      log.info({ filepath }, 'Full viewport screenshot captured as fallback');
    }
    
    log.info({ filepath }, 'Screenshot captured successfully');
    
    return filepath;
  } catch (error: any) {
    log.error({ err: error?.message || String(error), stack: error?.stack }, 'Failed to capture screenshot');
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