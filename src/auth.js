const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

class Auth {
  constructor() {
    this.usersFile = path.join(__dirname, '..', 'users.json');
  }

  init() {
    if (!fs.existsSync(this.usersFile)) {
      const defaultUsers = {
        users: [
          {
            id: '1',
            username: 'antrax',
            password: bcrypt.hashSync('admin@AntraxdevZ', 10),
            role: 'admin',
            canCheck: true,
            createdAt: new Date().toISOString()
          }
        ]
      };
      fs.writeFileSync(this.usersFile, JSON.stringify(defaultUsers, null, 2));
      console.log('✅ Admin user created: antrax / admin@AntraxdevZ');
    }
  }

  getUsers() {
    try {
      const data = fs.readFileSync(this.usersFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return { users: [] };
    }
  }

  saveUsers(data) {
    fs.writeFileSync(this.usersFile, JSON.stringify(data, null, 2));
  }

  async register(username, password, canCheck = false) {
    const data = this.getUsers();
    
    if (data.users.find(u => u.username === username)) {
      return { success: false, message: 'Username already exists' };
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: Date.now().toString(),
      username,
      password: hashedPassword,
      role: 'user',
      canCheck: canCheck || false,
      createdAt: new Date().toISOString()
    };
    
    data.users.push(newUser);
    this.saveUsers(data);
    
    return { success: true, message: 'User registered successfully' };
  }

  async login(username, password) {
    const data = this.getUsers();
    const user = data.users.find(u => u.username === username);
    
    if (!user) {
      return { success: false, message: 'Invalid username or password' };
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return { success: false, message: 'Invalid username or password' };
    }
    
    return { 
      success: true,
      userId: user.id,
      user: {
        username: user.username,
        role: user.role,
        canCheck: user.canCheck || false
      }
    };
  }

  async updateUserAccess(username, canCheck) {
    const data = this.getUsers();
    const user = data.users.find(u => u.username === username);
    
    if (!user) {
      return { success: false, message: 'User not found' };
    }
    
    if (user.role === 'admin') {
      return { success: false, message: 'Cannot modify admin account' };
    }
    
    user.canCheck = canCheck;
    this.saveUsers(data);
    
    return { success: true, message: `User ${username} access updated to ${canCheck ? 'enabled' : 'disabled'}` };
  }

  async deleteUser(username) {
    const data = this.getUsers();
    const index = data.users.findIndex(u => u.username === username);
    
    if (index === -1) {
      return { success: false, message: 'User not found' };
    }
    
    if (data.users[index].role === 'admin') {
      return { success: false, message: 'Cannot delete admin account' };
    }
    
    data.users.splice(index, 1);
    this.saveUsers(data);
    
    return { success: true, message: 'User deleted successfully' };
  }

  async listUsers() {
    const data = this.getUsers();
    return data.users.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role || 'user',
      canCheck: u.canCheck || false,
      createdAt: u.createdAt
    }));
  }

  async changePassword(username, oldPassword, newPassword) {
    const data = this.getUsers();
    const user = data.users.find(u => u.username === username);
    
    if (!user) {
      return { success: false, message: 'User not found' };
    }
    
    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) {
      return { success: false, message: 'Current password is incorrect' };
    }
    
    user.password = await bcrypt.hash(newPassword, 10);
    this.saveUsers(data);
    
    return { success: true, message: 'Password changed successfully' };
  }
}

module.exports = new Auth();