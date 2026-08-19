const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// /data folder එකට point කරන්න
const uploadsDir = path.join('/data', 'uploads');

// Create uploads directory if it doesn't exist
if (!fs.existsSync('/data')) fs.mkdirSync('/data', { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const db = new sqlite3.Database('/data/roadcam.db');

// ═══════════════════════════════════════════════════════════
//  DATABASE TABLES
// ═══════════════════════════════════════════════════════════
db.serialize(() => {
  // Photos table
  db.run(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      location TEXT NOT NULL,
      route TEXT DEFAULT '',
      device TEXT NOT NULL,
      filepath TEXT NOT NULL,
      uploaded_by TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Existing DB වලට optional columns add කරන්න (error ignore)
  db.run(`ALTER TABLE photos ADD COLUMN original_filepath TEXT DEFAULT ''`, () => {});
  db.run(`ALTER TABLE photos ADD COLUMN route TEXT DEFAULT ''`, () => {});
  db.run(`ALTER TABLE photos ADD COLUMN uploaded_by TEXT DEFAULT 'admin'`, () => {});

  // Routes table
  db.run(`
    CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      pin TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, () => {
    // Default admin account (first time only)
    db.run(
      `INSERT OR IGNORE INTO users (username, pin, role) VALUES ('admin', '1234', 'admin')`,
      () => console.log('✅ Default admin ready  →  user: admin  |  pin: 1234')
    );
  });
});

// ═══════════════════════════════════════════════════════════
//  MIDDLEWARE
// ═══════════════════════════════════════════════════════════
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use("/uploads", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}, express.static(uploadsDir, {
  maxAge: '7d',
  etag: true,
  lastModified: true
}));

app.use(express.static(__dirname));

// ─── Simple auth middleware ────────────────────────────────
// Frontend session token: "username:role" base64 (lightweight, no JWT lib needed)
function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [username, role] = decoded.split(':');
    if (!username || !role) throw new Error('bad token');
    req.authUser = { username, role };
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.authUser.role !== 'admin')
      return res.status(403).json({ error: 'Admin only' });
    next();
  });
}

// ═══════════════════════════════════════════════════════════
//  MULTER
// ═══════════════════════════════════════════════════════════
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const filename = `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// ═══════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════

// Login
app.post('/api/login', (req, res) => {
  const { username, pin } = req.body;
  if (!username || !pin)
    return res.status(400).json({ error: 'Username and PIN required' });

  db.get(
    'SELECT id, username, role FROM users WHERE username = ? AND pin = ?',
    [username.trim(), pin.trim()],
    (err, user) => {
      if (err || !user)
        return res.status(401).json({ error: 'Invalid username or PIN' });

      // Simple base64 token: "username:role"
      const token = Buffer.from(`${user.username}:${user.role}`).toString('base64');
      res.json({
        success: true,
        token,
        id: user.id,
        username: user.username,
        role: user.role
      });
    }
  );
});

// Verify token
app.get('/api/verify', requireAuth, (req, res) => {
  res.json({ success: true, user: req.authUser });
});

// ═══════════════════════════════════════════════════════════
//  USER MANAGEMENT (Admin only)
// ═══════════════════════════════════════════════════════════

// Get all users
app.get('/api/users', requireAdmin, (req, res) => {
  db.all(
    'SELECT id, username, role, created_at FROM users ORDER BY role DESC, username ASC',
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

// Add user
app.post('/api/users', requireAdmin, (req, res) => {
  const { username, pin, role } = req.body;
  if (!username || !pin)
    return res.status(400).json({ error: 'Username and PIN required' });
  if (!['admin', 'user'].includes(role))
    return res.status(400).json({ error: 'Role must be admin or user' });

  db.run(
    'INSERT INTO users (username, pin, role) VALUES (?, ?, ?)',
    [username.trim().toLowerCase(), pin.trim(), role],
    function(err) {
      if (err) return res.status(400).json({ error: 'Username already exists' });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// Delete user (cannot delete own account or last admin)
app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'User not found' });
    if (user.username === req.authUser.username)
      return res.status(400).json({ error: 'Cannot delete your own account' });

    db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

// Change own PIN
app.patch('/api/users/pin', requireAuth, (req, res) => {
  const { old_pin, new_pin } = req.body;
  if (!old_pin || !new_pin)
    return res.status(400).json({ error: 'old_pin and new_pin required' });

  db.get(
    'SELECT id FROM users WHERE username = ? AND pin = ?',
    [req.authUser.username, old_pin.trim()],
    (err, user) => {
      if (err || !user)
        return res.status(401).json({ error: 'Current PIN incorrect' });

      db.run(
        'UPDATE users SET pin = ? WHERE username = ?',
        [new_pin.trim(), req.authUser.username],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true });
        }
      );
    }
  );
});

// Admin reset any user PIN
app.patch('/api/users/:id/pin', requireAdmin, (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN required' });
  db.run(
    'UPDATE users SET pin = ? WHERE id = ?',
    [pin.trim(), req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ═══════════════════════════════════════════════════════════
//  PHOTO ROUTES
// ═══════════════════════════════════════════════════════════

// Upload photo
app.post('/api/upload', requireAuth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { type, date, time, timestamp, location, route, device } = req.body;
  const filename    = req.file.filename;
  const filepath    = `/uploads/${filename}`;
  const uploaded_by = req.authUser.username;

  const sql = `INSERT INTO photos
    (filename, type, date, time, timestamp, location, route, device, filepath, original_filepath, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(sql,
    [filename, type, date, time, timestamp, location, route || '', device, filepath, filepath, uploaded_by],
    function(err) {
      if (err) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: 'Database error: ' + err.message });
      }
      res.json({ success: true, filepath, id: this.lastID });
    }
  );
});

// Get photos
// Admin → all photos
// User  → own photos only
app.get('/api/photos', requireAuth, (req, res) => {
  const { date, route } = req.query;
  const isAdmin = req.authUser.role === 'admin';

  let sql    = `SELECT * FROM photos WHERE 1=1`;
  const params = [];

  if (!isAdmin) {
    sql += ` AND uploaded_by = ?`;
    params.push(req.authUser.username);
  }
  if (date)  { sql += ` AND date = ?`;            params.push(date); }
  if (route) { sql += ` AND LOWER(route) LIKE ?`; params.push('%' + route.toLowerCase() + '%'); }
  sql += ` ORDER BY date DESC, time DESC`;

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Get photos by type
app.get('/api/photos/type/:type', requireAuth, (req, res) => {
  const isAdmin = req.authUser.role === 'admin';
  let sql = `SELECT * FROM photos WHERE type = ?`;
  const params = [req.params.type];
  if (!isAdmin) { sql += ` AND uploaded_by = ?`; params.push(req.authUser.username); }
  sql += ` ORDER BY date DESC, time DESC`;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Get photos by date
app.get('/api/photos/date/:date', requireAuth, (req, res) => {
  const isAdmin = req.authUser.role === 'admin';
  let sql = `SELECT * FROM photos WHERE date = ?`;
  const params = [req.params.date];
  if (!isAdmin) { sql += ` AND uploaded_by = ?`; params.push(req.authUser.username); }
  sql += ` ORDER BY time DESC`;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Re-stamp (own photo or admin)
app.put("/api/restamp/:id", requireAuth, upload.single("photo"), (req, res) => {
  const { id } = req.params;
  const isAdmin = req.authUser.role === 'admin';

  db.get("SELECT * FROM photos WHERE id = ?", [id], (err, photo) => {
    if (err || !photo) return res.status(404).json({ error: "Photo not found" });
    if (!isAdmin && photo.uploaded_by !== req.authUser.username)
      return res.status(403).json({ error: "Not your photo" });

    const { type, date, time, timestamp, location, device } = req.body;
    const route = req.body.route || '';

    if (req.file) {
      const oldPath = path.join("/data", photo.filepath);
      if (fs.existsSync(oldPath) && photo.filepath !== photo.original_filepath)
        fs.unlinkSync(oldPath);

      const newFilepath = "/uploads/" + req.file.filename;
      const origPath    = photo.original_filepath || photo.filepath;

      db.run(
        "UPDATE photos SET type=?,date=?,time=?,timestamp=?,location=?,route=?,device=?,filename=?,filepath=?,original_filepath=? WHERE id=?",
        [type, date, time, timestamp, location, route, device, req.file.filename, newFilepath, origPath, id],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true, id, filepath: newFilepath, original_filepath: origPath });
        }
      );
    } else {
      db.run(
        "UPDATE photos SET type=?,date=?,time=?,timestamp=?,location=?,route=?,device=? WHERE id=?",
        [type, date, time, timestamp, location, route, device, id],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true, id, filepath: photo.filepath });
        }
      );
    }
  });
});

// Delete photo (admin or own)
app.delete('/api/photos/:id', requireAuth, (req, res) => {
  const isAdmin = req.authUser.role === 'admin';
  db.get('SELECT * FROM photos WHERE id = ?', [req.params.id], (err, photo) => {
    if (err || !photo) return res.status(404).json({ error: 'Photo not found' });
    if (!isAdmin && photo.uploaded_by !== req.authUser.username)
      return res.status(403).json({ error: 'Not your photo' });

    const filePath = path.join('/data', photo.filepath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.run('DELETE FROM photos WHERE id = ?', [photo.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

// Delete photos by date (admin only)
app.delete('/api/photos/delete/date/:date', requireAdmin, (req, res) => {
  db.all('SELECT id, filepath FROM photos WHERE date = ?', [req.params.date], (err, photos) => {
    if (err) return res.status(500).json({ error: err.message });
    photos.forEach(photo => {
      const filePath = path.join('/data', photo.filepath);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      db.run('DELETE FROM photos WHERE id = ?', [photo.id]);
    });
    res.json({ success: true, deleted: photos.length });
  });
});

// Stats
app.get('/api/stats', requireAuth, (req, res) => {
  const isAdmin = req.authUser.role === 'admin';
  const where   = isAdmin ? '' : `WHERE uploaded_by = '${req.authUser.username}'`;
  const stats   = {};
  db.get(`SELECT COUNT(*) as total FROM photos ${where}`, (err, row) => {
    stats.total = row?.total || 0;
    db.get(`SELECT COUNT(*) as count FROM photos ${where ? where + ' AND' : 'WHERE'} type = 'poster'`, (err, row) => {
      stats.poster = row?.count || 0;
      db.get(`SELECT COUNT(*) as count FROM photos ${where ? where + ' AND' : 'WHERE'} type = 'self'`, (err, row) => {
        stats.self = row?.count || 0;
        db.all(`SELECT date, COUNT(*) as count FROM photos ${where} GROUP BY date ORDER BY date DESC`, (err, rows) => {
          stats.byDate = rows || [];
          res.json(stats);
        });
      });
    });
  });
});

// Export DB (admin only)
app.get('/api/export', requireAdmin, (req, res) => {
  db.all('SELECT * FROM photos', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="RoadCam_DB_${new Date().toISOString().split('T')[0]}.json"`);
    res.send(JSON.stringify(rows, null, 2));
  });
});

// Bulk route update (admin only)
app.patch('/api/photos/bulk/route', requireAdmin, (req, res) => {
  const { ids, route } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: 'ids required' });
  const placeholders = ids.map(() => '?').join(',');
  db.run(
    `UPDATE photos SET route = ? WHERE id IN (${placeholders})`,
    [route || '', ...ids],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, updated: this.changes });
    }
  );
});

// ═══════════════════════════════════════════════════════════
//  ROUTES (Admin only for add/delete)
// ═══════════════════════════════════════════════════════════
app.get('/api/routes', requireAuth, (req, res) => {
  db.all('SELECT * FROM routes ORDER BY name ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/routes', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Route name required' });
  db.run('INSERT INTO routes (name) VALUES (?)', [name.trim().toUpperCase()], function(err) {
    if (err) return res.status(400).json({ error: 'Route already exists' });
    res.json({ success: true, id: this.lastID, name: name.trim().toUpperCase() });
  });
});

app.delete('/api/routes/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM routes WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ═══════════════════════════════════════════════════════════
//  HEALTH + HTML ROUTES
// ═══════════════════════════════════════════════════════════
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'pro_road_cam_server_upload.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`🔑 Default login  →  admin / 1234`);
});

process.on('SIGINT', () => {
  db.close();
  console.log('Database connection closed');
  process.exit(0);
});
