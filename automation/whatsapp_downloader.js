const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const cron = require('node-cron');
const {
  CRON_SCHEDULE,
  DOWNLOAD_DIR,
  DOWNLOAD_TIMEOUT_MS,
  FILTER_DATE_AFTER,
  FILTER_MEDIA_TYPES,
  FILTER_SENDERS,
  LOGIN_TIMEOUT_MS,
  MAX_RETRIES,
  STATE_PATH
} = require('./config');
const { saveEncryptedJson, readEncryptedJson, ensureDirectory } = require('./crypto');
const { logDownload, markRetryableFailures } = require('./db');

const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  console.error('SESSION_SECRET environment variable must be set to encrypt/decrypt WhatsApp session data.');
}

function logLine(message) {
  const timestamp = new Date().toISOString();
  const fullLine = `[${timestamp}] ${message}`;
  console.log(fullLine);
}

function ensureDownloadDir() {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }
}

async function buildContext(browser) {
  const state = SESSION_SECRET ? readEncryptedJson(STATE_PATH, SESSION_SECRET) : null;
  const context = await browser.newContext({
    acceptDownloads: true,
    headless: true,
    storageState: state || undefined
  });
  return context;
}

async function ensureLoggedIn(page) {
  await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForSelector('[data-testid="chat-list-search"]', { timeout: LOGIN_TIMEOUT_MS });
    logLine('Existing WhatsApp session reused.');
  } catch (err) {
    logLine('Waiting for QR scan to complete...');
    await page.waitForSelector('canvas[aria-label*="Scan"]', { timeout: LOGIN_TIMEOUT_MS }).catch(() => {});
    await page.waitForSelector('[data-testid="chat-list-search"]', { timeout: LOGIN_TIMEOUT_MS });
    logLine('Login detected, persisting storage state.');
    const state = await page.context().storageState();
    if (SESSION_SECRET) {
      saveEncryptedJson(STATE_PATH, state, SESSION_SECRET);
    }
  }
}

function parseMetaText(textContent) {
  if (!textContent) {
    return { sender: null, messageDate: null };
  }
  const match = textContent.match(/\[(.*?)\]\s([^:]+):/);
  return {
    messageDate: match ? match[1] : null,
    sender: match ? match[2] : null
  };
}

async function collectMediaMessages(page) {
  const filters = {
    senders: FILTER_SENDERS,
    mediaTypes: FILTER_MEDIA_TYPES,
    dateAfter: FILTER_DATE_AFTER
  };
  const bubbles = await page.$$eval('[data-testid="msg-container"]', (nodes, config) => {
    const typeHints = [
      { selector: '[data-testid~="image"]', type: 'image' },
      { selector: '[data-testid~="video"]', type: 'video' },
      { selector: '[data-testid~="audio"]', type: 'audio' },
      { selector: '[data-testid~="document"]', type: 'document' },
      { selector: '[data-testid~="sticker"]', type: 'sticker' }
    ];

    const afterDate = config.dateAfter ? new Date(config.dateAfter) : null;

    return nodes
      .map((node) => {
        const prePlain = node.getAttribute('data-pre-plain-text') || '';
        const match = prePlain.match(/\[(.*?)\]\s([^:]+):/);
        const messageDate = match ? match[1] : null;
        const sender = match ? match[2] : null;
        const downloadButton = node.querySelector('[data-testid*="download" i], [aria-label*="Download" i], [aria-label*="indir" i]');
        let mediaType = null;
        for (const hint of typeHints) {
          if (node.querySelector(hint.selector)) {
            mediaType = hint.type;
            break;
          }
        }
        const id = node.getAttribute('data-id') || node.dataset.id || node.dataset.messageId || null;
        return {
          id,
          sender,
          messageDate,
          mediaType,
          hasDownload: Boolean(downloadButton),
          downloadSelector: downloadButton ? '[data-testid*="download" i], [aria-label*="Download" i], [aria-label*="indir" i]' : null
        };
      })
      .filter((item) => item.hasDownload && item.id)
      .filter((item) => {
        if (config.senders.length > 0 && item.sender) {
          return config.senders.some((s) => s.toLowerCase() === item.sender.toLowerCase());
        }
        return config.senders.length === 0;
      })
      .filter((item) => {
        if (config.mediaTypes.length > 0 && item.mediaType) {
          return config.mediaTypes.includes(item.mediaType.toLowerCase());
        }
        return config.mediaTypes.length === 0;
      })
      .filter((item) => {
        if (afterDate && item.messageDate) {
          const parsed = Date.parse(item.messageDate);
          if (!Number.isNaN(parsed)) {
            return parsed >= afterDate.getTime();
          }
        }
        return true;
      });
  }, filters);

  logLine(`Found ${bubbles.length} downloadable media messages after filtering.`);
  return bubbles;
}

async function downloadMediaMessage(page, bubble, attempt = 0) {
  const locator = page.locator(`[data-id="${bubble.id}"]`);
  const downloadButton = locator.locator(bubble.downloadSelector || '[data-testid*="download" i]');

  try {
    const downloadPromise = page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT_MS });
    await downloadButton.click({ timeout: 5_000 });
    const download = await downloadPromise;
    ensureDownloadDir();
    const suggestedName = download.suggestedFilename();
    const targetPath = path.join(DOWNLOAD_DIR, suggestedName);
    await download.saveAs(targetPath);
    await logDownload({
      messageId: bubble.id,
      fileName: suggestedName,
      savedPath: targetPath,
      sender: bubble.sender,
      mediaType: bubble.mediaType,
      messageDate: bubble.messageDate,
      status: 'success',
      attempt
    });
    logLine(`Downloaded ${suggestedName} from ${bubble.sender || 'unknown sender'}.`);
  } catch (error) {
    await logDownload({
      messageId: bubble.id,
      fileName: null,
      savedPath: null,
      sender: bubble.sender,
      mediaType: bubble.mediaType,
      messageDate: bubble.messageDate,
      status: 'failed',
      error: error.message,
      attempt
    });
    logLine(`Failed to download media from message ${bubble.id}: ${error.message}`);
    if (attempt < MAX_RETRIES) {
      logLine(`Retrying message ${bubble.id} (attempt ${attempt + 1}).`);
      await downloadMediaMessage(page, bubble, attempt + 1);
    }
  }
}

function watchDownloadFolder() {
  ensureDownloadDir();
  fs.watch(DOWNLOAD_DIR, { persistent: false }, (eventType, filename) => {
    if (eventType === 'rename' && filename) {
      const fullPath = path.join(DOWNLOAD_DIR, filename);
      if (fs.existsSync(fullPath)) {
        logLine(`Detected new file in download directory: ${filename}`);
      }
    }
  });
}

async function processFailed(page) {
  const retryable = await markRetryableFailures(MAX_RETRIES);
  for (const row of retryable) {
    if (!row.message_id) {
      continue;
    }
    await downloadMediaMessage(page, {
      id: row.message_id,
      sender: row.sender,
      mediaType: row.media_type,
      messageDate: row.message_date,
      downloadSelector: '[data-testid*="download" i]'
    }, row.attempt + 1);
  }
}

async function runJob() {
  if (!SESSION_SECRET) {
    throw new Error('Cannot continue without SESSION_SECRET. Set it and rerun.');
  }

  ensureDirectory(STATE_PATH);
  ensureDownloadDir();
  watchDownloadFolder();

  const browser = await chromium.launch({ headless: true });
  const context = await buildContext(browser);
  const page = await context.newPage();

  await ensureLoggedIn(page);
  await page.waitForTimeout(3_000);
  const mediaBubbles = await collectMediaMessages(page);
  for (const bubble of mediaBubbles) {
    await downloadMediaMessage(page, bubble);
  }
  await processFailed(page);

  await browser.close();
}

function bootstrap() {
  const shouldSchedule = process.argv.includes('--schedule');
  if (shouldSchedule) {
    logLine(`Scheduling job with cron expression "${CRON_SCHEDULE}".`);
    cron.schedule(CRON_SCHEDULE, () => {
      runJob().catch((err) => logLine(`Job failed: ${err.message}`));
    });
  } else {
    runJob().catch((err) => {
      logLine(err.message);
      process.exitCode = 1;
    });
  }
}

bootstrap();
