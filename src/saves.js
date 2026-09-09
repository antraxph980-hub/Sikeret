const fs = require('fs');
const path = require('path');

class Saves {
  constructor() {
    this.auto = true;
    this.dir = path.join(__dirname, '..', 'output');
    this.poolCap = -1;
    this.runDir = '';
    this.threads = 2;
    this.sessionNo = 0;
    this.servers = [];
    this.load();
  }

  static getInstance() {
    if (!this._instance) {
      this._instance = new Saves();
    }
    return this._instance;
  }

  load() {
    try {
      const configPath = path.join(__dirname, '..', 'config.json');
      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        this.dir = data.dir || this.dir;
        this.auto = data.auto !== undefined ? data.auto : true;
        this.threads = Math.max(1, Math.min(6, data.threads || 2));
        this.poolCap = data.poolCap || -1;
        this.servers = data.servers || [];
      }
    } catch {}
  }

  save() {
    try {
      const configPath = path.join(__dirname, '..', 'config.json');
      const data = {
        dir: this.dir,
        auto: this.auto,
        threads: this.threads,
        poolCap: this.poolCap,
        servers: this.servers
      };
      fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
    } catch {}
  }

  startRun() {
    this.sessionNo++;
    const base = this.dir.endsWith('/') ? this.dir.slice(0, -1) : this.dir;
    this.runDir = `${base}/session[${this.sessionNo}]`;
    try {
      if (!fs.existsSync(this.runDir)) {
        fs.mkdirSync(this.runDir, { recursive: true });
      }
    } catch {}
    return this.runDir;
  }

  slash(file) {
    const base = this.runDir || this.dir;
    return `${base}/${file}`;
  }
}

module.exports = Saves.getInstance();