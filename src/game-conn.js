const crypto = require('crypto');
const zlib = require('zlib');
const SdpStruct = require('./sdp-struct');

class GameConn {
  static LOGIN_HOST = 'global-login.ml.youngjoygame.com';
  static LOGIN_PORT = 30021;
  static AES_KEY = Buffer.from('f5a193d50ade553e9835595f5cd75ddd', 'hex');
  static AES_IV = Buffer.alloc(16, 0);

  constructor(deviceId) {
    this.deviceId = deviceId;
    this.channel = 'and_usa';
    this.clientVersion = '2.1.99.1205.1';
    this.accountId = 0;
    this.sessionKey = '';
    this.zoneId = 0;
    this.gameServerHost = '';
    this.gameServerPort = 0;
    this.sequence = 1;
    this.socket = null;
    this.lastCmd = 0;
    this.lastBody = null;
    this.queue = Buffer.alloc(0);
  }

  async loginToLoginServer() {
    // Web environment - simulated connection
    this.accountId = 123456789;
    this.sessionKey = 'mock_session_' + Date.now();
    this.zoneId = 1;
    return true;
  }

  async getGameServer() {
    this.gameServerHost = 'global-game.ml.youngjoygame.com';
    this.gameServerPort = 30001;
    return true;
  }

  async connectToGameServer() {
    return true;
  }

  async getAccountInfo(guid, session) {
    const info = new SdpStruct();
    // Simulate account info
    info.put(0, guid);
    info.put(1, this.zoneId);
    info.put(2, 'TestPlayer');
    info.put(3, 30);
    info.put(5, Math.floor(Date.now() / 1000));
    info.put(83, 150);
    info.build();
    return info;
  }

  async getRoleInfo(guid, session) {
    const info = new SdpStruct();
    info.put(9, 50); // hero count
    info.put(22, 1000); // matches
    info.build();
    return info;
  }

  close() {
    // Clean up
  }

  accountId() { return this.accountId; }
  sessionKey() { return this.sessionKey; }
  zoneId() { return this.zoneId; }
  gameServerHost() { return this.gameServerHost; }
  gameServerPort() { return this.gameServerPort; }
}

module.exports = GameConn;