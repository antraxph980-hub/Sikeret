const zlib = require('zlib');

class Zstd {
  static compress(data) {
    try {
      // Use zlib as fallback
      return zlib.gzipSync(data);
    } catch {
      return data;
    }
  }

  static decompress(data) {
    try {
      return zlib.gunzipSync(data);
    } catch {
      return data;
    }
  }
}

module.exports = Zstd;