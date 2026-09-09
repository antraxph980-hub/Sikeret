const axios = require('axios');
const https = require('https');
const { Api } = require('./api');

class Waf {
  constructor(log) {
    this.log = log;
    this.LOCK = {};
    this.loginLock = { _locked: false };
    this.step = 'IDLE';
    this.currentPage = '';
    this.lastApiBody = '';
    this.lastReqAccount = '';
    this.lastRequestMs = 0;
    this.lastUplinkMs = 0;
    this.solvedUrl = null;
    this.lastCapture = '';
    this._apiCount = 0;
    this.bootMs = Date.now();
    this.tokenUrls = [];
    this.seenTokenUrls = new Set();
    this.awaitResult = null;
    this.awaiting = false;
    this.challengeHtml = null;
    this.eventLog = [];
    this.sessionActive = true;
    this.cookieJar = {};
  }

  get apiRequests() {
    return {
      get: () => this._apiCount,
      increment: () => { this._apiCount++; }
    };
  }

  logEv(msg) {
    const ts = Date.now() - this.bootMs;
    const logMsg = `[${String(ts).padStart(5)}ms] ${msg}`;
    this.eventLog.push(logMsg);
    if (this.eventLog.length > 2000) {
      this.eventLog.splice(0, 1000);
    }
    if (this.log) this.log.ev(msg);
  }

  getLog() {
    return this.eventLog.join('\n');
  }

  tokenCount() {
    return this.tokenUrls.length;
  }

  registerTokenUrl(url) {
    if (!url) return;
    if (url.includes('type__3069') || url.includes('ssxmod')) {
      this.logEv(`TOKENURL ${Api.blur(url)}`);
      if (!this.seenTokenUrls.has(url)) {
        this.seenTokenUrls.add(url);
        this.tokenUrls.push(url);
        if (this.tokenUrls.length > 200) {
          const removed = this.tokenUrls.splice(0, 100);
          for (const r of removed) {
            this.seenTokenUrls.delete(r);
          }
        }
      }
    }
  }

  isChallenge(str) {
    if (!str) return false;
    if (str.includes('renderData') || str.includes('aliyun_waf_aa') || 
        str.includes('_waf_') || str.length > 50000) {
      return true;
    }
    return str.startsWith('<') && str.length > 400;
  }

  isFullTokenUrl(url) {
    return url && url.includes('ssxmod_itna=') && url.includes('type__3069=');
  }

  bestToken() {
    for (const url of this.tokenUrls) {
      const idx = url.indexOf('type__3069=');
      if (idx >= 0) {
        const token = url.substring(idx + 11).split('&')[0];
        if (token.startsWith('2790552d-')) {
          return token;
        }
      }
    }
    for (const url of this.tokenUrls) {
      const idx = url.indexOf('type__3069=');
      if (idx >= 0) {
        return url.substring(idx + 11).split('&')[0];
      }
    }
    return null;
  }

  lastFullTokenUrl() {
    for (let i = this.tokenUrls.length - 1; i >= 0; i--) {
      const url = this.tokenUrls[i];
      if (this.isFullTokenUrl(url)) return url;
    }
    for (let i = this.tokenUrls.length - 1; i >= 0; i--) {
      const url = this.tokenUrls[i];
      if (url.includes('type__3069=')) return url;
    }
    return null;
  }

  fullRetryUrl() {
    const lastFull = this.lastFullTokenUrl();
    if (lastFull) return lastFull;
    
    let retryUrl = null;
    for (let i = this.tokenUrls.length - 1; i >= 0; i--) {
      if (this.tokenUrls[i].includes('ssxmod_itna=')) {
        retryUrl = this.tokenUrls[i];
        break;
      }
    }
    
    const token = this.bestToken();
    if (!retryUrl || !token) return null;
    
    const idx = retryUrl.indexOf('?');
    if (idx < 0) {
      return `https://accountmtapi.mobilelegends.com/?type__3069=${token}`;
    }
    return `https://accountmtapi.mobilelegends.com${retryUrl.substring(idx)}&type__3069=${token}`;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async awaitResult(timeout, step) {
    this.step = step;
    this.awaiting = true;
    this.awaitResult = null;
    
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (this.awaitResult) {
        this.awaiting = false;
        return this.awaitResult;
      }
      await this.sleep(100);
    }
    this.awaiting = false;
    return null;
  }

  async runStep1(payload, path) {
    try {
      const url = `https://accountmtapi.mobilelegends.com/${path}`;
      this.logEv(`STEP1 ${Api.blur(url)}`);
      
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Android)'
        },
        timeout: 30000,
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      });
      
      const result = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      this.lastApiBody = result;
      
      // Check for challenge
      if (this.isChallenge(result)) {
        this.challengeHtml = result;
        this.logEv('CHALLENGE detected');
        return '__CHALLENGE__';
      }
      
      // Extract token URLs
      if (result.includes('type__3069') || result.includes('ssxmod')) {
        const matches = result.match(/https?:\/\/[^\s"']*type__3069[^\s"']*/g) || [];
        for (const match of matches) {
          this.registerTokenUrl(match);
        }
      }
      
      return result;
    } catch (error) {
      this.logEv(`STEP1 error: ${error.message}`);
      return null;
    }
  }

  async solveChallenge() {
    const html = this.challengeHtml;
    if (!html) return false;
    
    this.logEv(`SOLVE begin chlen=${html.length}`);
    
    if (!html.includes('renderData') && html.length < 50000) {
      this.logEv('SOLVE not a render challenge');
      return false;
    }
    
    if (html.includes('nc_fullclick') || html.includes('slideToUnlock') || 
        html.includes('__nc__')) {
      this.logEv('SOLVE slider-mode, cannot automate');
      return false;
    }
    
    // Try to find existing token
    if (this.lastFullTokenUrl()) {
      this.solvedUrl = this.lastFullTokenUrl();
      this.logEv('SOLVE found existing token');
      return true;
    }
    
    // Wait for token to appear
    for (let i = 0; i < 15; i++) {
      await this.sleep(500);
      if (this.lastFullTokenUrl()) {
        this.solvedUrl = this.lastFullTokenUrl();
        this.logEv('SOLVE token acquired');
        return true;
      }
    }
    
    this.logEv('SOLVE failed');
    return false;
  }

  async restoreMtacc() {
    this.logEv('RESTORE mtacc session');
    await this.sleep(1000);
  }

  async runRetry(payload) {
    const retryUrl = this.fullRetryUrl();
    if (!retryUrl) {
      const token = this.bestToken();
      if (token) {
        const baseUrl = `https://accountmtapi.mobilelegends.com/?type__3069=${token}`;
        this.logEv(`RETRY using base URL with token`);
        try {
          const response = await axios.post(baseUrl, payload, {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Android)'
            },
            timeout: 30000,
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
          });
          const result = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          this.lastApiBody = result;
          return result;
        } catch (error) {
          this.logEv(`RETRY base error: ${error.message}`);
          return null;
        }
      }
      this.logEv('RETRY no token available');
      return null;
    }
    
    this.logEv(`RETRY ${Api.blur(retryUrl)}`);
    try {
      const response = await axios.post(retryUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Android)'
        },
        timeout: 45000,
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      });
      
      const result = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      this.lastApiBody = result;
      return result;
    } catch (error) {
      this.logEv(`RETRY error: ${error.message}`);
      return null;
    }
  }

  async login(payload, path) {
    // Acquire lock
    if (this.loginLock._locked) {
      await new Promise(resolve => {
        const check = () => {
          if (!this.loginLock._locked) {
            this.loginLock._locked = true;
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    } else {
      this.loginLock._locked = true;
    }
    
    try {
      this.step = 'STEP1';
      this.awaiting = false;
      this.awaitResult = null;
      this.challengeHtml = null;
      this.solvedUrl = null;
      
      let result = await this.runStep1(payload, path);
      
      if (!result) {
        return '{"error":"step1 timeout"}';
      }
      
      if (result !== '__CHALLENGE__') {
        return result;
      }
      
      // Handle challenge
      this.step = 'CHALLENGE';
      if (!await this.solveChallenge()) {
        return `{"error":"challenge unsolved","debug":"${this.lastCapture || ''}"}`;
      }
      
      await this.restoreMtacc();
      
      this.step = 'RETRY';
      let retryResult = await this.runRetry(payload);
      
      if (!retryResult || retryResult.trim() === '') {
        this.logEv('RETRY empty, re-fire');
        await this.sleep(1500);
        retryResult = await this.runRetry(payload);
      }
      
      if (!retryResult) {
        return '{"error":"retry timeout"}';
      }
      
      const trim = retryResult.trim();
      if (!trim.startsWith('{')) {
        if (trim === '__CHALLENGE__') {
          this.logEv('RETRY re-challenged');
        } else if (trim.length > 50000 || trim.includes('_waf_') || trim.startsWith('<')) {
          this.challengeHtml = trim;
          this.logEv('RETRY html re-challenge');
        }
      }
      
      return retryResult;
    } finally {
      this.loginLock._locked = false;
      this.step = 'IDLE';
    }
  }

  reset() {
    this.tokenUrls = [];
    this.seenTokenUrls = new Set();
    this.solvedUrl = null;
    this.challengeHtml = null;
    this.step = 'IDLE';
    this.lastCapture = '';
    this.lastApiBody = '';
    this.logEv('WAF reset');
  }

  start() {
    this.logEv('WAF engine started');
    this.sessionActive = true;
  }

  destroy() {
    this.sessionActive = false;
    this.logEv('WAF engine destroyed');
  }
}

module.exports = Waf;