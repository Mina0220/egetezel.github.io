const path = require('path');

const DOWNLOAD_DIR = process.env.WA_DOWNLOAD_DIR || path.join(__dirname, '..', 'downloads');
const STATE_PATH = process.env.WA_STATE_PATH || path.join(__dirname, '..', 'secrets', 'wa_session.enc');
const DB_PATH = process.env.WA_DB_PATH || path.join(__dirname, 'downloads.db');
const LOG_PATH = process.env.WA_LOG_PATH || path.join(__dirname, 'whatsapp-downloader.log');
const CRON_SCHEDULE = process.env.WA_CRON || '*/30 * * * *';
const MAX_RETRIES = Number(process.env.WA_RETRY_LIMIT || 2);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.WA_DOWNLOAD_TIMEOUT || 90_000);
const LOGIN_TIMEOUT_MS = Number(process.env.WA_LOGIN_TIMEOUT || 120_000);
const FILTER_SENDERS = (process.env.WA_SENDERS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const FILTER_MEDIA_TYPES = (process.env.WA_MEDIA_TYPES || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const FILTER_DATE_AFTER = process.env.WA_DATE_AFTER || null;

module.exports = {
  CRON_SCHEDULE,
  DB_PATH,
  DOWNLOAD_DIR,
  DOWNLOAD_TIMEOUT_MS,
  FILTER_DATE_AFTER,
  FILTER_MEDIA_TYPES,
  FILTER_SENDERS,
  LOG_PATH,
  LOGIN_TIMEOUT_MS,
  MAX_RETRIES,
  STATE_PATH
};
