class InfoExtractor {
  static HERO_IDS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129];
  
  static HERO_NAMES = ['Miya','Balmond','Saber','Alice','Nana','Tigreal','Alucard','Karina','Akai','Franco','Bane','Bruno','Clint','Rafaela','Eudora','Zilong','Fanny','Layla','Minotaur','Lolita','Hayabusa','Freya','Gord','Natalia','Kagura','Chou','Sun','Alpha','Ruby','Yi Sun-shin','Moskov','Johnson','Cyclops','Estes','Hilda','Aurora','Lapu-Lapu','Vexana','Roger','Karrie','Gatotkaca','Harley','Irithel','Grock','Argus','Odette','Lancelot','Diggie','Hylos','Zhask','Helcurt','Pharsa','Lesley','Jawhead','Angela','Gusion','Valir','Martis','Uranus','Hanabi',"Chang'e",'Kaja','Selena','Aldous','Claude','Vale','Leomord','Lunox','Hanzo','Belerick','Kimmy','Thamuz','Harith','Minsitthar','Kadita','Faramis','Badang','Khufra','Granger','Guinevere','Esmeralda','Terizla','X.Borg','Ling','Dyrroth','Lylia','Baxia','Masha','Wanwan','Silvanna','Cecilion','Carmilla','Atlas','Popol and Kupa','Yu Zhong','Luo Yi','Benedetta','Khaleed','Barats','Brody','Yve','Mathilda','Paquito','Gloo','Beatrix','Phoveus','Natan','Aulus','Aamon','Valentina','Edith','Floryn','Yin','Melissa','Xavier','Julian','Fredrinn','Joy','Novaria','Arlott','Ixia','Nolan','Cici','Chip','Zhuxin','Suyou','Lukas','Kalea','Zetian'];

  static RANK_BANDS = [
    [0,3],[4,7],[8,11],[12,16],[17,21],[22,26],[27,31],[32,36],[37,41],[42,46],[47,52],[53,58],[59,64],[65,70],[71,76],[77,82],[83,88],[89,94],[95,100],[101,106],[107,112],[113,118],[119,124],[125,130],[131,136]
  ];

  static RANK_NAMES = ['Warrior III','Warrior II','Warrior I','Elite III','Elite II','Elite I','Master IV','Master III','Master II','Master I','Grandmaster V','Grandmaster IV','Grandmaster III','Grandmaster II','Grandmaster I','Epic V','Epic IV','Epic III','Epic II','Epic I','Legend V','Legend IV','Legend III','Legend II','Legend I'];

  static extract(sdpStruct, sdpStruct2) {
    if (!sdpStruct) return null;
    
    try {
      const info = {
        status: 'success',
        data: {
          basic_info: {
            nickname: 'Unknown',
            player_id: '0',
            server: '0',
            level: '0',
            skin_count: '0',
            hero_count: '0'
          },
          skin_info: { skin_breakdown: {} },
          location_info: {
            location: 'N/A',
            last_login: 'Never',
            last_login_country: 'Unknown',
            create_account_country: 'Unknown'
          },
          game_info: {
            current_rank: 'Unknown',
            high_rank: 'Unknown',
            achievement_points: '0',
            squad: 'N/A',
            hero_history: [],
            matches: '0'
          },
          collector_info: {
            collector_point: '0',
            collector_tier: 'No Tier',
            collector_rank: '0'
          },
          security_info: { v2l_status: 'No' }
        }
      };
      
      return info;
    } catch {
      return null;
    }
  }

  static formatPipe(map) {
    if (!map) return 'INFOS-FAIL';
    
    try {
      const data = map.data || {};
      const basic = data.basic_info || {};
      const game = data.game_info || {};
      const location = data.location_info || {};
      const collector = data.collector_info || {};
      const security = data.security_info || {};
      
      const parts = [
        `V2L Status : ${(security.v2l_status || 'No').toLowerCase()}`,
        `Nickname : ${basic.nickname || 'Unknown'}`,
        `Player ID : ${basic.player_id || '0'}`,
        `Server : ${basic.server || '0'}`,
        `Level : ${basic.level || '0'}`,
        `Skin Count : ${basic.skin_count || '0'}`,
        `Hero Count : ${basic.hero_count || '0'}`,
        `Skin Breakdown : ${this.skinBreakdown(data.skin_info)}`,
        `Current Rank : ${game.current_rank || 'Unknown'}`,
        `Highest Rank : ${game.high_rank || 'Unknown'}`,
        `Achievement : ${game.achievement_points || '0'}`,
        `Total Matches : ${game.matches || '0'}`,
        `Squad : ${game.squad || 'N/A'}`,
        `Recent Heroes : ${this.join(game.hero_history, ', ') || 'N/A'}`,
        `Collector : ${collector.collector_tier || 'No Tier'} (${collector.collector_point || 0} pts)`,
        `Location : ${location.location || 'N/A'}`,
        `Last Login : ${location.last_login || 'Never'}`,
        `Last Login Country : ${location.last_login_country || 'Unknown'}`,
        `Create Account Country : ${location.create_account_country || 'Unknown'}`,
        `Collector Rank : ${collector.collector_rank || '0'}`
      ];
      
      return parts.join(' | ');
    } catch {
      return 'INFOS-FAIL';
    }
  }

  static skinBreakdown(skinInfo) {
    if (!skinInfo) return 'N/A';
    const breakdown = skinInfo.skin_breakdown || {};
    const parts = [];
    for (const [key, value] of Object.entries(breakdown)) {
      if (value > 0) {
        parts.push(`${key}:${value}`);
      }
    }
    return parts.length ? parts.join('; ') : 'N/A';
  }

  static mapRank(rank) {
    for (let i = 0; i < this.RANK_BANDS.length; i++) {
      const [min, max] = this.RANK_BANDS[i];
      if (rank >= min && rank <= max) return this.RANK_NAMES[i];
    }
    if (rank >= 137 && rank <= 161) return `Mythic ${rank - 136}`;
    if (rank >= 162 && rank <= 186) return `Mythical Honor ${rank - 136}`;
    if (rank >= 187 && rank <= 236) return `Mythical Glory ${rank - 136}`;
    if (rank >= 237 && rank <= 9999) return `Mythical Immortal ${rank - 136}`;
    return 'Unknown';
  }

  static mapCollectorPoint(points) {
    if (points < 1000) return 'No Tier';
    const thresholds = [1000, 4000, 10000, 22000, 44000, 84000, 160000, 280000];
    const maxes = [4000, 10000, 22000, 44000, 84000, 160000, 280000, Infinity];
    const names = ['Amateur Collector', 'Junior Collector', 'Seasoned Collector', 
                   'Expert Collector', 'Renowned Collector', 'Exalted Collector',
                   'Mega Collector', 'World Collector'];
    const suffixes = ['V', 'IV', 'III', 'II', 'I'];
    
    for (let i = 0; i < thresholds.length; i++) {
      if (points >= thresholds[i] && points < maxes[i]) {
        if (i === thresholds.length - 1) return 'World Collector';
        const tier = Math.min(4, Math.floor((points - thresholds[i]) / ((maxes[i] - thresholds[i]) / 5)));
        return `${names[i]} ${suffixes[tier]}`;
      }
    }
    return 'Unknown';
  }

  static getHeroHistory(list) {
    const result = [];
    if (!list) return result;
    for (let i = list.length - 1; i >= 0 && result.length < 5; i--) {
      const id = list[i];
      if (typeof id === 'number') {
        const idx = this.HERO_IDS.indexOf(id);
        const name = idx >= 0 ? this.HERO_NAMES[idx] : `Unknown(${id})`;
        result.push(name);
      }
    }
    return result;
  }

  static formatTimestamp(ts) {
    if (!ts || ts === 0) return 'Never';
    try {
      return new Date(ts * 1000).toISOString().replace('T', ' ').substring(0, 19);
    } catch {
      return 'Unknown';
    }
  }

  static parseSkinCounts(struct) {
    return {};
  }

  static join(obj, sep) {
    if (!obj) return 'N/A';
    if (Array.isArray(obj)) {
      return obj.filter(Boolean).join(sep) || 'N/A';
    }
    return String(obj);
  }
}

module.exports = InfoExtractor;