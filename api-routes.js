import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data dir:', err);
  }
}

const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'Lagos#Admin2024',
  joinedAt: '2024-01-01T00:00:00.000Z',
  balance: 1000000,
  hasClaimed: true
};

export function loadServerUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const content = fs.readFileSync(USERS_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        // Ensure admin always exists in the list
        const hasAdmin = parsed.some(
          (u) => u.username.toLowerCase() === 'admin'
        );
        if (!hasAdmin) {
          parsed.unshift(DEFAULT_ADMIN);
          saveServerUsers(parsed);
        }
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error reading users.json:', err);
  }

  // Fallback: seed with admin
  const initial = [DEFAULT_ADMIN];
  saveServerUsers(initial);
  return initial;
}

export function saveServerUsers(users) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing users.json:', err);
    return false;
  }
}

/**
 * Attaches central API routes to an Express app or middleware
 */
export function registerApiRoutes(app) {
  // CORS middleware for /api
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Login / auto-registration endpoint
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    const trimmedUsername = (username || '').trim();

    if (!trimmedUsername) {
      return res.status(400).json({ success: false, error: 'Username is required.' });
    }
    if (!password) {
      return res.status(400).json({ success: false, error: 'Password is required.' });
    }

    const users = loadServerUsers();
    const existing = users.find(
      (u) => u.username.toLowerCase() === trimmedUsername.toLowerCase()
    );

    if (existing) {
      if (existing.password !== password) {
        return res.status(401).json({ success: false, error: 'Incorrect password.' });
      }
      return res.json({ success: true, account: existing, isNew: false });
    }

    // Auto-create new account
    const newAccount = {
      username: trimmedUsername,
      password: password,
      joinedAt: new Date().toISOString(),
      balance: 0,
      hasClaimed: false
    };

    users.push(newAccount);
    saveServerUsers(users);

    return res.json({ success: true, account: newAccount, isNew: true });
  });

  // Claim 1 Trillion Naira endpoint
  app.post('/api/claim', (req, res) => {
    const { username } = req.body || {};
    if (!username || !username.trim()) {
      return res.status(400).json({ success: false, error: 'Username is required.' });
    }

    const users = loadServerUsers();
    const target = users.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!target) {
      return res.status(404).json({ success: false, error: 'Account not found.' });
    }

    if (target.hasClaimed) {
      return res.status(400).json({
        success: false,
        error: 'You already claimed your 1 Trillion Naira.'
      });
    }

    target.balance = 1000000000000;
    target.hasClaimed = true;
    saveServerUsers(users);

    return res.json({ success: true, account: target });
  });

  // Admin endpoint: retrieve all registered users from server
  app.get('/api/admin/users', (_req, res) => {
    const users = loadServerUsers();
    return res.json({ success: true, users });
  });

  // Admin endpoint: update a user's balance or claimed status
  app.post('/api/admin/update-user', (req, res) => {
    const { username, balance, hasClaimed } = req.body || {};
    if (!username) {
      return res.status(400).json({ success: false, error: 'Username required.' });
    }

    const users = loadServerUsers();
    const target = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
    if (!target) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    if (typeof balance === 'number') {
      target.balance = Math.max(0, balance);
    }
    if (typeof hasClaimed === 'boolean') {
      target.hasClaimed = hasClaimed;
    }

    saveServerUsers(users);
    return res.json({ success: true, account: target });
  });

  // Admin endpoint: delete a user (admin cannot be deleted)
  app.post('/api/admin/delete-user', (req, res) => {
    const { username } = req.body || {};
    if (!username || username.trim().toLowerCase() === 'admin') {
      return res.status(400).json({ success: false, error: 'Cannot delete admin account.' });
    }

    let users = loadServerUsers();
    const initialLen = users.length;
    users = users.filter((u) => u.username.toLowerCase() !== username.trim().toLowerCase());

    if (users.length === initialLen) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    saveServerUsers(users);
    return res.json({ success: true, users });
  });

  // Endpoint to merge and persist accounts across container restarts
  app.post('/api/sync', (req, res) => {
    const { users: incomingUsers } = req.body || {};
    if (Array.isArray(incomingUsers)) {
      const current = loadServerUsers();
      const map = new Map();
      current.forEach((u) => map.set((u.username || '').toLowerCase(), u));
      incomingUsers.forEach((u) => {
        if (u && u.username) {
          const key = u.username.toLowerCase();
          if (!map.has(key)) {
            map.set(key, u);
          } else {
            const existing = map.get(key);
            if (u.hasClaimed) {
              existing.hasClaimed = true;
              existing.balance = Math.max(existing.balance || 0, u.balance || 0);
            }
          }
        }
      });
      const merged = Array.from(map.values());
      saveServerUsers(merged);
      return res.json({ success: true, count: merged.length });
    }
    return res.status(400).json({ success: false, error: 'Array of users expected.' });
  });

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });
}
