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

// Create tables safely
db.serialize(() => {
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Existing DB වලට optional columns add කරන්න
  db.run(`ALTER TABLE photos ADD COLUMN original_filepath TEXT DEFAULT ''`, () => {});
  db.run(`ALTER TABLE photos ADD COLUMN route TEXT DEFAULT ''`, () => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// පවතින middleware එක වෙනුවට මෙය යොදන්න (uploadsDir භාවිතයෙන්):
app.use("/uploads", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}, express.static(uploadsDir, {
  maxAge: '7d',          // දින 7ක් Cache කරගනී
  etag: true,
  lastModified: true
}));

app.use(express.static(__dirname));

// Multer configuration
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

// Upload photo with metadata
app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { type, date, time, timestamp, location, route, device } = req.body;
  const filename = req.file.filename;
  const filepath = `/uploads/${filename}`;

  const sql = `INSERT INTO photos (filename, type, date, time, timestamp, location, route, device, filepath, original_filepath) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(sql, [filename, type, date, time, timestamp, location, route || '', device, filepath, filepath], function(err) {
    if (err) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    res.json({ 
      success: true, 
      message: 'Photo uploaded successfully',
      filepath: filepath,
      id: this.lastID
    });
  });
});

// Get all photos (optional date + route filter)
app.get('/api/photos', (req, res) => {
  const { date, route } = req.query;
  let sql = `SELECT * FROM photos WHERE 1=1`;
  const params = [];
  if (date)  { sql += ` AND date = ?`;                         params.push(date); }
  if (route) { sql += ` AND LOWER(route) LIKE ?`;              params.push('%' + route.toLowerCase() + '%'); }
  sql += ` ORDER BY date DESC, time DESC`;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Get photos by type
app.get('/api/photos/type/:type', (req, res) => {
  const { type } = req.params;
  const sql = `SELECT * FROM photos WHERE type = ? ORDER BY date DESC, time DESC`;
  db.all(sql, [type], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Get photos by date
app.get('/api/photos/date/:date', (req, res) => {
  const { date } = req.params;
  const sql = `SELECT * FROM photos WHERE date = ? ORDER BY time DESC`;
  db.all(sql, [date], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Get photos by date and type
app.get('/api/photos/:type/:date', (req, res) => {
  const { type, date } = req.params;
  const sql = `SELECT * FROM photos WHERE type = ? AND date = ? ORDER BY time DESC`;
  db.all(sql, [type, date], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Get stats
app.get('/api/stats', (req, res) => {
  const stats = {};
  
  db.get('SELECT COUNT(*) as total FROM photos', (err, row) => {
    stats.total = row?.total || 0;
    
    db.get("SELECT COUNT(*) as count FROM photos WHERE type = 'poster'", (err, row) => {
      stats.poster = row?.count || 0;
      
      db.get("SELECT COUNT(*) as count FROM photos WHERE type = 'self'", (err, row) => {
        stats.self = row?.count || 0;
        
        db.all("SELECT date, COUNT(*) as count FROM photos GROUP BY date ORDER BY date DESC", (err, rows) => {
          stats.byDate = rows || [];
          res.json(stats);
        });
      });
    });
  });
});

// Re-stamp: update metadata + replace file in-place
app.put("/api/restamp/:id", upload.single("photo"), (req, res) => {
  const { id } = req.params;
  const { type, date, time, timestamp, location, device } = req.body;
  db.get("SELECT filepath, original_filepath FROM photos WHERE id = ?", [id], (err, photo) => {
    if (err || !photo) return res.status(404).json({ error: "Photo not found" });
    const route = req.body.route || '';
    if (req.file) {
      // Delete previous STAMPED file only (not original)
      const oldPath = path.join("/data", photo.filepath);
      if (fs.existsSync(oldPath) && photo.filepath !== photo.original_filepath) fs.unlinkSync(oldPath);
      const newFilepath = "/uploads/" + req.file.filename;
      const origPath = photo.original_filepath || photo.filepath;
      db.run("UPDATE photos SET type=?,date=?,time=?,timestamp=?,location=?,route=?,device=?,filename=?,filepath=?,original_filepath=? WHERE id=?",
        [type, date, time, timestamp, location, route, device, req.file.filename, newFilepath, origPath, id],
        function(err){ if(err) return res.status(500).json({error:err.message}); res.json({success:true, id, filepath:newFilepath, original_filepath:origPath}); });
    } else {
      db.run("UPDATE photos SET type=?,date=?,time=?,timestamp=?,location=?,route=?,device=? WHERE id=?",
        [type, date, time, timestamp, location, route, device, id],
        function(err){ if(err) return res.status(500).json({error:err.message}); res.json({success:true, id, filepath:photo.filepath}); });
    }
  });
});

// Delete photo
app.delete('/api/photos/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT filepath FROM photos WHERE id = ?', [id], (err, photo) => {
    if (err || !photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    const filePath = path.join('/data', photo.filepath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    db.run('DELETE FROM photos WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: 'Photo deleted' });
    });
  });
});

// Delete photos by date
app.delete('/api/photos/delete/date/:date', (req, res) => {
  const { date } = req.params;
  
  db.all('SELECT id, filepath FROM photos WHERE date = ?', [date], (err, photos) => {
    if (err) return res.status(500).json({ error: err.message });
    
    photos.forEach(photo => {
      const filePath = path.join('/data', photo.filepath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      db.run('DELETE FROM photos WHERE id = ?', [photo.id]);
    });
    
    res.json({ success: true, deleted: photos.length });
  });
});

// Export database
app.get('/api/export', (req, res) => {
  db.all('SELECT * FROM photos', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="RoadCam_DB_${new Date().toISOString().split('T')[0]}.json"`);
    res.send(JSON.stringify(rows, null, 2));
  });
});

// Get all routes
app.get('/api/routes', (req, res) => {
  db.all('SELECT * FROM routes ORDER BY name ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Add route
app.post('/api/routes', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Route name required' });
  db.run('INSERT INTO routes (name) VALUES (?)', [name.trim().toUpperCase()], function(err) {
    if (err) return res.status(400).json({ error: 'Route already exists' });
    res.json({ success: true, id: this.lastID, name: name.trim().toUpperCase() });
  });
});

// Delete route
app.delete('/api/routes/:id', (req, res) => {
  db.run('DELETE FROM routes WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Bulk update route
app.patch('/api/photos/bulk/route', (req, res) => {
  const { ids, route } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ error: 'ids required' });
  const placeholders = ids.map(() => '?').join(',');
  db.run(`UPDATE photos SET route = ? WHERE id IN (${placeholders})`, [route || '', ...ids], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, updated: this.changes });
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// HTML routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'pro_road_cam_server_upload.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard.html`);
});

process.on('SIGINT', () => {
  db.close();
  console.log('Database connection closed');
  process.exit(0);
});
