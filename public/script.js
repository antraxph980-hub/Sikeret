// ANTrax ML Checker - Frontend Application

const API_BASE = '/api';

// Application State
const App = {
    running: false,
    stopFlag: false,
    stats: { done: 0, total: 0, valid: 0, two: 0, invalid: 0, error: 0 },
    previews: ['', '', '', ''],
    loadedText: '',
    editDirty: false,
    devices: [],
    servers: [],
    users: [],
    isAdmin: false,
    canCheck: false,
    isLoggedIn: false,
    username: '',
    updateInterval: null,
    poolInterval: null,
    statsInterval: null
};

// DOM Helpers
const $ = (id) => document.getElementById(id);
const $$ = (selector) => document.querySelectorAll(selector);

// Toast System
const Toast = {
    container: null,
    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    },
    show(message, type = 'info', duration = 3000) {
        this.init();
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        this.container.appendChild(toast);
        
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, duration);
    }
};

// ===== AUTH =====

async function checkAuth() {
    try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        App.isLoggedIn = data.authenticated;
        if (App.isLoggedIn && data.user) {
            App.isAdmin = data.user.isAdmin || false;
            App.canCheck = data.user.canCheck || false;
            App.username = data.user.username || '';
            
            // Update UI
            const display = document.getElementById('usernameDisplay');
            if (display) display.textContent = App.username;
            
            const badge = document.getElementById('userRoleBadge');
            if (badge) {
                if (App.isAdmin) {
                    badge.textContent = 'Admin';
                    badge.className = 'user-role admin';
                } else if (App.canCheck) {
                    badge.textContent = 'User';
                    badge.className = 'user-role user';
                } else {
                    badge.textContent = 'No Access';
                    badge.className = 'user-role no-access';
                }
            }
            
            // Show/hide admin elements
            const adminEls = document.querySelectorAll('.admin-only');
            adminEls.forEach(el => {
                el.style.display = App.isAdmin ? 'block' : 'none';
            });
            
            // Show/hide access denied banner
            const banner = document.getElementById('accessDeniedBanner');
            if (banner) {
                banner.style.display = App.canCheck ? 'none' : 'block';
            }
            
            // Show/hide admin page
            const adminPage = document.getElementById('page-admin');
            if (adminPage) {
                adminPage.style.display = App.isAdmin ? 'block' : 'none';
            }
            
            // Show/hide admin nav
            const adminNav = document.querySelector('.nav-btn[data-tab="admin"]');
            if (adminNav) {
                adminNav.style.display = App.isAdmin ? 'block' : 'none';
            }
        }
        
        if (!App.isLoggedIn && !window.location.pathname.includes('/login')) {
            window.location.href = '/login';
        }
        return App.isLoggedIn;
    } catch {
        return false;
    }
}

async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
}

// ===== API =====

async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (data) options.body = JSON.stringify(data);
    
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    
    if (response.status === 401) {
        window.location.href = '/login';
        throw new Error('Unauthorized');
    }
    if (response.status === 403) {
        Toast.show('Access denied. Contact administrator.', 'error');
        throw new Error('Forbidden');
    }
    
    return response.json();
}

async function fetchStatus() {
    try {
        const data = await apiCall('/status');
        const badge = document.getElementById('statusBadge');
        if (badge) {
            const step = data.step || 'IDLE';
            badge.textContent = `● ${step}`;
            badge.className = `badge status-badge ${step === 'IDLE' ? '' : 'active'}`;
        }
        const tokenCount = document.getElementById('tokenCount');
        if (tokenCount) tokenCount.textContent = data.tokens || 0;
        return data;
    } catch {
        return null;
    }
}

// ===== COMBO =====

const Combo = {
    cleanLine(line) {
        if (!line) return null;
        let clean = line.trim();
        if (!clean) return null;
        if (clean.startsWith('[') && clean.indexOf(']') > 0) {
            clean = clean.substring(clean.indexOf(']') + 1).trim();
        }
        const idx = clean.indexOf(':');
        if (idx > 0 && idx !== clean.length - 1) {
            if (clean.indexOf(':', idx + 1) >= 0) return null;
            const user = clean.substring(0, idx).trim();
            const pass = clean.substring(idx + 1).trim();
            if (user && pass && !user.includes(' ') && !pass.includes(' ') && 
                user.length >= 2 && pass.length >= 1 && !user.includes(':') && !pass.includes(':')) {
                return `${user}:${pass}`;
            }
        }
        return null;
    },
    load(text) {
        const lines = [];
        const unique = new Set();
        text.split('\n').forEach(line => {
            const cleaned = this.cleanLine(line);
            if (cleaned && !unique.has(cleaned)) {
                unique.add(cleaned);
                lines.push(cleaned);
            }
        });
        if (lines.length === 0) return null;
        return {
            text: lines.join('\n'),
            lines: lines.length,
            huge: lines.length > 3000
        };
    },
    preview(text, maxLines, maxChars) {
        const lines = text.split('\n');
        const preview = [];
        let chars = 0;
        for (const line of lines) {
            if (preview.length >= maxLines) break;
            if (chars > maxChars) break;
            preview.push(line);
            chars += line.length + 1;
        }
        const total = lines.filter(l => l.trim()).length;
        if (preview.length < total) {
            preview.push(`\n… +${total - preview.length} more`);
        }
        return preview.join('\n');
    }
};

function loadCombo() {
    const input = document.getElementById('comboInput');
    if (!input) return;
    const text = input.value.trim();
    if (text) {
        const loaded = Combo.load(text);
        if (loaded) applyCombo(loaded);
    }
}

function applyCombo(loaded) {
    App.loadedText = loaded.text;
    App.editDirty = false;
    const stats = document.getElementById('comboStats');
    if (stats) stats.textContent = `${loaded.lines} lines`;
    const input = document.getElementById('comboInput');
    if (input) {
        if (loaded.huge || loaded.lines > 50) {
            input.value = loaded.huge ? '' : Combo.preview(loaded.text, 50, 80000);
        } else {
            input.value = loaded.text;
        }
    }
}

// ===== CHECK =====

async function runCheck() {
    if (!App.canCheck) {
        Toast.show('You do not have permission to check accounts.', 'error');
        return;
    }

    const btn = document.getElementById('btnCheck');
    if (App.running) {
        App.stopFlag = true;
        if (btn) btn.textContent = 'STOPPING';
        return;
    }

    const source = App.loadedText || document.getElementById('comboInput')?.value || '';
    if (!source || source.trim().length === 0) {
        Toast.show('No combos to check', 'error');
        return;
    }

    App.stopFlag = false;
    App.running = true;
    if (btn) btn.textContent = 'STOP';
    App.stats = { done: 0, total: 0, valid: 0, two: 0, invalid: 0, error: 0 };
    updateStats();

    try {
        const response = await fetch('/api/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comboText: source, enrichValid: true })
        });
        
        if (response.status === 403) {
            Toast.show('Access denied. Contact administrator.', 'error');
            App.running = false;
            if (btn) btn.textContent = 'CHECK';
            return;
        }
        
        const result = await response.json();
        App.stats = {
            done: result.done || 0,
            total: result.total || 0,
            valid: result.valid || 0,
            two: result['2fa'] || 0,
            invalid: result.invalid || 0,
            error: result.error || 0
        };
        updateStats();
        const hint = document.getElementById('resultHint');
        if (hint) {
            hint.textContent = `Done ✓${result.valid} ⅷ${result['2fa']} ✕${result.invalid} !${result.error}`;
        }
        Toast.show(`Complete: ✓${result.valid} ⅷ${result['2fa']} ✕${result.invalid} !${result.error}`, 'success');
    } catch (error) {
        Toast.show('Check error: ' + error.message, 'error');
    }

    App.running = false;
    if (btn) btn.textContent = 'CHECK';
}

function updateStats() {
    const s = App.stats;
    const display = document.getElementById('progressDisplay');
    if (display) display.innerHTML = `${s.done} <span class="total">/ ${s.total}</span>`;
    
    ['Valid', '2fa', 'Invalid', 'Error'].forEach((key, i) => {
        const el = document.getElementById(`stat${key}`);
        if (el) {
            const values = [s.valid, s.two, s.invalid, s.error];
            el.textContent = values[i];
        }
    });
    
    const fill = document.getElementById('progressFill');
    if (fill && s.total > 0) {
        fill.style.width = `${(s.done / s.total) * 100}%`;
    }
}

// ===== USER MANAGEMENT =====

async function loadUsers() {
    if (!App.isAdmin) return;
    try {
        const data = await apiCall('/auth/users');
        App.users = data.users || [];
        renderUsers();
        const count = document.getElementById('userCount');
        if (count) count.textContent = `${App.users.length} users`;
    } catch {}
}

function renderUsers() {
    const container = document.getElementById('userList');
    if (!container) return;
    container.innerHTML = '';
    
    if (App.users.length === 0) {
        container.innerHTML = '<div class="text-muted" style="padding:12px;font-size:11px;">No users registered.</div>';
        return;
    }
    
    App.users.forEach((user, index) => {
        const div = document.createElement('div');
        div.className = 'user-item';
        const isAdmin = user.role === 'admin';
        const canCheck = user.canCheck || false;
        
        div.innerHTML = `
            <span class="text-muted" style="font-size:10px;min-width:28px;">#${index + 1}</span>
            <span class="username">${user.username}</span>
            <span class="badge-status ${isAdmin ? 'admin' : canCheck ? 'active' : 'inactive'}">
                ${isAdmin ? 'Admin' : canCheck ? 'Can Check' : 'No Access'}
            </span>
            ${!isAdmin ? `
                <button class="btn btn-sm ${canCheck ? 'btn-danger' : 'btn-success'}" 
                        data-action="toggle" data-username="${user.username}">
                    ${canCheck ? 'Disable' : 'Enable'}
                </button>
                <button class="btn btn-sm btn-danger" data-action="delete" data-username="${user.username}">✕</button>
            ` : ''}
        `;
        
        if (!isAdmin) {
            div.querySelector('[data-action="toggle"]')?.addEventListener('click', () => 
                toggleUserAccess(user.username, !canCheck));
            div.querySelector('[data-action="delete"]')?.addEventListener('click', () => 
                deleteUser(user.username));
        }
        container.appendChild(div);
    });
}

async function addUser() {
    if (!App.isAdmin) {
        Toast.show('Admin access required', 'error');
        return;
    }
    
    const username = document.getElementById('userUsername')?.value.trim();
    const password = document.getElementById('userPassword')?.value;
    
    if (!username || username.length < 3) {
        Toast.show('Username must be at least 3 characters', 'error');
        return;
    }
    if (!password || password.length < 6) {
        Toast.show('Password must be at least 6 characters', 'error');
        return;
    }
    
    try {
        const result = await apiCall('/auth/register', 'POST', { username, password, canCheck: false });
        if (result.success) {
            Toast.show(`User ${username} created successfully`, 'success');
            const uInput = document.getElementById('userUsername');
            const pInput = document.getElementById('userPassword');
            if (uInput) uInput.value = '';
            if (pInput) pInput.value = '';
            loadUsers();
        } else {
            Toast.show(result.error || 'Failed to create user', 'error');
        }
    } catch {
        Toast.show('Failed to create user', 'error');
    }
}

async function toggleUserAccess(username, canCheck) {
    if (!App.isAdmin) {
        Toast.show('Admin access required', 'error');
        return;
    }
    try {
        const result = await apiCall(`/auth/users/${username}/access`, 'PUT', { canCheck });
        if (result.success) {
            Toast.show(`User ${username} access ${canCheck ? 'enabled' : 'disabled'}`, 'success');
            loadUsers();
        } else {
            Toast.show(result.error || 'Failed to update access', 'error');
        }
    } catch {
        Toast.show('Failed to update access', 'error');
    }
}

async function deleteUser(username) {
    if (!App.isAdmin) {
        Toast.show('Admin access required', 'error');
        return;
    }
    if (!confirm(`Delete user "${username}"?`)) return;
    
    try {
        const result = await apiCall(`/auth/users/${username}`, 'DELETE');
        if (result.success) {
            Toast.show(`User ${username} deleted`, 'success');
            loadUsers();
        } else {
            Toast.show(result.error || 'Failed to delete user', 'error');
        }
    } catch {
        Toast.show('Failed to delete user', 'error');
    }
}

// ===== DEVICES =====

async function loadDevices() {
    if (!App.isAdmin) return;
    try {
        const data = await apiCall('/devices');
        App.devices = data.devices || [];
        renderDevices();
        const count = document.getElementById('deviceCount');
        if (count) count.textContent = `${App.devices.length} devices`;
    } catch {
        App.devices = [];
        renderDevices();
    }
}

function renderDevices() {
    const container = document.getElementById('devicesList');
    if (!container) return;
    container.innerHTML = '';
    
    if (App.devices.length === 0) {
        container.innerHTML = '<div class="text-muted" style="padding:12px;font-size:11px;">No devices configured.</div>';
        return;
    }
    
    App.devices.forEach((device, index) => {
        const div = document.createElement('div');
        div.className = 'device-item';
        div.innerHTML = `
            <span class="text-muted" style="font-size:10px;min-width:28px;">#${index + 1}</span>
            <span class="device-id">${device}</span>
            <button class="btn btn-sm btn-danger" data-index="${index}">Remove</button>
        `;
        div.querySelector('.btn-danger').addEventListener('click', () => deleteDevice(index));
        container.appendChild(div);
    });
}

async function addDevice() {
    if (!App.isAdmin) {
        Toast.show('Admin access required', 'error');
        return;
    }
    
    const input = document.getElementById('deviceInput');
    const device = input?.value.trim();
    if (!device) {
        Toast.show('Please enter a device ID', 'error');
        return;
    }
    if (!device.startsWith('and_')) {
        Toast.show('Device must start with "and_"', 'error');
        return;
    }
    
    try {
        const result = await apiCall('/devices', 'POST', { device });
        if (result.success) {
            if (input) input.value = '';
            Toast.show(`Device added (${result.count} total)`, 'success');
            loadDevices();
        } else {
            Toast.show(result.error || 'Failed to add device', 'error');
        }
    } catch {
        Toast.show('Failed to add device', 'error');
    }
}

async function deleteDevice(index) {
    if (!App.isAdmin) {
        Toast.show('Admin access required', 'error');
        return;
    }
    try {
        const result = await apiCall(`/devices/${index}`, 'DELETE');
        if (result.success) {
            Toast.show(`Device removed (${result.count} remaining)`, 'success');
            loadDevices();
        } else {
            Toast.show(result.error || 'Failed to delete device', 'error');
        }
    } catch {
        Toast.show('Failed to delete device', 'error');
    }
}

async function uploadDevicesFile() {
    if (!App.isAdmin) {
        Toast.show('Admin access required', 'error');
        return;
    }
    
    const fileInput = document.getElementById('deviceFileInput');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        Toast.show('Please select a file', 'error');
        return;
    }
    
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/devices/upload', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (result.success) {
            Toast.show(`${result.count} devices loaded`, 'success');
            loadDevices();
            fileInput.value = '';
        } else {
            Toast.show(result.error || 'Upload failed', 'error');
        }
    } catch {
        Toast.show('Upload failed', 'error');
    }
}

// ===== SERVERS =====

async function loadServers() {
    if (!App.isAdmin) return;
    try {
        const data = await apiCall('/servers');
        if (!data.servers) return;
        App.servers = data.servers;
        const container = document.getElementById('serverList');
        if (!container) return;
        container.innerHTML = '';
        
        data.servers.forEach((server, i) => {
            const div = document.createElement('div');
            div.className = 'server-item';
            const status = data.probes[i] === 1 ? 'online' : data.probes[i] === -1 ? 'offline' : 'unknown';
            const statusLabel = status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Unknown';
            div.innerHTML = `
                <span class="name">${hostLabel(server)}</span>
                <span class="status ${status}">${statusLabel}</span>
                <button class="btn btn-sm btn-danger remove" data-index="${i}">Remove</button>
            `;
            div.addEventListener('click', (e) => {
                if (e.target.classList.contains('remove')) {
                    removeServer(i);
                    return;
                }
                navigator.clipboard.writeText(`${server}/get-token`);
                Toast.show('Server URL copied', 'success');
            });
            container.appendChild(div);
        });
    } catch {}
}

function hostLabel(url) {
    return url.replace(/https?:\/\//, '').substring(0, 40);
}

async function addServer() {
    if (!App.isAdmin) {
        Toast.show('Admin access required', 'error');
        return;
    }
    
    const input = document.getElementById('serverInput');
    const server = input?.value.trim();
    if (!server) {
        Toast.show('Paste a server link first', 'error');
        return;
    }
    try {
        const result = await apiCall('/servers', 'POST', { server });
        if (result.ok) {
            if (input) input.value = '';
            Toast.show('Server added', 'success');
            loadServers();
        } else {
            Toast.show(result.error || 'Failed to add server', 'error');
        }
    } catch {
        Toast.show('Failed to add server', 'error');
    }
}

async function removeServer(index) {
    if (!App.isAdmin) {
        Toast.show('Admin access required', 'error');
        return;
    }
    try {
        const result = await apiCall(`/servers/${index}`, 'DELETE');
        if (result.ok) {
            Toast.show('Server removed', 'success');
            loadServers();
        }
    } catch {
        Toast.show('Failed to remove server', 'error');
    }
}

async function probeServers() {
    if (!App.isAdmin) {
        Toast.show('Admin access required', 'error');
        return;
    }
    const btn = document.getElementById('btnProbe');
    if (btn) btn.textContent = 'PROBING...';
    await apiCall('/servers/probe', 'POST');
    await loadServers();
    if (btn) btn.textContent = 'Re-probe';
    Toast.show('Servers probed', 'success');
}

async function fetchToken() {
    if (!App.canCheck) {
        Toast.show('You do not have permission to fetch tokens', 'error');
        return;
    }
    const btn = document.getElementById('btnFetch');
    if (btn) btn.textContent = 'FETCHING...';
    try {
        const result = await apiCall('/fetch-token', 'POST');
        const status = document.getElementById('lastToken');
        if (result.token) {
            if (status) {
                status.textContent = `Last captcha: ${result.truncated} · OK`;
                status.style.color = 'var(--accent-green)';
            }
            Toast.show('Token fetched: ' + result.truncated, 'success');
        } else {
            if (status) {
                status.textContent = 'Last captcha: None (all servers down)';
                status.style.color = 'var(--accent-red)';
            }
            Toast.show('No token available', 'error');
        }
    } catch {
        const status = document.getElementById('lastToken');
        if (status) {
            status.textContent = 'Last captcha: Fetch failed';
            status.style.color = 'var(--accent-red)';
        }
    }
    if (btn) btn.textContent = 'Fetch Token';
}

// ===== SETTINGS =====

async function loadSettings() {
    try {
        const data = await apiCall('/settings');
        if (data) {
            const status = document.getElementById('autoSaveStatus');
            if (status) {
                status.textContent = data.autoSave ? 'ON' : 'OFF';
                status.style.color = data.autoSave ? 'var(--accent-green)' : 'var(--accent-red)';
            }
            const threads = document.getElementById('threadCount');
            if (threads) threads.textContent = data.threads || 2;
            
            const cap = data.poolCap || -1;
            document.querySelectorAll('.cap-btn').forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.cap) === cap);
            });
            
            const dir = document.getElementById('saveDirInput');
            if (dir) dir.value = data.saveDir || './output';
            
            const info = document.getElementById('saveInfo');
            if (info) info.textContent = `Save → ${data.saveDir || './output'}/valid.txt`;
        }
    } catch {}
}

async function saveSettings() {
    const status = document.getElementById('autoSaveStatus');
    const autoSave = status?.textContent === 'ON';
    const threads = parseInt(document.getElementById('threadCount')?.textContent || '2');
    const saveDir = document.getElementById('saveDirInput')?.value.trim() || './output';
    
    try {
        await apiCall('/settings', 'POST', { autoSave, threads, saveDir });
        Toast.show('Settings saved', 'success');
        const info = document.getElementById('saveInfo');
        if (info) info.textContent = `Save → ${saveDir}/valid.txt`;
    } catch {
        Toast.show('Failed to save settings', 'error');
    }
}

async function changePassword() {
    const oldPassword = document.getElementById('oldPassword')?.value;
    const newPassword = document.getElementById('newPassword')?.value;
    const statusEl = document.getElementById('passwordChangeStatus');
    
    if (!oldPassword || !newPassword) {
        if (statusEl) {
            statusEl.textContent = 'Please enter both current and new password';
            statusEl.style.color = 'var(--accent-red)';
        }
        return;
    }
    
    if (newPassword.length < 6) {
        if (statusEl) {
            statusEl.textContent = 'New password must be at least 6 characters';
            statusEl.style.color = 'var(--accent-red)';
        }
        return;
    }
    
    try {
        const result = await apiCall('/auth/change-password', 'POST', { oldPassword, newPassword });
        if (result.success) {
            if (statusEl) {
                statusEl.textContent = 'Password changed successfully!';
                statusEl.style.color = 'var(--accent-green)';
            }
            document.getElementById('oldPassword').value = '';
            document.getElementById('newPassword').value = '';
            Toast.show('Password changed successfully', 'success');
        } else {
            if (statusEl) {
                statusEl.textContent = result.error || 'Failed to change password';
                statusEl.style.color = 'var(--accent-red)';
            }
        }
    } catch {
        if (statusEl) {
            statusEl.textContent = 'Failed to change password';
            statusEl.style.color = 'var(--accent-red)';
        }
    }
}

// ===== STATISTICS =====

async function loadStats() {
    if (!App.isAdmin) return;
    try {
        const data = await apiCall('/stats');
        document.getElementById('statTotalRequests').textContent = data.totalRequests || 0;
        document.getElementById('statCurrentTokens').textContent = data.currentTokens || 0;
        document.getElementById('statPoolSize').textContent = data.poolSize || 0;
        document.getElementById('statOnlineServers').textContent = data.servers?.online || 0;
        document.getElementById('statTotalServers').textContent = data.servers?.total || 0;
        
        const uptime = data.uptime || 0;
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = uptime % 60;
        document.getElementById('statUptime').textContent = 
            hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : 
            minutes > 0 ? `${minutes}m ${seconds}s` : 
            `${seconds}s`;
    } catch {}
}

// ===== UI UPDATES =====

async function updateUI() {
    const status = await fetchStatus();
    if (status) {
        const state = document.getElementById('sessionState');
        if (state) {
            state.textContent = `Step: ${status.step || 'IDLE'} · Tokens: ${status.tokens || 0} · Requests: ${status.requests || 0}`;
        }
    }
}

async function updatePoolInfo() {
    try {
        const status = await apiCall('/status');
        if (status) {
            const info = document.getElementById('poolInfo');
            if (info) {
                info.textContent = `Pool: ${status.poolSize || 0} tokens · Servers: ${status.serverCount || 0}`;
            }
            const count = document.getElementById('poolCount');
            if (count) {
                count.textContent = status.poolSize || 0;
            }
            const fill = document.getElementById('poolFill');
            if (fill) {
                const pct = Math.min((status.poolSize || 0) / 50 * 100, 100);
                fill.style.width = `${pct}%`;
            }
        }
    } catch {}
}

// ===== NAVIGATION =====

function initNavigation() {
    const btns = document.querySelectorAll('.nav-btn');
    const pages = {
        menu: document.getElementById('page-menu'),
        sessions: document.getElementById('page-sessions'),
        settings: document.getElementById('page-settings'),
        admin: document.getElementById('page-admin')
    };
    
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            Object.keys(pages).forEach(key => {
                if (pages[key]) {
                    pages[key].classList.toggle('active', key === tab);
                }
            });
        });
    });
}

// ===== EVENT LISTENERS =====

function initEventListeners() {
    // Combo
    document.getElementById('btnLoad')?.addEventListener('click', loadCombo);
    document.getElementById('btnOpen')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const text = await file.text();
            const loaded = Combo.load(text);
            if (loaded) applyCombo(loaded);
        };
        input.click();
    });
    document.getElementById('btnCheck')?.addEventListener('click', runCheck);
    document.getElementById('btnCheckAll')?.addEventListener('click', runCheck);

    // Fetch token
    document.getElementById('btnFetch')?.addEventListener('click', fetchToken);
    document.getElementById('btnFetchToken')?.addEventListener('click', fetchToken);

    // Copy log
    document.getElementById('btnCopyLog')?.addEventListener('click', async () => {
        try {
            const data = await apiCall('/log');
            if (data.log) {
                navigator.clipboard.writeText(data.log);
                Toast.show('Log copied to clipboard', 'success');
            }
        } catch {}
    });
    
    document.getElementById('btnClearLog')?.addEventListener('click', () => {
        const log = document.getElementById('logOutput');
        if (log) log.textContent = '';
        Toast.show('Log cleared', 'success');
    });

    // Probe servers
    document.getElementById('btnProbe')?.addEventListener('click', probeServers);

    // Add server
    document.getElementById('btnAddServer')?.addEventListener('click', addServer);
    document.getElementById('serverInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addServer();
    });

    // Devices
    document.getElementById('btnAddDevice')?.addEventListener('click', addDevice);
    document.getElementById('deviceInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addDevice();
    });
    document.getElementById('btnUploadDevices')?.addEventListener('click', uploadDevicesFile);

    // User management
    document.getElementById('btnAddUser')?.addEventListener('click', addUser);

    // Settings
    document.getElementById('btnSaveDir')?.addEventListener('click', saveSettings);
    document.getElementById('btnDefaultDir')?.addEventListener('click', () => {
        const input = document.getElementById('saveDirInput');
        if (input) input.value = './output';
        saveSettings();
    });

    // Auto-save toggle
    document.getElementById('autoSaveToggle')?.addEventListener('click', () => {
        const status = document.getElementById('autoSaveStatus');
        if (status) {
            const current = status.textContent === 'ON';
            status.textContent = current ? 'OFF' : 'ON';
            status.style.color = current ? 'var(--accent-red)' : 'var(--accent-green)';
            saveSettings();
        }
    });

    // Threads
    document.getElementById('btnThreadMinus')?.addEventListener('click', () => {
        const el = document.getElementById('threadCount');
        if (el) {
            let val = parseInt(el.textContent) || 2;
            val = Math.max(1, val - 1);
            el.textContent = val;
            saveSettings();
        }
    });
    document.getElementById('btnThreadPlus')?.addEventListener('click', () => {
        const el = document.getElementById('threadCount');
        if (el) {
            let val = parseInt(el.textContent) || 2;
            val = Math.min(6, val + 1);
            el.textContent = val;
            saveSettings();
        }
    });

    // Pool cap
    document.querySelectorAll('.cap-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cap-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            saveSettings();
        });
    });

    // Change password
    document.getElementById('btnChangePassword')?.addEventListener('click', changePassword);

    // Refresh stats
    document.getElementById('btnRefreshStats')?.addEventListener('click', loadStats);

    // Session
    document.getElementById('btnSessionOpen')?.addEventListener('click', async () => {
        try {
            const result = await apiCall('/session/open', 'POST');
            Toast.show(result.message || 'Session opened', 'success');
        } catch {
            Toast.show('Failed to open session', 'error');
        }
    });
    
    document.getElementById('btnSessionClose')?.addEventListener('click', async () => {
        try {
            const result = await apiCall('/session/close', 'POST');
            Toast.show(result.message || 'Session closed', 'success');
        } catch {
            Toast.show('Failed to close session', 'error');
        }
    });

    // Combo input
    document.getElementById('comboInput')?.addEventListener('input', () => {
        App.editDirty = true;
        const input = document.getElementById('comboInput');
        const stats = document.getElementById('comboStats');
        if (input && stats) {
            const loaded = Combo.load(input.value);
            stats.textContent = `${loaded?.lines || 0} lines (dirty)`;
        }
    });

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', logout);

    // Result cards - expand on click
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.result-card');
        if (card) {
            const body = card.querySelector('.result-card-body');
            const chevron = card.querySelector('.result-chevron');
            if (body) {
                const isOpen = body.classList.toggle('open');
                if (chevron) chevron.textContent = isOpen ? '▾' : '▸';
            }
        }
    });
}

// ===== INITIALIZATION =====

async function init() {
    // Check authentication
    const loggedIn = await checkAuth();
    if (!loggedIn) return;

    // Initialize navigation
    initNavigation();

    // Event listeners
    initEventListeners();

    // Load data
    await Promise.all([
        loadSettings(),
        fetchStatus()
    ]);

    if (App.isAdmin) {
        await Promise.all([
            loadDevices(),
            loadServers(),
            loadUsers(),
            loadStats()
        ]);
    }

    // Set default pool cap
    document.querySelector('.cap-btn[data-cap="-1"]')?.classList.add('active');

    // Start polling
    if (App.updateInterval) clearInterval(App.updateInterval);
    App.updateInterval = setInterval(updateUI, 2000);

    if (App.poolInterval) clearInterval(App.poolInterval);
    App.poolInterval = setInterval(updatePoolInfo, 3000);

    if (App.isAdmin && App.statsInterval) {
        clearInterval(App.statsInterval);
        App.statsInterval = setInterval(loadStats, 10000);
    }

    console.log('ANTrax ML Checker v3.0 loaded');
    console.log(`Admin: ${App.isAdmin}`);
    console.log(`Can Check: ${App.canCheck}`);
}

// Start application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}