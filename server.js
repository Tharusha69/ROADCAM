const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// /data folder setup
const uploadsDir = path.join('/data', 'uploads');
if (!fs.existsSync('/data')) fs.mkdirSync('/data', { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const db = new sqlite3.Database('/data/roadcam.db');

// Create SQLite Table
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
      device TEXT NOT NULL,
      filepath TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use("/uploads", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}, express.static(uploadsDir));

app.use(express.static(__dirname));

// Multer Disk Storage Configuration
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

// Upload Photo with Metadata
app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { type, date, time, timestamp, location, device } = req.body;
  const filename = req.file.filename;
  const filepath = `/uploads/${filename}`;

  const sql = `INSERT INTO photos (filename, type, date, time, timestamp, location, device, filepath) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(sql, [filename, type, date, time, timestamp, location, device, filepath], function(err) {
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

// Get all photos
app.get('/api/photos', (req, res) => {
  const sql = `SELECT * FROM photos ORDER BY id DESC`;
  db.all(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Re-stamp: update metadata + replace file in-place
app.put("/api/restamp/:id", upload.single("photo"), (req, res) => {
  const { id } = req.params;
  const { type, date, time, timestamp, location, device } = req.body;

  db.get("SELECT filepath FROM photos WHERE id = ?", [id], (err, photo) => {
    if (err || !photo) return res.status(404).json({ error: "Photo not found" });

    if (req.file) {
      const oldPath = path.join("/data", photo.filepath);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      const newFilepath = "/uploads/" + req.file.filename;

      db.run(
        "UPDATE photos SET type=?, date=?, time=?, timestamp=?, location=?, device=?, filename=?, filepath=? WHERE id=?",
        [type, date, time, timestamp, location, device, req.file.filename, newFilepath, id],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true, id, filepath: newFilepath });
        }
      );
    } else {
      db.run(
        "UPDATE photos SET type=?, date=?, time=?, timestamp=?, location=?, device=? WHERE id=?",
        [type, date, time, timestamp, location, device, id],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true, id, filepath: photo.filepath });
        }
      );
    }
  });
});

// Delete Single Photo
app.delete('/api/photos/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT filepath FROM photos WHERE id = ?', [id], (err, photo) => {
    if (err || !photo) return res.status(404).json({ error: 'Photo not found' });

    const filePath = path.join('/data', photo.filepath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

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
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      db.run('DELETE FROM photos WHERE id = ?', [photo.id]);
    });

    res.json({ success: true, deleted: photos.length });
  });
});

// Export Database
app.get('/api/export', (req, res) => {
  db.all('SELECT * FROM photos', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="RoadCam_DB_${new Date().toISOString().split('T')[0]}.json"`);
    res.send(JSON.stringify(rows, null, 2));
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// HTML Page Route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'pro_road_cam_server_upload.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
