/**
 * send-whatsapp.mjs
 *
 * Sends a WhatsApp message via WhatsApp Web using Playwright's Chromium.
 * Runs independently from the user's regular browser profile.
 *
 * First-time setup:
 *   node scripts/send-whatsapp.mjs --setup
 *
 * Send:
 *   node scripts/send-whatsapp.mjs <phone> <message>
 *   Phone must be international digits without a leading +, for example:
 *   node scripts/send-whatsapp.mjs 447500111111 "hi"
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEGACY_PROFILE_DIR = path.join(__dirname, '..', '.playwright-profile');
const RUNTIME_PROFILE_DIR = path.join(__dirname, '..', 'runtime', 'playwright', 'whatsapp-profile');
const WA_LOAD_TIMEOUT = 90_000;
const QR_READY_TIMEOUT = 5 * 60_000;
const CONFIRM_TIMEOUT = 10_000;
const SEND_CONFIRMED_SENTINEL = 'WHATSAPP_SEND_CONFIRMED';

function isProfilePopulated(profileDir) {
  try {
    return fs.readdirSync(profileDir).length > 0;
  } catch {
    return false;
  }
}

function resolveProfileDir() {
  const configured = process.env.COLLEXIS_PLAYWRIGHT_PROFILE_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(__dirname, '..', configured);
  }

  if (isProfilePopulated(RUNTIME_PROFILE_DIR)) {
    return RUNTIME_PROFILE_DIR;
  }

  if (isProfilePopulated(LEGACY_PROFILE_DIR)) {
    return LEGACY_PROFILE_DIR;
  }

  return RUNTIME_PROFILE_DIR;
}

const PROFILE_DIR = resolveProfileDir();

function usage() {
  return [
    'Usage:',
    '  node scripts/send-whatsapp.mjs --setup',
    '  node scripts/send-whatsapp.mjs [--headed] <phone> <message>',
    '',
    'Examples:',
    '  node scripts/send-whatsapp.mjs --setup',
    '  node scripts/send-whatsapp.mjs 447500111111 "hi"',
    '  node scripts/send-whatsapp.mjs --headed 447500111111 "hi"',
  ].join('\n');
}

function parseArgs(argv) {
  const args = [...argv];
  const setup = args.includes('--setup');
  const headed = args.includes('--headed');
  const help = args.includes('--help') || args.includes('-h');
  const positional = args.filter(arg => !['--setup', '--headed', '--help', '-h'].includes(arg));

  return { setup, headed, help, positional };
}

async function detectState(page) {
  try {
    return await Promise.race([
      page.waitForSelector('footer [contenteditable]', { timeout: WA_LOAD_TIMEOUT }).then(() => 'ready'),
      page.waitForSelector('[data-ref]', { timeout: WA_LOAD_TIMEOUT }).then(() => 'qr'),
    ]);
  } catch {
    return 'timeout';
  }
}

async function waitForReadyAfterQr(page) {
  await page.waitForSelector('[data-ref]', { timeout: WA_LOAD_TIMEOUT });
  console.log('QR code is visible. Scan it with the WhatsApp account you want to use.');
  await page.waitForSelector('footer [contenteditable]', { timeout: QR_READY_TIMEOUT });
}

async function findComposeBox(page) {
  for (const selector of [
    'footer [contenteditable="true"][data-tab="10"]',
    'footer [contenteditable="true"]',
    '[data-testid="conversation-compose-box-input"]',
  ]) {
    try {
      return await page.waitForSelector(selector, { timeout: 8_000 });
    } catch {
      // Try the next selector.
    }
  }

  throw new Error('Could not find WhatsApp compose box.');
}

async function confirmSent(page) {
  try {
    const box = await page.$('footer [contenteditable]');
    if (box) {
      await page.waitForFunction(
        el => el.innerText.trim() === '',
        box,
        { timeout: CONFIRM_TIMEOUT },
      );
      return true;
    }
  } catch {
    // Fall through to false.
  }

  return false;
}

async function assertNoRecipientError(page, phone) {
  const errorPatterns = [
    `The number +${phone} isn't on WhatsApp.`,
    'The phone number shared via url is invalid.',
    'Phone number shared via url is invalid.',
    'This number is not on WhatsApp.',
  ];

  for (const text of errorPatterns) {
    const match = page.getByText(text, { exact: false }).first();
    if (await match.isVisible({ timeout: 1_500 }).catch(() => false)) {
      throw new Error(await match.innerText().catch(() => `WhatsApp rejected +${phone}.`));
    }
  }
}

async function launchContext({ headed }) {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: !headed,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
    ],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return context;
}

async function ensureSession({ headed }) {
  console.log(`Profile: ${PROFILE_DIR}`);
  const context = await launchContext({ headed });

  try {
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();
    await page.goto('https://web.whatsapp.com', {
      waitUntil: 'domcontentloaded',
      timeout: WA_LOAD_TIMEOUT,
    });

    const state = await detectState(page);
    if (state === 'ready') {
      console.log('WhatsApp session is already active.');
      return;
    }
    if (state === 'qr') {
      if (!headed) {
        throw new Error('A QR scan is required. Re-run with --setup to open a headed browser.');
      }
      await waitForReadyAfterQr(page);
      console.log('WhatsApp session saved.');
      return;
    }

    throw new Error('WhatsApp Web failed to load while setting up the session.');
  } finally {
    await context.close();
  }
}

async function sendMessage({ phone, message, headed }) {
  console.log(`Sending WhatsApp message to +${phone}`);
  console.log(`Profile: ${PROFILE_DIR}`);

  const context = await launchContext({ headed });

  try {
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();
    const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: WA_LOAD_TIMEOUT });

    const state = await detectState(page);
    if (state === 'qr') {
      throw new Error(
        'WhatsApp session expired or is not set up. Run: node scripts/send-whatsapp.mjs --setup',
      );
    }
    if (state !== 'ready') {
      throw new Error(`WhatsApp failed to load (state: ${state}).`);
    }

    await assertNoRecipientError(page, phone);

    const box = await findComposeBox(page);
    await box.click();
    if (!(await box.innerText()).trim()) {
      await box.type(message, { delay: 30 });
    }
    await page.waitForTimeout(300);

    const sendButton = page.locator('[data-testid="send"], button[aria-label="Send"]').first();
    if (await sendButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await sendButton.click();
    } else {
      await box.press('Enter');
    }

    console.log('Message submitted. Confirming delivery...');
    await assertNoRecipientError(page, phone);
    const delivered = await confirmSent(page);
    if (!delivered) {
      throw new Error('Message delivery could not be confirmed.');
    }
    console.log('Delivered.');
    console.log(SEND_CONFIRMED_SENTINEL);
  } finally {
    await context.close();
  }
}

async function main() {
  const { setup, headed, help, positional } = parseArgs(process.argv.slice(2));

  if (help) {
    console.log(usage());
    return;
  }

  if (setup) {
    await ensureSession({ headed: true });
    return;
  }

  const [phone, ...messageParts] = positional;
  const message = messageParts.join(' ').trim();

  if (!phone || !message) {
    console.error(usage());
    process.exit(1);
  }

  await sendMessage({ phone, message, headed });
}

main().catch(error => {
  console.error(`\nERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
