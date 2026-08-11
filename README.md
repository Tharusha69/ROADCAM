# 📸 Pro Road Cam v7.0 - Server Edition

Complete photo management system that allows uploading and viewing road camera photos from **any phone** on your network.

---

## 🎯 Features

✅ **Upload Photos** - From phone app or command line  
✅ **View Anywhere** - Dashboard works on any device/phone  
✅ **Filter & Search** - By type (Self/Poster), date, location  
✅ **Database** - SQLite for permanent storage  
✅ **Export/Import** - Backup and restore photos  
✅ **Server-based** - Photos accessible from any network device  

---

## 📦 Files Included

```
server.js                           - Backend API server
package.json                        - Node.js dependencies
dashboard.html                      - Web dashboard (view photos)
pro_road_cam_server_upload.html    - App with server upload
upload-script.js                    - Command line uploader
SETUP.md                            - Detailed setup guide
README.md                           - This file
```

---

## 🚀 Quick Start (5 Minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Server
```bash
npm start
```

Output:
```
✅ Connected to SQLite database
🚀 Server running on http://localhost:3000
📊 Dashboard: http://localhost:3000/dashboard.html
```

### 3. Access Dashboard

**Desktop:** `http://localhost:3000/dashboard.html`

**Phone:** Find your computer's IP address (e.g., `192.168.1.100`)  
Then visit: `http://192.168.1.100:3000/dashboard.html`

---

## 📱 Upload Photos - Choose Your Method

### Method 1: Pro Road Cam App (Best)
1. Open `pro_road_cam_server_upload.html` in browser
2. Capture photo (or upload existing)
3. In Settings → Enable "Upload to Server"
4. Set Server URL (e.g., `http://192.168.1.100:3000`)
5. Preview → Click "Upload" button
6. Photo appears in dashboard instantly!

### Method 2: Command Line
```bash
# Single photo
node upload-script.js photo.jpg --type poster --location "Main Street"

# Batch upload
node upload-script.js photo1.jpg --type poster --location "Street 1"
node upload-script.js photo2.jpg --type self --location "Street 2"
```

### Method 3: Bulk API
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "photo=@photo.jpg" \
  -F "type=poster" \
  -F "date=2024-01-15" \
  -F "time=02:30 PM" \
  -F "timestamp=2024-01-15 14:30:00" \
  -F "location=Main Street" \
  -F "device=iPhone 14"
```

---

## 💾 Dashboard Features

### View Photos
- **Grid View** - Thumbnail gallery
- **List View** - Detailed list with metadata
- Click photo → View full size with all details

### Filter Photos
- By **Type**: All, Poster 📸, Self 🤳
- By **Date**: Pick any date
- **Combined filters** work together

### Manage Photos
- 🗑 **Delete** - Individual photo (click thumbnail)
- 🗑 **Delete by Date** - Remove all from specific date
- 📥 **Export** - Download database as JSON
- 📤 **Import** - Restore from JSON backup
- 🔄 **Refresh** - Update view (auto-refreshes every 30s)

### Statistics
- Total photos count
- Poster photos count
- Self photos count
- Photos per date breakdown

---

## 🌐 Network Access

### Find Your Computer's IP

**Windows:**
```bash
ipconfig
# Look for: IPv4 Address
# Example: 192.168.1.100
```

**Mac/Linux:**
```bash
ifconfig
# Look for: inet
# Example: 192.168.1.100
```

### Access from Phone

1. Connect phone to same WiFi
2. Open browser → `http://192.168.1.100:3000/dashboard.html`
3. See all uploaded photos in real-time!

---

## 📊 Database Structure

Photos are stored in **SQLite** with:

| Field | Type | Example |
|-------|------|---------|
| id | Integer | 123 |
| type | Text | poster / self |
| date | Date | 2024-01-15 |
| time | Time | 02:30 PM |
| location | Text | Main Street |
| device | Text | iPhone 14 |
| created_at | DateTime | 2024-01-15 14:30:00 |

---

## 🔧 API Endpoints

```
GET  /api/photos                    # All photos
GET  /api/photos/type/poster        # By type
GET  /api/photos/date/2024-01-15    # By date
GET  /api/stats                     # Statistics
POST /api/upload                    # Upload photo
DELETE /api/photos/123              # Delete photo
DELETE /api/photos/delete/date/...  # Delete by date
GET  /api/export                    # Export database
GET  /api/health                    # Server status
```

---

## 🎯 Workflow Example

```bash
# 1. Terminal 1: Start server
npm start

# 2. Terminal 2 (or another): Upload photos
node upload-script.js photo1.jpg --type poster --location "Street 1"
node upload-script.js photo2.jpg --type self --location "Street 2"
node upload-script.js photo3.jpg --type poster --location "Street 1"

# 3. Phone: Open dashboard
# http://192.168.1.100:3000/dashboard.html

# 4. See all 3 photos!
# Filter by location: "Street 1" → See 2 photos
# Filter by type: Self → See 1 photo
# Filter by date: 2024-01-15 → See all 3 photos
```

---

## 🔒 Important Notes

This is for **local trusted networks only**.

### For Public/Internet Access Add:
- HTTPS/SSL certificates
- Authentication (username/password)
- Rate limiting
- API key validation
- Input sanitization

---

## 📱 Mobile Optimization

Dashboard is fully responsive:
- **Desktop**: Multi-column grid
- **Tablet**: 2-column layout  
- **Phone**: Single column, touch-friendly

---

## 🚨 Troubleshooting

### "Cannot find module"
```bash
npm install
```

### Port 3000 in use?
Change in `server.js`:
```javascript
const PORT = 3001; // Use different port
```

### Can't connect from phone?
1. Check WiFi connection (same network)
2. Get computer IP: `ipconfig` (Windows) / `ifconfig` (Mac)
3. Allow firewall: Port 3000
4. Test: `ping <computer-ip>` from phone

### Detailed Setup Help
See `SETUP.md` for comprehensive guide

---

## 📞 Quick Reference

| Task | Command |
|------|---------|
| Start server | `npm start` |
| Upload 1 photo | `node upload-script.js photo.jpg` |
| Upload with details | `node upload-script.js photo.jpg --type poster --location "Main St"` |
| View stats | `curl http://localhost:3000/api/stats` |
| Export database | Visit dashboard → 📥 Export |
| Reset database | Delete `roadcam.db`, restart server |

---

## 🎓 Next Steps

1. **Start Server** → `npm start`
2. **Open Dashboard** → `http://localhost:3000/dashboard.html`
3. **Upload Photos** → Use app or CLI
4. **View Results** → Dashboard auto-refreshes every 30 seconds
5. **Share Dashboard Link** → Give phone IP to friends!

---

## 📖 Full Documentation

For detailed setup, API docs, and troubleshooting: See `SETUP.md`

---

**Happy road camera capturing!** 🚗📸

Questions? Check SETUP.md for comprehensive guide!
