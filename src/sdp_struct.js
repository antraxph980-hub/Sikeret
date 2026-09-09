class SdpStruct {
  constructor() {
    this.values = new Map();
    this.data = null;
    this.offset = 0;
  }

  get(key) {
    return this.values.get(key);
  }

  getLong(key) {
    const val = this.values.get(key);
    if (typeof val === 'number') return val;
    if (typeof val === 'bigint') return Number(val);
    return 0;
  }

  getString(key) {
    const val = this.values.get(key);
    if (typeof val === 'string') return val;
    return null;
  }

  getStruct(key) {
    const val = this.values.get(key);
    if (val instanceof SdpStruct) return val;
    return null;
  }

  getList(key) {
    const val = this.values.get(key);
    if (Array.isArray(val)) return val;
    return null;
  }

  getMap(key) {
    const val = this.values.get(key);
    if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof SdpStruct)) {
      return val;
    }
    return null;
  }

  has(key) {
    return this.values.has(key);
  }

  put(key, value) {
    this.values.set(key, value);
  }

  tags() {
    return this.values.keys();
  }

  raw() {
    if (!this.data) {
      this.build();
    }
    return this.data;
  }

  build() {
    const buffer = [];
    buffer.push(0x70);
    for (const [key, value] of this.values) {
      buffer.push(key < 15 ? key : 0x0F);
      if (key >= 15) {
        // Write extended key
        this.writeNumber(buffer, key);
      }
      // Encode value based on type
      if (typeof value === 'number') {
        buffer.push(0x00);
        this.writeNumber(buffer, value);
      } else if (typeof value === 'string') {
        buffer.push(0x04);
        const bytes = Buffer.from(value, 'utf8');
        this.writeNumber(buffer, bytes.length);
        buffer.push(...bytes);
      } else if (value instanceof SdpStruct) {
        buffer.push(0x07);
        const raw = value.raw();
        for (let i = 1; i < raw.length - 1; i++) {
          buffer.push(raw[i]);
        }
        buffer.push(0x80);
      }
    }
    buffer.push(0x80);
    this.data = Buffer.from(buffer);
    return this.data;
  }

  writeNumber(buffer, num) {
    const bytes = [];
    do {
      let byte = num & 0x7F;
      num >>>= 7;
      if (num > 0) byte |= 0x80;
      bytes.push(byte);
    } while (num > 0);
    buffer.push(...bytes);
  }

  static decode(data) {
    const struct = new SdpStruct();
    struct.data = data;
    struct.offset = 0;
    struct.unpack();
    return struct;
  }

  unpack() {
    this.values.clear();
    // Simplified parsing
    return this;
  }

  static build(...args) {
    const struct = new SdpStruct();
    for (let i = 0; i < args.length; i += 2) {
      if (i + 1 < args.length) {
        struct.put(args[i], args[i + 1]);
      }
    }
    struct.build();
    return struct;
  }

  toString() {
    return `SdpStruct{${this.values.size} entries}`;
  }
}

module.exports = SdpStruct;