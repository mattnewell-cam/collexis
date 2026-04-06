/**
 * send-whatsapp.mjs
 *
 * Sends a WhatsApp message via WhatsApp Web using Playwright's Chromium.
 * Runs completely independently of your Chrome — no killing, no profile conflicts.
 *
 * FIRST RUN: A headed browser opens. Scan the WhatsApp QR code to log in.
 * The session is saved in .playwright-profile/ and reused automatically.
 *
 * Usage:
 *   node scripts/send-whatsapp.mjs <phone> <message>
 *   Phone in international format without + or spaces: 447500111111
 *
 * Example:
 *   node scripts/send-whatsapp.mjs 447500111111 "hi"
 */

import { chromium } from 'playwright';
import path         from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname       = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR     = process.env.COLLEXIS_PLAYWRIGHT_PROFILE_DIR
  ? (path.isAbsolute(process.env.COLLEXIS_PLAYWRIGHT_PROFILE_DIR)
      ? process.env.COLLEXIS_PLAYWRIGHT_PROFILE_DIR
      : path.resolve(__dirname, '..', process.env.COLLEXIS_PLAYWRIGHT_PROFILE_DIR))
  : path.join(__dirname, '..', 'runtime', 'playwright', 'whatsapp-profile');
const WA_LOAD_TIMEOUT = 90_000;
const CONFIRM_TIMEOUT = 10_000;

// ---------------------------------------------------------------------------
// WhatsApp helpers
// ---------------------------------------------------------------------------

async function detectState(page) {
  // '#main' also matches an SVG <mask id="main"> that exists on the splash screen,
  // so we wait for the compose footer which only appears once the chat UI is loaded.
  // The QR canvas also only appears after the splash, so both are safe post-splash selectors.
  try {
    return await Promise.race([
      page.waitForSelector('footer [contenteditable]', { timeout: WA_LOAD_TIMEOUT }).then(() => 'ready'),
      page.waitForSelector('[data-ref]',               { timeout: WA_LOAD_TIMEOUT }).then(() => 'qr'),
    ]);
  } catch {
    return 'timeout';
  }
}

async function findComposeBox(page) {
  for (const sel of [
    'footer [contenteditable="true"][data-tab="10"]',
    'footer [contenteditable="true"]',
    '[data-testid="conversation-compose-box-input"]',
  ]) {
    try {
      return await page.waitForSelector(sel, { timeout: 8_000 });
    } catch { /* try next */ }
  }
  throw new Error('Could not find WhatsApp compose box');
}

async function confirmSent(page) {
  // Most reliable signal: compose box clears to empty/newline after a successful send
  try {
    const box = await page.$('footer [contenteditable]');
    if (box) {
      await page.waitForFunction(
        el => el.innerText.trim() === '',
        box,
        { timeout: CONFIRM_TIMEOUT }
      );
      return true;
    }
  } catch { /* fall through */ }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const [,, phone, ...msgParts] = process.argv;
  const message = msgParts.join(' ');

  if (!phone || !message) {
    console.error('Usage: node scripts/send-whatsapp.mjs <phone> <message>');
    console.error('  e.g: node scripts/send-whatsapp.mjs 447500111111 "hi"');
    process.exit(1);
  }

  console.log(`\n📱 Sending WhatsApp message to +${phone}: "${message}"\n`);
  console.log(`📁 Profile: ${PROFILE_DIR}`);

  // Headed only for QR scanning; headless for normal sends
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
    ],
    // Mask headless indicators so WhatsApp Web doesn't block us
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  // Remove navigator.webdriver flag that sites use to detect automation
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    const pages = context.pages();
    const page  = pages.length > 0 ? pages[0] : await context.newPage();

    const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
    console.log(`🌐 ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: WA_LOAD_TIMEOUT });

    console.log('⏳ Waiting for WhatsApp…');
    const state = await detectState(page);

    if (state === 'qr') {
      throw new Error(
        'WhatsApp session expired or not set up.\n' +
        'Run with --setup flag to scan QR: node scripts/send-whatsapp.mjs --setup'
      );
    } else if (state !== 'ready') {
      throw new Error(`WhatsApp failed to load (state: ${state})`);
    }

    // Send
    const box = await findComposeBox(page);
    await box.click();
    if (!(await box.innerText()).trim()) {
      await box.type(message, { delay: 30 });
    }
    await page.waitForTimeout(300);

    const sendBtn = page.locator('[data-testid="send"]').first();
    if (await sendBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await sendBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }

    console.log('📤 Sent — confirming…');
    const ok = await confirmSent(page);
    console.log(ok ? '✅ Delivered.' : '⚠️  Could not confirm (may still have sent).');

  } finally {
    await context.close();
  }
}

main().catch(err => {
  console.error('\n❌', err.message);
  process.exit(1);
});
