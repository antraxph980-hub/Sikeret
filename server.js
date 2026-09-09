const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Import modules
const Checker = require('./src/checker');
const Captcha = require('./src/captcha');
const Waf = require('./src/waf');
const Batch = require('./src/batch');
const Saves = require('./src/saves');
const Enricher = require('./src/enricher');
const InfoFetcher = require('./src/info-fetcher');
const Auth = require('./src/auth');
const { Api } = require('./src/api');
const { sleep, truncate } = require('./src/utils');

const app = express();
const PORT = process.env.PORT || 8735;

// ===== MIDDLEWARE =====
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'antrax-ml-checker-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// View engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// ===== ENSURE DIRECTORIES =====
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

// ===== INITIALIZE =====
Auth.init();

// ===== COMPONENTS =====
const captcha = new Captcha({
  ev: (msg) => console.log(`[CAPTCHA] ${msg}`)
});

const waf = new Waf({
  ev: (msg) => console.log(`[WAF] ${msg}`)
});

const checker = new Checker(waf, captcha, {
  ev: (msg) => console.log(`[CHECKER] ${msg}`)
});

// Set up logging
Enricher.setLog({ ev: (msg) => console.log(`[ENRICH] ${msg}`) });
InfoFetcher.setLog({ ev: (msg) => console.log(`[FETCH] ${msg}`) });

// Start services
waf.start();
captcha.startKeep();

// ===== AUTH MIDDLEWARE =====
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  if (req.path.startsWith('/api/') && !req.path.startsWith('/api/auth/')) {
    return res.status(401).json({ error: 'Unauthorized', redirect: '/login' });
  }
  res.redirect('/login');
};

const requireAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  if (req.path.startsWith('/api/')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  res.status(403).send('Admin access required');
};

const requireCheckerAccess = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.canCheck) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(403).json({ error: 'Checker access required' });
  }
  res.status(403).send('Checker access required');
};

// ===== AUTH ROUTES =====
app.get('/login', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  const result = await Auth.login(username, password);
  if (result.success) {
    req.session.user = {
      username: result.user.username,
      role: result.user.role,
      canCheck: result.user.canCheck,
      isAdmin: result.user.role === 'admin'
    };
    req.session.userId = result.userId;
    res.json({ success: true, redirect: '/', user: req.session.user });
  } else {
    res.status(401).json({ error: result.message });
  }
});

app.post('/api/auth/register', requireAuth, requireAdmin, async (req, res) => {
  const { username, password, canCheck } = req.body;
  if (!username || username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  const result = await Auth.register(username, password, canCheck || false);
  if (result.success) {
    res.json({ success: true, message: 'User registered successfully' });
  } else {
    res.status(400).json({ error: result.message });
  }
});

app.put('/api/auth/users/:username/access', requireAuth, requireAdmin, async (req, res) => {
  const { username } = req.params;
  const { canCheck } = req.body;
  if (username === 'antrax') {
    return res.status(400).json({ error: 'Cannot modify admin account' });
  }
  
  const result = await Auth.updateUserAccess(username, canCheck);
  if (result.success) {
    res.json({ success: true, message: result.message });
  } else {
    res.status(400).json({ error: result.message });
  }
});

app.delete('/api/auth/users/:username', requireAuth, requireAdmin, async (req, res) => {
  const { username } = req.params;
  if (username === 'antrax') {
    return res.status(400).json({ error: 'Cannot delete admin account' });
  }
  
  const result = await Auth.deleteUser(username);
  if (result.success) {
    res.json({ success: true, message: result.message });
  } else {
    res.status(400).json({ error: result.message });
  }
});

app.get('/api/auth/users', requireAuth, requireAdmin, async (req, res) => {
  const users = await Auth.listUsers();
  res.json({ users });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/status', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false });
  }
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  
  const result = await Auth.changePassword(req.session.user.username, oldPassword, newPassword);
  if (result.success) {
    res.json({ success: true, message: result.message });
  } else {
    res.status(400).json({ error: result.message });
  }
});

// ===== PROTECTED ROUTES =====
app.get('/', requireAuth, (req, res) => {
  res.render('dashboard', {
    title: 'ANTrax ML Checker',
    version: '3.0.0',
    user: req.session.user
  });
});

// ===== API ROUTES =====

// Status
app.get('/api/status', requireAuth, (req, res) => {
  res.json({
    ok: true,
    uptime_s: Math.floor((Date.now() - waf.bootMs) / 1000),
    requests: waf.apiRequests.get(),
    step: waf.step,
    tokens: waf.tokenCount(),
    last: waf.lastApiBody ? waf.lastApiBody.substring(0, 200) : '',
    poolSize: captcha.poolSize(),
    serverCount: captcha.size(),
    user: req.session.user,
    canCheck: req.session.user.canCheck,
    isAdmin: req.session.user.isAdmin,
    wafStatus: waf.sessionActive ? 'active' : 'inactive'
  });
});

app.get('/api/ping', requireAuth, (req, res) => {
  res.json({ ok: true, step: waf.step, timestamp: Date.now() });
});

app.get('/api/tokens', requireAuth, (req, res) => {
  const tokens = waf.tokenUrls.slice(-10).map(url => Api.blur(url));
  res.json({
    count: waf.tokenCount(),
    tokens,
    hasFullToken: !!waf.lastFullTokenUrl()
  });
});

app.get('/api/log', requireAuth, (req, res) => {
  const log = waf.getLog();
  const lines = log.split('\n');
  const lastLines = lines.slice(-100).join('\n');
  res.json({ 
    log: lastLines,
    totalLines: lines.length,
    truncated: lines.length > 100
  });
});

app.get('/api/last', requireAuth, (req, res) => {
  const last = waf.lastCapture;
  if (last) {
    try {
      res.json(JSON.parse(last));
    } catch {
      res.json({ raw: last });
    }
  } else {
    res.json({});
  }
});

app.get('/api/cookies', requireAuth, (req, res) => {
  res.json({ cookies: 'N/A in web environment' });
});

// Single Login Check
app.post('/api/login', requireAuth, requireCheckerAccess, async (req, res) => {
  const { account, password, payload, e_captcha } = req.body;
  
  try {
    waf.apiRequests.increment();
    waf.lastRequestMs = Date.now();
    
    let loginPayload;
    if (payload) {
      loginPayload = payload;
    } else if (account && password) {
      const md5pwd = Api.md5(password);
      const captchaToken = e_captcha || await captcha.take() || '';
      loginPayload = Api.loginPayload(account, md5pwd, captchaToken);
    } else {
      return res.status(400).json({ error: 'Missing account/password or payload' });
    }
    
    waf.lastReqAccount = Api.extractAccount(loginPayload);
    const startTime = Date.now();
    const result = await waf.login(loginPayload, '/login');
    const responseTime = Date.now() - startTime;
    waf.lastApiBody = result;
    
    const response = {
      request: { account, timestamp: new Date().toISOString(), responseTime: `${responseTime}ms` }
    };
    
    try {
      const parsed = JSON.parse(result);
      Object.assign(response, parsed);
    } catch {
      response.raw = result;
    }
    
    // Enrich if valid
    if (result && result.includes('"code":0')) {
      try {
        const enriched = await Enricher.enrich(account, password || '', result, false);
        response.enriched = enriched;
      } catch {}
    }
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch Check
app.post('/api/batch', requireAuth, requireCheckerAccess, async (req, res) => {
  const { comboText, autoSave, enrichValid, checkBan } = req.body;
  
  if (!comboText || comboText.length === 0) {
    return res.status(400).json({ error: 'No combo text provided' });
  }
  
  try {
    waf.apiRequests.increment();
    waf.lastRequestMs = Date.now();
    
    if (autoSave !== undefined) Saves.auto = autoSave;
    
    // Pass enrichment options
    const options = { enrichValid, checkBan };
    const result = await Batch.runJson(comboText, checker, options);
    res.json(JSON.parse(result));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset WAF
app.post('/api/reset', requireAuth, requireAdmin, (req, res) => {
  waf.reset();
  res.json({ ok: true, message: 'WAF session reset' });
});

// Fetch Token
app.post('/api/fetch-token', requireAuth, requireCheckerAccess, async (req, res) => {
  try {
    const token = await captcha.fetchFast();
    if (token) {
      res.json({ 
        token, 
        truncated: token.substring(0, 12) + '...',
        length: token.length,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({ error: 'No token available (servers down)' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch Multiple Tokens
app.post('/api/fetch-tokens', requireAuth, requireAdmin, async (req, res) => {
  const { count = 5 } = req.body;
  const tokens = [];
  const errors = [];
  
  for (let i = 0; i < Math.min(count, 20); i++) {
    try {
      const token = await captcha.fetchOnce();
      if (token) {
        tokens.push(token);
      } else {
        errors.push(`Attempt ${i + 1}: No token`);
      }
    } catch (error) {
      errors.push(`Attempt ${i + 1}: ${error.message}`);
    }
  }
  
  res.json({ 
    tokens, 
    count: tokens.length, 
    errors: errors.length > 0 ? errors : undefined
  });
});

// ===== ADMIN: SERVERS =====

app.get('/api/servers', requireAuth, requireAdmin, (req, res) => {
  const servers = captcha.servers();
  const probes = [];
  for (let i = 0; i < servers.length; i++) {
    probes.push(captcha.probe[i] || 0);
  }
  const total = servers.length;
  const online = probes.filter(p => p === 1).length;
  res.json({ servers, probes, total, online });
});

app.post('/api/servers', requireAuth, requireAdmin, (req, res) => {
  const { server } = req.body;
  if (!server) {
    return res.status(400).json({ error: 'Server URL required' });
  }
  
  if (captcha.addServer(server)) {
    Saves.servers = captcha.servers();
    Saves.save();
    res.json({ ok: true, server, total: captcha.size() });
  } else {
    res.status(400).json({ error: 'Invalid or duplicate server' });
  }
});

app.delete('/api/servers/:index', requireAuth, requireAdmin, (req, res) => {
  const index = parseInt(req.params.index);
  if (isNaN(index) || index < 0 || index >= captcha.size()) {
    return res.status(400).json({ error: 'Invalid server index' });
  }
  
  const server = captcha.server(index);
  if (captcha.removeServer(index)) {
    Saves.servers = captcha.servers();
    Saves.save();
    res.json({ ok: true, server, total: captcha.size() });
  } else {
    res.status(400).json({ error: 'Failed to remove server' });
  }
});

app.post('/api/servers/probe', requireAuth, requireAdmin, async (req, res) => {
  captcha.probeAll((i, state) => {});
  res.json({ ok: true, message: 'Probing started' });
});

app.get('/api/servers/probe-status', requireAuth, requireAdmin, (req, res) => {
  const servers = captcha.servers();
  const probes = [];
  for (let i = 0; i < servers.length; i++) {
    probes.push(captcha.probe[i] || 0);
  }
  res.json({ probes });
});

// ===== ADMIN: DEVICES =====

app.get('/api/devices', requireAuth, requireAdmin, (req, res) => {
  const devicesPath = path.join(outputDir, 'devices.txt');
  try {
    if (fs.existsSync(devicesPath)) {
      const content = fs.readFileSync(devicesPath, 'utf8');
      const devices = content.split('\n')
        .map(line => line.trim())
        .filter(line => line && line.startsWith('and_'));
      res.json({ devices, count: devices.length });
    } else {
      const defaultDevices = [
        'and_33c9084d10d104e2e0e95288782a92ff3h0ixfjcdk5dm3i9deffa6fb-7f6c-4b46-bcc3-a52ab97c367c',
        'and_8f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0123456789abcdef01234567-0123-4567-89ab-cdef0123'
      ];
      fs.writeFileSync(devicesPath, defaultDevices.join('\n'));
      res.json({ devices: defaultDevices, count: defaultDevices.length });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/devices', requireAuth, requireAdmin, (req, res) => {
  const { device } = req.body;
  if (!device || !device.trim()) {
    return res.status(400).json({ error: 'Device ID required' });
  }
  
  const cleanDevice = device.trim();
  if (!cleanDevice.startsWith('and_')) {
    return res.status(400).json({ error: 'Device must start with "and_"' });
  }
  
  const devicesPath = path.join(outputDir, 'devices.txt');
  try {
    let devices = [];
    if (fs.existsSync(devicesPath)) {
      const content = fs.readFileSync(devicesPath, 'utf8');
      devices = content.split('\n').map(line => line.trim()).filter(line => line);
    }
    
    if (devices.includes(cleanDevice)) {
      return res.status(400).json({ error: 'Device already exists' });
    }
    
    devices.push(cleanDevice);
    fs.writeFileSync(devicesPath, devices.join('\n'));
    res.json({ success: true, device: cleanDevice, count: devices.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/devices/:index', requireAuth, requireAdmin, (req, res) => {
  const index = parseInt(req.params.index);
  if (isNaN(index) || index < 0) {
    return res.status(400).json({ error: 'Invalid index' });
  }
  
  const devicesPath = path.join(outputDir, 'devices.txt');
  try {
    if (!fs.existsSync(devicesPath)) {
      return res.status(404).json({ error: 'No devices found' });
    }
    
    const content = fs.readFileSync(devicesPath, 'utf8');
    const devices = content.split('\n').map(line => line.trim()).filter(line => line);
    
    if (index >= devices.length) {
      return res.status(400).json({ error: 'Device not found' });
    }
    
    const removed = devices[index];
    devices.splice(index, 1);
    fs.writeFileSync(devicesPath, devices.join('\n'));
    res.json({ success: true, device: removed, count: devices.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const upload = multer({ dest: tmpDir, limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/api/devices/upload', requireAuth, requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  try {
    const content = fs.readFileSync(req.file.path, 'utf8');
    const devices = content.split('\n')
      .map(line => line.trim())
      .filter(line => line && line.startsWith('and_'));
    
    if (devices.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'No valid devices found in file' });
    }
    
    const devicesPath = path.join(outputDir, 'devices.txt');
    fs.writeFileSync(devicesPath, devices.join('\n'));
    fs.unlinkSync(req.file.path);
    
    res.json({ success: true, count: devices.length });
  } catch (error) {
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ error: error.message });
  }
});

// ===== ENRICHMENT =====

app.post('/api/enrich', requireAuth, requireCheckerAccess, async (req, res) => {
  const { account, password, response, banCheck, deviceFile } = req.body;
  
  if (!account || !response) {
    return res.status(400).json({ error: 'Account and response required' });
  }
  
  try {
    // Use custom device file if provided
    if (deviceFile) {
      Enricher.DEVICE_FILE = deviceFile;
    }
    
    const result = await Enricher.enrich(account, password || '', response, banCheck || false);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== SETTINGS =====

app.get('/api/settings', requireAuth, (req, res) => {
  res.json({
    autoSave: Saves.auto,
    threads: Saves.threads,
    poolCap: Saves.poolCap,
    saveDir: Saves.dir,
    canCheck: req.session.user.canCheck,
    isAdmin: req.session.user.isAdmin,
    version: '3.0.0'
  });
});

app.post('/api/settings', requireAuth, (req, res) => {
  const { autoSave, threads, poolCap, saveDir } = req.body;
  
  if (autoSave !== undefined) Saves.auto = autoSave;
  if (threads !== undefined) Saves.threads = Math.max(1, Math.min(6, threads));
  if (poolCap !== undefined) Saves.poolCap = poolCap >= 0 ? poolCap : -1;
  if (saveDir) Saves.dir = saveDir;
  
  Saves.save();
  res.json({ success: true });
});

// ===== SESSION MANAGEMENT =====

app.post('/api/session/open', requireAuth, (req, res) => {
  if (!waf.sessionActive) {
    waf.start();
    res.json({ ok: true, message: 'Session opened' });
  } else {
    res.json({ ok: true, message: 'Session already open' });
  }
});

app.post('/api/session/close', requireAuth, (req, res) => {
  if (waf.sessionActive) {
    waf.destroy();
    res.json({ ok: true, message: 'Session closed' });
  } else {
    res.json({ ok: true, message: 'Session already closed' });
  }
});

app.get('/api/session/status', requireAuth, (req, res) => {
  res.json({
    active: waf.sessionActive,
    step: waf.step,
    tokens: waf.tokenCount(),
    requests: waf.apiRequests.get(),
    uptime: Math.floor((Date.now() - waf.bootMs) / 1000)
  });
});

// ===== STATISTICS =====

app.get('/api/stats', requireAuth, requireAdmin, (req, res) => {
  const stats = {
    totalRequests: waf.apiRequests.get(),
    currentTokens: waf.tokenCount(),
    poolSize: captcha.poolSize(),
    servers: {
      total: captcha.size(),
      online: captcha.servers().filter((_, i) => captcha.probe[i] === 1).length
    },
    uptime: Math.floor((Date.now() - waf.bootMs) / 1000),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  };
  res.json(stats);
});

// ===== SYSTEM =====

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    uptime: Math.floor((Date.now() - waf.bootMs) / 1000),
    version: '3.0.0'
  });
});

app.get('/api/system/info', requireAuth, (req, res) => {
  res.json({
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: require('os').cpus().length,
    memory: require('os').totalmem(),
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// ===== ERROR HANDLING =====

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// ===== START SERVER =====

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║        ANTrax ML CHECKER v1                                          ║
║                                                                       ║
║        URL: http://localhost:${PORT}                                  ║
║        Login: /login                                                 ║
║                                                                       ║
║        API Endpoints:                                                ║
║        GET  /api/status      - Server status                        ║
║        GET  /api/ping        - Health check                         ║
║        GET  /api/tokens      - Token list                           ║
║        GET  /api/log         - Event log                            ║
║        POST /api/login       - Single login check                   ║
║        POST /api/batch       - Batch combo check                    ║
║        POST /api/fetch-token - Fetch captcha token                  ║
║        GET  /api/servers     - Server list (admin)                  ║
║        GET  /api/devices     - Device list (admin)                  ║
║        GET  /api/auth/users  - User list (admin)                    ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  captcha.stopKeep();
  waf.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down...');
  captcha.stopKeep();
  waf.destroy();
  process.exit(0);
});