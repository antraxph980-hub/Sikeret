const axios = require('axios');
const https = require('https');

class BanCheck {
  static async checkBan(guid, session) {
    const jwt = await this.getJwt(session, guid);
    if (!jwt) return [null, 'N/A (no JWT for bare upass)'];
    return this.getBan(jwt, session);
  }

  static async getJwt(token, id) {
    try {
      const response = await axios.post(
        'https://api.mobilelegends.com/tools/deleteaccount/getToken',
        { id, token, type: 'mt_And' },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          },
          timeout: 20000,
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
        }
      );
      
      const data = response.data;
      if (data.data && data.data.jwt) {
        return data.data.jwt;
      }
      return '';
    } catch {
      return '';
    }
  }

  static async getBan(jwt, token) {
    try {
      const response = await axios.post(
        'https://api.mobilelegends.com/tools/selfservice/punishList',
        `lang=en&token=${token}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${jwt}`,
            'User-Agent': 'Mozilla/5.0'
          },
          timeout: 20000,
          httpsAgent: new https.Agent({ rejectUnauthorized: false })
        }
      );
      
      const data = response.data;
      const punishInfo = data.punish_info || data.data || [];
      
      if (Array.isArray(punishInfo) && punishInfo.length > 0) {
        return [true, `${punishInfo.length} record(s)`];
      }
      
      if (data.status === 'error' && data.code !== 0) {
        return [false, `api error code=${data.code}`];
      }
      
      return [false, 'none'];
    } catch {
      return [null, 'ban fetch failed'];
    }
  }
}

module.exports = BanCheck;