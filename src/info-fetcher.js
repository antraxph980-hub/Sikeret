const axios = require('axios');
const https = require('https');
const GameConn = require('./game-conn');
const SdpStruct = require('./sdp-struct');
const fs = require('fs');

class InfoFetcher {
  static FETCH_LOG = null;
  static lastDeviceId = 'N/A';
  static BUILTIN_DEVICES = [
    'and_33c9084d10d104e2e0e95288782a92ff3h0ixfjcdk5dm3i9deffa6fb-7f6c-4b46-bcc3-a52ab97c367c',
    'and_8f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0123456789abcdef01234567-0123-4567-89ab-cdef0123'
  ];
  static accountDevice = new Map();

  static setLog(log) {
    this.FETCH_LOG = log;
  }

  static log(msg) {
    if (this.FETCH_LOG) {
      this.FETCH_LOG.ev(msg);
    }
  }

  static async fetch(guid, session, deviceFile, timeout = 20000) {
    this.log(`FETCH uid=${guid} session=${session.substring(0, 8)}...`);
    
    let devices = [];
    
    if (deviceFile) {
      try {
        const content = fs.readFileSync(deviceFile, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && trimmed.startsWith('and_')) {
            devices.push(trimmed);
          }
        }
      } catch {}
    }
    
    if (devices.length === 0) {
      devices = [...this.BUILTIN_DEVICES];
    }
    
    let deviceId = this.accountDevice.get(guid);
    
    const startTime = Date.now();
    
    for (let attempt = 0; attempt < Math.min(devices.length, 10); attempt++) {
      if (Date.now() - startTime > timeout) break;
      
      const device = deviceId || devices[attempt % devices.length];
      this.lastDeviceId = device;
      
      try {
        const result = await this.fetchWithDevice(guid, session, device, timeout);
        if (result) {
          this.accountDevice.set(guid, device);
          this.log(`FETCH OK uid=${guid} device=${device.substring(0, 20)}...`);
          return result;
        }
      } catch {}
      
      await this.sleep(500);
    }
    
    this.log(`FETCH FAIL uid=${guid}`);
    return null;
  }

  static async fetchWithDevice(guid, session, deviceId, timeout) {
    const conn = new GameConn(deviceId);
    
    try {
      const connected = await conn.loginToLoginServer();
      if (!connected) return null;
      
      const gameServer = await conn.getGameServer();
      if (!gameServer) return null;
      
      const gameConnected = await conn.connectToGameServer();
      if (!gameConnected) return null;
      
      const accountInfo = await conn.getAccountInfo(guid, session);
      if (!accountInfo) return null;
      
      const roleInfo = await conn.getRoleInfo(guid, session);
      
      const extracted = InfoExtractor.extract(accountInfo, roleInfo);
      if (!extracted) return null;
      
      return extracted;
    } catch (error) {
      this.log(`FETCH device error: ${error.message}`);
      return null;
    } finally {
      conn.close();
    }
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static lastDeviceId() {
    return this.lastDeviceId;
  }
}

module.exports = InfoFetcher;