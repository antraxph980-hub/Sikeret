const axios = require('axios');
const https = require('https');

class Captcha {
  static DEFAULT_SERVERS = [
    'http://217.216.35.81:8080',
    'http://62.146.237.138:8080',
    'http://62.146.237.138:8081',
    'https://solar-solver-production.up.railway.app',
    'http://confident-tenderness-pang-nayn-solbir.up.railway.app',
    'https://cn31-mint-2-production.up.railway.app',
    'https://cn31-solver-production-5a1a.up.railway.app',
    'https://cn31-production-6d8a.up.railway.app',
    'https://cn31-web-atx-production.up.railway.app',
    'https://baditssss1-production.up.railway.app',
    'https://banditsss-production.up.railway.app',
    'http://217.216.35.129:8082',
    'https://vincesaya-cn31.up.railway.app/get-token',
    'https://vince-cn3bai-zirbir.up.railway.app/get-token',
    'https://cn31-vince-kumakain-tite.up.railway.app/get-token',
    'https://vince-bayot-cn31-token.up.railway.app/get-token',
    'https://vince-cn31-token.up.railway.app/get-token',
    'http://cn31-antrax-solver-production.up.railway.app/api/get-token',
    'https://cn31-atx-solver-production.up.railway.app/get-token',
    'https://ocho-private-cn31storage.onrender.com'
  ];

  constructor(log) {
    this.log = log;
    this.MAX_SERVERS = 64;
    this.TIMEOUT = 4000;
    this.servers = [];
    this.probe = new Array(this.MAX_SERVERS).fill(0);
    this.poolQ = [];
    this.tokenSeen = new Set();
    this.keepGoing = true;
    this.fetchInterval = null;
    this.totalFetched = 0;
    this.setServers(null);
  }

  leq(msg) {
    if (this.log) this.log.ev(msg);
  }

  setServers(list) {
    this.servers = [];
    if (list) {
      for (const s of list) {
        const norm = this.normalize(s);
        if (norm && this.servers.length < this.MAX_SERVERS) {
          this.servers.push(norm);
        }
      }
    }
    if (this.servers.length === 0) {
      for (const s of Captcha.DEFAULT_SERVERS) {
        if (this.servers.length >= this.MAX_SERVERS) break;
        this.servers.push(s);
      }
    }
  }

  normalize(str) {
    if (!str) return null;
    const clean = str.trim().replace(/\s+/g, '');
    if (!clean) return null;
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return clean;
    }
    return `http://${clean}`;
  }

  servers() {
    return this.servers;
  }

  size() {
    return this.servers.length;
  }

  server(i) {
    if (i < 0 || i >= this.servers.length) return null;
    return this.servers[i];
  }

  addServer(str) {
    const norm = this.normalize(str);
    if (!norm) return false;
    if (this.servers.length >= this.MAX_SERVERS) return false;
    if (this.servers.some(s => s.toLowerCase() === norm.toLowerCase())) return false;
    this.servers.push(norm);
    return true;
  }

  removeServer(i) {
    if (i < 0 || i >= this.servers.length) return false;
    this.servers.splice(i, 1);
    return true;
  }

  poolSize() {
    return this.poolQ.length;
  }

  tokenUrl(server) {
    if (!server) return null;
    try {
      const url = new URL(server);
      const path = url.pathname;
      if (path && path !== '/' && path !== '') {
        return server;
      }
    } catch {}
    return `${server}/get-token`;
  }

  async request(server) {
    const url = this.tokenUrl(server);
    if (!url) return null;
    
    try {
      const response = await axios.get(url, {
        timeout: this.TIMEOUT,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Android)'
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      });
      
      if (response.status !== 200) return null;
      
      const token = this.parseToken(response.data);
      if (token) {
        this.totalFetched++;
        return token;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  parseToken(data) {
    if (!data) return '';
    
    try {
      if (typeof data === 'string') {
        // Try JSON parse
        try {
          const json = JSON.parse(data);
          if (json.token) return json.token;
          if (json.data && json.data.token) return json.data.token;
          if (json.tokens) {
            if (Array.isArray(json.tokens) && json.tokens.length > 0) {
              const first = json.tokens[0];
              if (typeof first === 'object' && first.token) return first.token;
              return String(first);
            }
            return String(json.tokens);
          }
          if (json.result && json.result.token) return json.result.token;
        } catch {}
        
        // Try string extraction
        const idx = data.indexOf('CN31_');
        if (idx >= 0) {
          let end = idx + 5;
          while (end < data.length && /[a-zA-Z0-9._*-]/.test(data[end])) {
            end++;
          }
          if (end > idx + 5) {
            return data.substring(idx, end);
          }
        }
        
        // Try regex
        const match = data.match(/CN31_[a-zA-Z0-9._-]+/);
        if (match) return match[0];
      }
    } catch {}
    return '';
  }

  async ping(server) {
    try {
      if (server.startsWith('https://') || server.startsWith('http://')) {
        const response = await axios.get(this.tokenUrl(server), {
          timeout: 2500,
          validateStatus: () => true,
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });
        return response.status === 200;
      }
      return false;
    } catch {
      return false;
    }
  }

  async probeAll(callback) {
    for (let i = 0; i < this.servers.length; i++) {
      const server = this.servers[i];
      if (!server) continue;
      const alive = await this.ping(server);
      this.probe[i] = alive ? 1 : -1;
      if (callback) callback(i, this.probe[i]);
    }
  }

  async fetchAll() {
    const servers = [...this.servers];
    const results = [];
    
    for (const server of servers) {
      try {
        const token = await this.request(server);
        if (token) {
          results.push(token.startsWith('CN31_') ? token : `CN31_${token}`);
        }
      } catch {}
    }
    return results;
  }

  async fetchOnce() {
    const servers = [...this.servers];
    for (const server of servers) {
      try {
        const token = await this.request(server);
        if (token) {
          const result = token.startsWith('CN31_') ? token : `CN31_${token}`;
          this.enqueue(result);
          this.leq(`CAP tok ${result.substring(0, 8)}...`);
          return result;
        }
      } catch {}
    }
    return null;
  }

  async fetchFast() {
    const token = await this.fetchOnce();
    this.leq(`FETCH -> ${token ? `CN31_${token.substring(0, 6)}...` : 'none'}`);
    return token;
  }

  enqueue(token) {
    if (!token) return false;
    if (this.tokenSeen.has(token)) return false;
    this.tokenSeen.add(token);
    if (this.tokenSeen.size > 100000) {
      const toRemove = Math.floor(this.tokenSeen.size / 2);
      let count = 0;
      for (const item of this.tokenSeen) {
        if (count >= toRemove) break;
        this.tokenSeen.delete(item);
        count++;
      }
    }
    this.poolQ.push(token);
    return true;
  }

  async take() {
    const token = this.poolQ.shift();
    if (token) return token;
    return this.fetchOnce();
  }

  startKeep() {
    this.keepGoing = true;
    this.leq('CAP keeper on');
    
    this.fetchInterval = setInterval(async () => {
      if (!this.keepGoing) {
        clearInterval(this.fetchInterval);
        return;
      }
      try {
        const tokens = await this.fetchAll();
        let count = 0;
        for (const token of tokens) {
          if (this.enqueue(token)) count++;
        }
        if (count > 0) {
          this.leq(`CAP pool +${count} (${this.poolSize()})`);
        }
      } catch {}
    }, 2000);
  }

  stopKeep() {
    this.keepGoing = false;
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
      this.fetchInterval = null;
    }
    this.leq(`CAP keeper stopped (total fetched: ${this.totalFetched})`);
  }

  getStats() {
    return {
      poolSize: this.poolSize(),
      totalFetched: this.totalFetched,
      serverCount: this.servers.length,
      seenTokens: this.tokenSeen.size
    };
  }
}

module.exports = Captcha;