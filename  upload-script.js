#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const PHOTO_TYPE = process.env.PHOTO_TYPE || 'poster'; // 'poster' or 'self'

// Helper function to upload photo
async function uploadPhoto(filePath, metadata, serverUrl) {
  return new Promise((resolve, reject) => {
    try {
      const fileContent = fs.readFileSync(filePath);
      const filename = path.basename(filePath);
      
      // Prepare form data
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substr(2, 9);
      let body = '';
      
      // Add metadata fields
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="type"\r\n\r\n`;
      body += `${metadata.type}\r\n`;
      
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="date"\r\n\r\n`;
      body += `${metadata.date}\r\n`;
      
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="time"\r\n\r\n`;
      body += `${metadata.time}\r\n`;
      
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="timestamp"\r\n\r\n`;
      body += `${metadata.timestamp}\r\n`;
      
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="location"\r\n\r\n`;
      body += `${metadata.location}\r\n`;
      
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="device"\r\n\r\n`;
      body += `${metadata.device}\r\n`;
      
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="photo"; filename="${filename}"\r\n`;
      body += `Content-Type: image/jpeg\r\n\r\n`;
      
      const bodyBuffer = Buffer.concat([
        Buffer.from(body),
        fileContent,
        Buffer.from(`\r\n--${boundary}--\r\n`)
      ]);
      
      const urlObj = new URL(serverUrl);
      const isHttps = urlObj.protocol === 'https:';
      const protocol = isHttps ? https : http;
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: '/api/upload',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': bodyBuffer.length
        }
      };
      
      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            resolve(response);
          } catch (e) {
            reject(new Error('Invalid response from server'));
          }
        });
      });
      
      req.on('error', reject);
      req.write(bodyBuffer);
      req.end();
      
    } catch (err) {
      reject(err);
    }
  });
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
📸 Pro Road Cam Upload Script

Usage:
  node upload-script.js <photo.jpg> [options]

Options:
  --type         Photo type: 'poster' or 'self' (default: poster)
  --location     Location/road name (default: Unknown)
  --device       Device name (default: Script Upload)
  --date         Date in YYYY-MM-DD format (default: today)
  --time         Time in HH:MM AM/PM format (default: current time)
  --server       Server URL (default: http://localhost:3000)

Examples:
  node upload-script.js photo.jpg --type poster --location "Main Street"
  node upload-script.js photo.jpg --type self --location "Downtown" --device "iPhone 14"
  node upload-script.js photo.jpg --server https://example.com

    `);
    process.exit(0);
  }
  
  const photoPath = args[0];
  
  if (!fs.existsSync(photoPath)) {
    console.error(`❌ File not found: ${photoPath}`);
    process.exit(1);
  }
  
  // Parse options
  let options = {
    type: 'poster',
    location: 'Unknown',
    device: 'Script Upload',
    server: SERVER_URL
  };
  
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    
    if (key === 'type') options.type = value;
    if (key === 'location') options.location = value;
    if (key === 'device') options.device = value;
    if (key === 'date') options.date = value;
    if (key === 'time') options.time = value;
    if (key === 'server') options.server = value;
  }
  
  // Set defaults for date and time
  const now = new Date();
  if (!options.date) {
    options.date = now.toISOString().split('T')[0];
  }
  if (!options.time) {
    options.time = now.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', hour12:true});
  }
  
  const metadata = {
    type: options.type,
    date: options.date,
    time: options.time,
    timestamp: now.toLocaleString(),
    location: options.location,
    device: options.device
  };
  
  console.log(`
🚀 Uploading photo...
📸 Type: ${metadata.type}
📍 Location: ${metadata.location}
🗓️  Date: ${metadata.date}
🕐 Time: ${metadata.time}
💻 Device: ${metadata.device}
🌐 Server: ${options.server}
  `);
  
  try {
    const response = await uploadPhoto(photoPath, metadata, options.server);
    
    if (response.success) {
      console.log(`✅ Upload successful!`);
      console.log(`📥 File: ${response.filepath}`);
      console.log(`🔗 View dashboard: ${options.server}/dashboard.html`);
    } else {
      console.error(`❌ Upload failed: ${response.error}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
