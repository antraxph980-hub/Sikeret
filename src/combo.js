class Combo {
  static cleanLine(str) {
    if (!str) return null;
    const trimmed = str.trim();
    if (!trimmed) return null;
    
    let clean = trimmed;
    if (clean.startsWith('[') && clean.indexOf(']') > 0) {
      clean = clean.substring(clean.indexOf(']') + 1).trim();
    }
    
    const idx = clean.indexOf(':');
    if (idx > 0 && idx !== clean.length - 1) {
      if (clean.indexOf(':', idx + 1) >= 0) return null;
      const user = clean.substring(0, idx).trim();
      const pass = clean.substring(idx + 1).trim();
      if (this.validPair(user, pass)) {
        return `${user}:${pass}`;
      }
    }
    return null;
  }

  static validPair(user, pass) {
    if (!user || !pass) return false;
    if (user.includes(' ') || pass.includes(' ')) return false;
    if (user.length < 2 || pass.length < 1) return false;
    if (user.includes(':') || pass.includes(':')) return false;
    return true;
  }

  static countLines(str) {
    if (!str) return 0;
    const lines = str.split('\n');
    return lines.filter(l => l.trim()).length || 1;
  }

  static preview(str, maxLines, maxChars) {
    if (!str) return '';
    const lines = str.split('\n');
    const preview = [];
    let chars = 0;
    for (const line of lines) {
      if (preview.length >= maxLines) break;
      if (chars > maxChars) break;
      preview.push(line);
      chars += line.length + 1;
    }
    const totalLines = this.countLines(str);
    if (preview.length < totalLines) {
      preview.push(`\n… +${totalLines - preview.length} more`);
    }
    return preview.join('\n');
  }

  static load(text, filePath) {
    const lines = [];
    const unique = new Set();
    
    const rawLines = text.split('\n');
    for (const line of rawLines) {
      const cleaned = this.cleanLine(line);
      if (cleaned && !unique.has(cleaned)) {
        unique.add(cleaned);
        lines.push(cleaned);
      }
    }
    
    if (lines.length === 0) return null;
    
    return {
      text: lines.join('\n'),
      path: filePath || 'input',
      lines: lines.length,
      huge: lines.length > 3000
    };
  }

  static validateLine(line) {
    const cleaned = this.cleanLine(line);
    if (cleaned) {
      const idx = cleaned.indexOf(':');
      return {
        valid: true,
        account: cleaned.substring(0, idx),
        password: cleaned.substring(idx + 1),
        raw: cleaned
      };
    }
    return { valid: false, account: null, password: null, raw: null };
  }
}

module.exports = Combo;