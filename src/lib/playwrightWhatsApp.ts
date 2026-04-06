/**
 * playwrightWhatsApp.ts
 *
 * Sends WhatsApp messages via Playwright + WhatsApp Web, using a persistent
 * Chromium profile stored in .playwright-profile/ at the project root.
 *
 * First-time setup: run `node scripts/send-whatsapp.mjs --setup` to scan the
 * QR code and save the session. After that, sends are fully headless.
 *
 * Drop-in replacement for sendMetaWhatsAppText — same input/output shape.
 */

import path from 'path';
import type { BrowserContext, Page } from 'playwright';

const PROFILE_DIR     = path.join(process.cwd(), '.playwright-profile');
const WA_LOAD_TIMEOUT = 90_000;
const CONFIRM_TIMEOUT = 10_000;

export function isPlaywrightWhatsAppConfigured(): boolean {
  // Always considered configured — the session is checked at send time.
  // If the session doesn't exist or has expired, sendPlaywrightWhatsApp throws.
  return true;
}

export function playwrightWhatsAppConfigurationError(): string | null {
  return null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function detectState(page: Page): Promise<'ready' | 'qr' | 'timeout'> {
  // '#main' also matches an SVG <mask id="main"> on the splash screen, so we
  // wait for the compose footer (only exists once the chat UI is loaded) or
  // the QR code container.
  try {
    return await Promise.race([
      page.waitForSelector('footer [contenteditable]', { timeout: WA_LOAD_TIMEOUT })
        .then(() => 'ready' as const),
      page.waitForSelector('[data-ref]', { timeout: WA_LOAD_TIMEOUT })
        .then(() => 'qr' as const),
    ]);
  } catch {
    return 'timeout';
  }
}

async function confirmSent(page: Page): Promise<boolean> {
  // Most reliable signal: the compose box clears to empty after a successful send.
  try {
    const box = await page.$('footer [contenteditable]');
    if (box) {
      await page.waitForFunction(
        (el: SVGElement | HTMLElement) => (el as HTMLElement).innerText?.trim() === '',
        box,
        { timeout: CONFIRM_TIMEOUT },
      );
      return true;
    }
  } catch { /* fall through */ }
  return false;
}

async function buildContext(): Promise<BrowserContext> {
  // Dynamic import so Next.js doesn't attempt to bundle Playwright for the edge
  const { chromium } = await import('playwright');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
    ],
    // Mask headless indicators — WhatsApp Web checks navigator.userAgent
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  // Remove navigator.webdriver flag used by sites to detect automation
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return context;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sends a WhatsApp text message via Playwright + WhatsApp Web.
 * Matches the return shape of sendMetaWhatsAppText so the API route
 * can swap between providers without changes.
 */
export async function sendPlaywrightWhatsApp({
  to,
  textBody,
}: {
  to: string;
  textBody: string;
}): Promise<{ messageId: string | null }> {
  const context = await buildContext();

  try {
    const pages  = context.pages();
    const page   = pages.length > 0 ? pages[0] : await context.newPage();

    // Strip leading + for the WhatsApp Web URL (E.164 → international digits)
    const phoneDigits = to.replace(/^\+/, '');
    const url = `https://web.whatsapp.com/send?phone=${phoneDigits}&text=${encodeURIComponent(textBody)}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: WA_LOAD_TIMEOUT });

    const state = await detectState(page);

    if (state === 'qr') {
      throw new Error(
        'WhatsApp Web session not set up or expired. ' +
        'Run: node scripts/send-whatsapp.mjs --setup',
      );
    }
    if (state !== 'ready') {
      throw new Error('WhatsApp Web failed to load — session may have expired.');
    }

    // Send — the URL pre-fills the compose box; fall back to typing if empty
    const selectors = [
      'footer [contenteditable][data-tab="10"]',
      'footer [contenteditable]',
    ];
    let box = null;
    for (const sel of selectors) {
      box = await page.$(sel);
      if (box) break;
    }
    if (!box) throw new Error('Could not find WhatsApp compose box.');

    await box.click();
    const existing = (await box.innerText()).trim();
    if (!existing) await box.type(textBody, { delay: 30 });
    await page.waitForTimeout(300);

    const sendBtn = page.locator('[data-testid="send"]').first();
    if (await sendBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await sendBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }

    const delivered = await confirmSent(page);
    if (!delivered) {
      throw new Error('Message queued but delivery could not be confirmed.');
    }

    // Playwright sends don't return a provider message ID
    return { messageId: null };
  } finally {
    await context.close();
  }
}
