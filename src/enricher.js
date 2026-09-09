const { Api } = require('./api');
const InfoFetcher = require('./info-fetcher');
const InfoExtractor = require('./info-extractor');
const BanCheck = require('./ban-check');
const path = require('path');

class Enricher {
  static DEVICE_FILE = path.join(__dirname, '..', 'output', 'devices.txt');
  static INFO_LOG = null;

  static setLog(log) {
    this.INFO_LOG = log;
  }

  static async enrich(account, password, response, checkBan = false) {
    try {
      const json = JSON.parse(response);
      const data = json.data;
      
      if (!data) {
        return `VALID [0] ${account} (no data in response: ${response.trim()})`;
      }
      
      const guid = data.guid || json.guid || '';
      const session = data.session || data.sessid || json.session || '';
      
      if (!guid || guid === '0') {
        return `VALID [0] ${account} guid=${guid} (raw: ${response.trim()})`;
      }
      
      if (!session) {
        return `VALID [0] ${account} guid=${guid} session missing`;
      }
      
      const guidNum = parseInt(guid);
      if (isNaN(guidNum)) {
        return `VALID [0] ${account} guid=${guid}`;
      }
      
      const start = Date.now();
      let info = null;
      let deviceId = 'N/A';
      
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await InfoFetcher.fetch(guidNum, session, this.DEVICE_FILE);
          if (result) {
            info = result;
            deviceId = InfoFetcher.lastDeviceId() || 'N/A';
            break;
          }
        } catch {}
        await this.sleep(1200);
      }
      
      let result = `${account}:${password}`;
      
      if (info) {
        const formatted = InfoExtractor.formatPipe(info);
        result += ` | ${formatted}`;
      } else {
        result += ` | V2L ${guidNum} : info failed (network busy?)`;
      }
      
      result += ` | Device ID : ${deviceId}`;
      result += ` | Guid : ${guidNum}`;
      result += ` | Session : ${session}`;
      result += ` | CheckerxWafbypass : @xvanngdxc`;
      
      if (checkBan) {
        const banResult = await BanCheck.checkBan(guidNum, session);
        if (banResult) {
          const banned = banResult[0];
          const message = banResult[1] || '';
          result += ` | Banned : ${banned} (${message})`;
        }
      }
      
      this.log(`INFO ${Date.now() - start}ms uid=${guidNum} ${info ? 'OK' : 'FAIL'}`);
      return result;
    } catch (error) {
      return `VALID [0] user=${account} (enrich err ${error.message})`;
    }
  }

  static log(msg) {
    if (this.INFO_LOG) {
      this.INFO_LOG.ev(msg);
    }
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Enricher;