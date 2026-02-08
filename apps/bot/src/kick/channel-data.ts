// kick/channel-data.ts
// Shared Kick channel data fetcher with caching
// Used by both variables and statistics for live stream info

import puppeteer from 'puppeteer';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('channel-data');

// Cache for channel data to avoid excessive Puppeteer launches
const channelDataCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60_000; // 1 minute cache

/**
 * Fetch channel data from Kick's v2 API using Puppeteer (bypasses Cloudflare)
 * Returns cached data if available and fresh
 */
export async function getKickChannelData(channelSlug: string): Promise<any | null> {
  // Check cache first
  const cached = channelDataCache.get(channelSlug);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log.debug({ channelSlug }, 'Using cached channel data');
    return cached.data;
  }

  let browser = null;
  try {
    log.info({ channelSlug }, 'Fetching channel data via Puppeteer');

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const response = await page.goto(`https://kick.com/api/v2/channels/${channelSlug}`, {
      waitUntil: 'networkidle0',
      timeout: 15000,
    });

    if (!response || !response.ok()) {
      log.warn({ channelSlug, status: response?.status() }, 'Failed to fetch channel data');
      return null;
    }

    const text = await page.evaluate(() => document.body.innerText);
    const data = JSON.parse(text);

    // Cache the result
    channelDataCache.set(channelSlug, { data, timestamp: Date.now() });

    log.info({ channelSlug, isLive: !!data.livestream }, 'Got channel data from Kick v2 API');

    return data;
  } catch (error) {
    log.error({ error, channelSlug }, 'Failed to fetch from Kick v2 API via Puppeteer');
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Get cached channel data without triggering a fetch
 * Returns null if no cached data or cache is expired
 */
export function getCachedChannelData(channelSlug: string): any | null {
  const cached = channelDataCache.get(channelSlug);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

/**
 * Clear cache for a specific channel
 */
export function clearChannelDataCache(channelSlug?: string): void {
  if (channelSlug) {
    channelDataCache.delete(channelSlug);
  } else {
    channelDataCache.clear();
  }
}
