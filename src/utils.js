const crypto = require('crypto');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function randomId() {
  return crypto.randomBytes(16).toString('hex');
}

function truncate(str, maxLen = 100) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '...';
}

function formatDate(ts) {
  if (!ts) return 'Never';
  try {
    return new Date(ts).toISOString().replace('T', ' ').substring(0, 19);
  } catch {
    return 'Unknown';
  }
}

function isValidUrl(str) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

function extractDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url;
  }
}

module.exports = {
  sleep,
  md5,
  randomId,
  truncate,
  formatDate,
  isValidUrl,
  extractDomain
};