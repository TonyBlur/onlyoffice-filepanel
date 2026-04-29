const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const mime = require('mime');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const multer = require('multer');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const JWT_SECRET = process.env.DOC_SERVER_JWT_SECRET || 'your-secret-key';
const COOKIE_NAME = 'auth_token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const app = express();
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(cookieParser());

// simple base64 upload (no extra deps)

// store files under the app folder so docker-compose volume ./data/files maps to it
const FILE_DIR = path.join(__dirname, 'server', 'data', 'files');
const META_DIR = path.join(__dirname, 'server', 'data');
const NAME_VERSIONS_FILE = path.join(META_DIR, 'nameVersions.json');
const KEYMAP_FILE = path.join(META_DIR, 'keymap.json');
const DOC_SERVER_URL = process.env.DOC_SERVER_URL || 'http://localhost:80';
const DOC_SERVER_JWT_SECRET = process.env.DOC_SERVER_JWT_SECRET || 'hUQTo541dF2UjKzO56Ux9jHOD62csevJ';
// Use a single environment variable DOC_SERVER_INTERNAL_HOST to specify an address
// that Document Server should use to reach this backend (e.g. "http://192.168.23.100:4000" or "http://backend:4000").
// If not set, backend will use the external host as seen by the browser.
const DOC_SERVER_INTERNAL_HOST = process.env.DOC_SERVER_INTERNAL_HOST || null;
// Ensure file directory exists at startup
try {
  fs.mkdirSync(FILE_DIR, { recursive: true });
} catch (e) {
  console.error('Failed to create file directory:', e.message);
}

// --- helper functions for simple JSON metadata persistence ---
function loadJsonSafe(fp) {
  try {
    if (fs.existsSync(fp)) {
      return JSON.parse(fs.readFileSync(fp, 'utf8') || '{}');
    }
  } catch (e) {
    console.warn('Failed to load JSON', fp, e.message);
  }
  return {};
}

function saveJsonSafe(fp, obj) {
  try {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(obj || {}, null, 2));
  } catch (e) {
    console.warn('Failed to save JSON', fp, e.message);
  }
}

// Generate a unique filename by appending (1), (2), etc. if file exists
function getUniqueFilename(dir, baseName) {
  const ext = path.extname(baseName);
  const nameWithoutExt = path.basename(baseName, ext);
  let candidate = baseName;
  let counter = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${nameWithoutExt} (${counter})${ext}`;
    counter++;
    if (counter > 999) break; // safety limit
  }
  return candidate;
}

// Ensure meta files exist
try { saveJsonSafe(KEYMAP_FILE, loadJsonSafe(KEYMAP_FILE)); } catch (e) {}
try { saveJsonSafe(NAME_VERSIONS_FILE, loadJsonSafe(NAME_VERSIONS_FILE)); } catch (e) {}

// --- cleanup zero-byte files at startup to avoid invalid files lingering ---
// --- cleanup zero-byte files at startup to avoid invalid files lingering ---
// try {
//   const startupFiles = fs.readdirSync(FILE_DIR || '.');
//   startupFiles.forEach(f => {
//     const p = path.join(FILE_DIR, f);
//     try {
//       const st = fs.statSync(p);
//       if (st && st.size === 0) {
//         fs.unlinkSync(p);
//         console.warn('Removed zero-size file at startup:', p);
//       }
//     } catch (e) {
//       // ignore
//     }
//   });
// } catch (e) {
//   // ignore
// }

// Configure multer for multipart/form-data uploads (standard full-file upload)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, FILE_DIR);
  },
  filename: function (req, file, cb) {
    // sanitize filename
    const safeName = path.basename(file.originalname);
    cb(null, safeName);
  }
});
const upload = multer({ storage });

// Multer memory storage for chunked uploads (we will append buffers)
const uploadMemory = multer({ storage: multer.memoryStorage() });

// Middleware to check auth from cookie
const checkAuth = (req, res, next) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) {
    req.user = { role: 'guest' };
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  } catch (e) {
    req.user = { role: 'guest' };
  }
  next();
};

app.get('/api/files', checkAuth, (req, res) => {
  // Supports pagination: ?page=1&perPage=10
  // Returns { items: [...], total, page, perPage, totalPages }
  try {
    const rawFiles = fs.readdirSync(FILE_DIR || '.');
    const items = rawFiles.map(f => {
      const p = path.join(FILE_DIR, f);
      let stat = null;
      try { stat = fs.statSync(p); } catch (e) { stat = null }
      return {
        name: f,
        url: `/files/${encodeURIComponent(f)}`,
        mtime: stat ? stat.mtime.toISOString() : null,
        mtimeMs: stat ? stat.mtimeMs : 0,
        size: stat ? stat.size : 0
      };
    });

    // sort
    const sortBy = req.query.sortBy || 'mtime';
    const sortOrder = req.query.sortOrder || 'desc';
    items.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'size') cmp = a.size - b.size;
      else cmp = (a.mtimeMs || 0) - (b.mtimeMs || 0);
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    // search filter
    const searchQuery = req.query.search || '';
    let filteredItems = items;
    if (searchQuery) {
      const lowerSearch = searchQuery.toLowerCase();
      filteredItems = items.filter(f => f.name.toLowerCase().includes(lowerSearch));
    }

    const role = (req.query.role || 'guest');
    // parse pagination params
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const defaultPerPage = role === 'admin' ? 20 : 5;
    const perPage = Math.max(1, parseInt(req.query.perPage, 10) || defaultPerPage);

    const total = filteredItems.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));

    const start = (page - 1) * perPage;
    const paged = filteredItems.slice(start, start + perPage);

    return res.json({
      items: paged,
      total,
      page,
      perPage,
      totalPages
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get('/files/:name', (req, res) => {
  const name = req.params.name;
  const filePath = path.join(FILE_DIR, name);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  const asDownload = req.query.download === '1';
  
  // Handle files without extensions
  let contentType = mime.getType(filePath) || 'application/octet-stream';
  if (!path.extname(name) && name.includes('document')) {
    contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  // Add strong no-cache headers and ETag to avoid caches serving stale content
  try {
    const st = fs.statSync(filePath);
    const etag = `${st.size}-${st.mtimeMs}`;
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', new Date(st.mtimeMs).toUTCString());
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // If client has matching ETag, respond 304 Not Modified
    const inm = req.headers['if-none-match'];
    if (inm && inm === etag) {
      return res.status(304).end();
    }
  } catch (e) {
    // ignore stat failures
  }
  
  if (asDownload) {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${name}.docx"`);
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.setHeader('Content-Type', contentType);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Rename file
app.put('/api/files/:name/rename', (req, res) => {
  try {
    const name = req.params.name;
    const { newName } = req.body || {};
    if (!newName) return res.status(400).json({ error: 'missing newName' });

    const oldPath = path.join(FILE_DIR, name);
    if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'not found' });

    const safeNewName = path.basename(newName);
    const newPath = path.join(FILE_DIR, safeNewName);
    if (fs.existsSync(newPath)) return res.status(409).json({ error: 'target exists' });

    fs.renameSync(oldPath, newPath);

    // Update keymap references
    try {
      const keyMapFile = path.join(__dirname, 'data', 'keymap.json');
      if (fs.existsSync(keyMapFile)) {
        let map = {};
        try { map = JSON.parse(fs.readFileSync(keyMapFile, 'utf8') || '{}'); } catch (e) { map = {}; }
        let changed = false;
        for (const k of Object.keys(map)) {
          if (map[k] === name) {
            map[k] = safeNewName;
            changed = true;
          }
        }
        if (changed) fs.writeFileSync(keyMapFile, JSON.stringify(map, null, 2));
      }
    } catch (e) {
      console.warn('Failed to update keymap after rename:', e.message);
    }

    res.json({ ok: true, name: safeNewName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Duplicate file
app.post('/api/files/:name/duplicate', (req, res) => {
  try {
    const name = req.params.name;
    const srcPath = path.join(FILE_DIR, name);
    if (!fs.existsSync(srcPath)) return res.status(404).json({ error: 'not found' });

    const ext = path.extname(name);
    const baseName = path.basename(name, ext);
    const dupName = getUniqueFilename(FILE_DIR, `${baseName} (copy)${ext}`);
    const destPath = path.join(FILE_DIR, dupName);

    fs.copyFileSync(srcPath, destPath);

    // Copy keymap entry if exists
    try {
      const keyMapFile = path.join(__dirname, 'data', 'keymap.json');
      if (fs.existsSync(keyMapFile)) {
        let map = loadJsonSafe(keyMapFile);
        let changed = false;
        for (const k of Object.keys(map)) {
          if (map[k] === name) {
            // Generate new key for duplicated file
            const newKey = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            map[newKey] = dupName;
            changed = true;
          }
        }
        if (changed) saveJsonSafe(keyMapFile, map);
      }
    } catch (e) {
      console.warn('Failed to copy keymap after duplicate:', e.message);
    }

    res.json({ ok: true, name: dupName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Download file
app.get('/api/files/:name/download', (req, res) => {
  try {
    const name = req.params.name;
    const filePath = path.join(FILE_DIR, name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' });

    const mimeType = mime.getType(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete file (basic)
app.delete('/api/files/:name', (req, res) => {
  const name = req.params.name;
  const filePath = path.join(FILE_DIR, name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' });
  try {
    fs.unlinkSync(filePath);

    // Also remove any keymap entries referencing this filename and delete files saved by document server under the key
    try {
      const keyMapFile = path.join(__dirname, 'data', 'keymap.json');
      if (fs.existsSync(keyMapFile)) {
        let map = {};
        try { map = JSON.parse(fs.readFileSync(keyMapFile, 'utf8') || '{}'); } catch (e) { map = {}; }
        let changed = false;
        for (const k of Object.keys(map)) {
          if (map[k] === name) {
            // remove mapping
            delete map[k];
            changed = true;
            // attempt to delete potential saved files under the key
            const candidates = [
              path.join(FILE_DIR, k),
              path.join(FILE_DIR, `${k}.docx`),
              path.join(FILE_DIR, `${k}.pdf`),
              path.join(FILE_DIR, `${k}.pptx`),
              path.join(FILE_DIR, `${k}.xlsx`)
            ];
            candidates.forEach(p => {
              try {
                if (fs.existsSync(p)) {
                  fs.unlinkSync(p);
                  console.log('Removed associated key-file:', p);
                }
              } catch (e) {
                console.warn('Failed to remove associated key-file', p, e.message);
              }
            });
          }
        }
        if (changed) {
          try { fs.writeFileSync(keyMapFile, JSON.stringify(map, null, 2)); } catch (e) { console.warn('Failed to persist keymap after delete:', e.message); }
        }
      }

      // increment version for this filename so future document.key will differ
      try {
        const versions = loadJsonSafe(NAME_VERSIONS_FILE);
        versions[name] = (versions[name] || 0) + 1;
        saveJsonSafe(NAME_VERSIONS_FILE, versions);
        console.log('Incremented name version for deleted file', name, versions[name]);
      } catch (e) {
        console.warn('Failed to increment name version on delete:', e.message);
      }
    } catch (e) {
      console.warn('Failed to cleanup keymap for deleted file:', e.message);
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload endpoint (base64 JSON)
app.post('/api/upload-base64', (req, res) => {
  const { filename, data } = req.body || {};
  // allow empty data (''), but reject missing filename or missing data field
  if (!filename) return res.status(400).json({ error: 'missing filename' });
  if (typeof data === 'undefined' || data === null) return res.status(400).json({ error: 'missing data' });
  const buf = Buffer.from(data || '', 'base64');
  const targetPath = path.join(FILE_DIR, filename);
  // ensure directory exists
  try {
    fs.mkdirSync(FILE_DIR, { recursive: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  fs.writeFile(targetPath, buf, err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, name: filename });
  });
});

// Multipart/form-data upload endpoint compatible with Antd Upload
app.post('/api/files/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
    // file saved by multer to FILE_DIR
    const savedName = req.file.filename;
    return res.json({ ok: true, name: savedName });
  } catch (e) {
    console.error('Upload error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// Chunked upload endpoint: accepts a single chunk (multipart form field 'chunk')
// Expects form fields: filename, index (0-based), totalChunks
app.post('/api/files/upload-chunk', uploadMemory.single('chunk'), (req, res) => {
  try {
    const { filename, index, totalChunks } = req.body || {};
    if (!filename) return res.status(400).json({ error: 'missing filename' });
    if (typeof index === 'undefined') return res.status(400).json({ error: 'missing index' });
    const idx = parseInt(index, 10);
    const total = totalChunks ? parseInt(totalChunks, 10) : null;

    let safeName = path.basename(filename);
    let destPath = path.join(FILE_DIR, safeName);

    // ensure directory exists
    try { fs.mkdirSync(FILE_DIR, { recursive: true }); } catch (e) {}

    // If this is the first chunk (index === 0) and file exists, auto-rename
    if (idx === 0) {
      if (fs.existsSync(destPath)) {
        safeName = getUniqueFilename(FILE_DIR, safeName);
        destPath = path.join(FILE_DIR, safeName);
        console.log('Upload file exists, auto-renamed:', filename, '->', safeName);
      }
      try { fs.writeFileSync(destPath, Buffer.alloc(0)); } catch (e) { /* ignore */ }
    }

    if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'missing chunk' });

    // Append the chunk buffer to the destination file
    try {
      fs.appendFileSync(destPath, req.file.buffer);
    } catch (e) {
      console.error('Failed to append chunk:', e.message);
      return res.status(500).json({ error: e.message });
    }

    // If client provided total and this is the last chunk, return completed response
    if (total !== null && idx === total - 1) {
      return res.json({ ok: true, name: safeName, completed: true });
    }

    // Otherwise acknowledge receipt of chunk
    return res.json({ ok: true, name: safeName, index: idx });
  } catch (e) {
    console.error('Chunk upload error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// Cancel a chunked upload and remove partial file
app.post('/api/files/upload-chunk/cancel', (req, res) => {
  try {
    const filename = req.body && req.body.filename || req.query && req.query.filename;
    if (!filename) return res.status(400).json({ error: 'missing filename' });
    const safeName = path.basename(filename);
    const destPath = path.join(FILE_DIR, safeName);
    if (fs.existsSync(destPath)) {
      try { fs.unlinkSync(destPath); } catch (e) { console.warn('Failed to remove partial file:', e.message); }
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// OnlyOffice webhook (save) placeholder
app.post('/onlyoffice/webhook', (req, res) => {
  try {
    const { key, status, url } = req.body || {};
    
    console.log('Received webhook:', { key, status, url });
    
    if (status === 2 && url) {
      // Document Server has saved the document, download and save it
      const fileNameFromKeymap = (function() {
        try {
          const keyMapFile = path.join(__dirname, 'data', 'keymap.json');
          if (fs.existsSync(keyMapFile)) {
            const map = JSON.parse(fs.readFileSync(keyMapFile, 'utf8') || '{}');
            if (map && map[key]) return map[key];
          }
        } catch (e) {
          console.warn('Failed to read keymap.json:', e.message);
        }
        return null;
      })();

      const fileName = fileNameFromKeymap ? fileNameFromKeymap : (key ? `${key}.docx` : `document_${Date.now()}.docx`);
      const filePath = path.join(FILE_DIR, fileName);

      console.log(`Downloading saved document from ${url} to ${filePath}`);
      
      // Check if URL is local file (starts with file:// or /)
      if (url.startsWith('file://') || url.startsWith('/')) {
        // Handle local file
        const localPath = url.startsWith('file://') ? url.substring(7) : url;
        console.log(`Reading local file from ${localPath}`);
        
        try {
          const fileData = fs.readFileSync(localPath);
          fs.writeFileSync(filePath, fileData);
          console.log(`Document saved successfully to ${filePath}`);
          
          // increment name version so future downloads use new v param
          try {
            const versions = loadJsonSafe(NAME_VERSIONS_FILE);
            versions[fileName] = (versions[fileName] || 0) + 1;
            saveJsonSafe(NAME_VERSIONS_FILE, versions);
            console.log('Incremented name version after webhook save (local):', fileName, versions[fileName]);
          } catch (e) { console.warn('Failed to increment name version after local save:', e.message); }

          res.json({
            error: 0,
            message: 'Document saved successfully'
          });
        } catch (fileError) {
          console.error('Error reading local file:', fileError.message);
          res.status(500).json({
            error: 1,
            message: `Failed to read local file: ${fileError.message}`
          });
        }
      } else {
        // Download the file from URL
        console.log(`Downloading from URL: ${url}`);
        
        // Add timeout and retry logic
        const axiosConfig = {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        };
        
        axios.get(url, axiosConfig)
          .then(response => {
            // Save the file
            fs.writeFileSync(filePath, response.data);
            console.log(`Document saved successfully to ${filePath}, size: ${response.data.length} bytes`);

            // increment name version so future downloads use new v param
            try {
              const versions = loadJsonSafe(NAME_VERSIONS_FILE);
              versions[fileName] = (versions[fileName] || 0) + 1;
              saveJsonSafe(NAME_VERSIONS_FILE, versions);
              console.log('Incremented name version after webhook save:', fileName, versions[fileName]);
            } catch (e) { console.warn('Failed to increment name version after save:', e.message); }

            // Send success response
            res.json({
              error: 0,
              message: 'Document saved successfully'
            });
          })
          .catch(error => {
            console.error('Error downloading document:', error.message);
            console.error('Error response:', error.response ? error.response.status : 'No response');
            res.status(500).json({
              error: 1,
              message: `Failed to download document: ${error.message}`
            });
          });
      }
    } else {
      // Document not saved yet or invalid status
      console.log(`Document not ready for save. Status: ${status}`);
      res.json({
        error: 0,
        message: 'Document not ready for save'
      });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      error: 1,
      message: 'Internal server error'
    });
  }
});

// Admin login endpoint with JWT cookie
// POST /api/login { password }
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (!password) return res.status(400).json({ error: 'missing password' });
  if (password === adminPass) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie(COOKIE_NAME, token, {
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'invalid' });
});

// Logout endpoint - clear auth cookie
app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

// Verify auth status
app.get('/api/auth', (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.json({ authenticated: false });
  
  try {
    jwt.verify(token, JWT_SECRET);
    res.json({ authenticated: true, role: 'admin' });
  } catch (e) {
    res.clearCookie(COOKIE_NAME);
    res.json({ authenticated: false });
  }
});

// Helper to build editor config for a given file name
function buildEditorConfig(name, mode, externalHost) {
  const fileUrl = `${externalHost}/files/${encodeURIComponent(name)}`;
  const docServer = DOC_SERVER_URL;

  // Compute internal host/urls for Document Server to download/save files
  let downloadUrl = fileUrl;
  let callbackUrl = `${externalHost}/onlyoffice/webhook`;
  let browserUrl = externalHost;

  if (DOC_SERVER_INTERNAL_HOST) {
    const hostWithProto = DOC_SERVER_INTERNAL_HOST.startsWith('http') ? DOC_SERVER_INTERNAL_HOST : `http://${DOC_SERVER_INTERNAL_HOST}`;
    const hostNoSlash = hostWithProto.replace(/\/$/, '');
    downloadUrl = `${hostNoSlash}/files/${encodeURIComponent(name)}`;
    callbackUrl = `${hostNoSlash}/onlyoffice/webhook`;
  } else {
    downloadUrl = fileUrl;
    callbackUrl = `${externalHost}/onlyoffice/webhook`;
  }

  // Append version query param from nameVersions to force fresh fetch when file changed
  try {
    const nameVersions = loadJsonSafe(NAME_VERSIONS_FILE) || {};
    const ver = nameVersions[name] || 0;
    const sep = downloadUrl.includes('?') ? '&' : '?';
    downloadUrl = `${downloadUrl}${sep}v=${ver}`;
  } catch (e) {
    console.warn('Failed to append version to downloadUrl:', e.message);
  }

  // Determine documentType from the file extension
  let docType = 'word';
  try {
    const ext = path.extname(name || '').toLowerCase();
    if (ext === '.ppt' || ext === '.pptx' || ext === '.odp') docType = 'slide';
    else if (ext === '.xls' || ext === '.xlsx' || ext === '.ods' || ext === '.csv') docType = 'cell';
    else if (ext === '.pdf') docType = 'word';
    else if (ext === '.doc' || ext === '.docx' || ext === '.odt' || ext === '.rtf') docType = 'word';
    else if (!ext) {
      const mt = mime.getType(name) || '';
      if (mt.includes('sheet') || mt.includes('spreadsheet')) docType = 'cell';
      else if (mt.includes('presentation')) docType = 'slide';
      else if (mt.includes('word') || mt.includes('pdf') || mt.includes('text')) docType = 'word';
    }
  } catch (e) {
    console.warn('Failed to determine documentType, using default word:', e.message);
  }

  const editorMode = mode === 'view' ? 'view' : 'edit';
  const configObj = {
    documentType: docType,
    document: {
      title: name,
      url: downloadUrl,
      key: ''
    },
    editorConfig: {
      callbackUrl: callbackUrl,
      mode: editorMode
    }
  };

  // Generate document key
  try {
    let nameVersions = {};
    try { nameVersions = loadJsonSafe(NAME_VERSIONS_FILE); } catch (e) { nameVersions = {}; }
    const ver = nameVersions[name] || 0;
    const fileUrlForKey = `${fileUrl}?v=${ver}`;
    const documentKey = crypto.createHash('sha256').update(fileUrlForKey).digest('hex');
    configObj.document.key = documentKey;

    // Persist key mapping
    try {
      const keyMapDir = path.join(__dirname, 'server', 'data');
      const keyMapFile = path.join(keyMapDir, 'keymap.json');
      fs.mkdirSync(keyMapDir, { recursive: true });
      let map = {};
      if (fs.existsSync(keyMapFile)) {
        try { map = JSON.parse(fs.readFileSync(keyMapFile, 'utf8') || '{}'); } catch (e) { map = {}; }
      }
      map[documentKey] = name;
      try { map[`_${documentKey}_v`] = ver; } catch (e) {}
      fs.writeFileSync(keyMapFile, JSON.stringify(map, null, 2));
    } catch (e) {
      console.warn('Failed to persist document key mapping:', e.message);
    }
  } catch (e) {
    console.error('failed to generate document key', e.message);
  }

  // Set document.fileType
  try {
    const ext = path.extname(name || '').toLowerCase();
    let fileType = '';
    if (ext) fileType = ext.startsWith('.') ? ext.substring(1) : ext;
    else {
      const mt = mime.getType(name) || '';
      if (mt.includes('presentation')) fileType = 'pptx';
      else if (mt.includes('spreadsheet')) fileType = 'xlsx';
      else if (mt.includes('word')) fileType = 'docx';
    }
    if (fileType) configObj.document.fileType = fileType;
  } catch (e) {
    console.warn('Failed to set document.fileType:', e.message);
  }

  let token = '';
  if (DOC_SERVER_JWT_SECRET) {
    try {
      const jwtPayload = {
        user: { id: 'admin', name: 'Administrator', roles: ['admin'] },
        document: {
          key: configObj.document.key,
          url: configObj.document.url,
          title: configObj.document.title || name,
          fileType: configObj.document.fileType || undefined,
          permissions: {
            comment: true, copy: true, download: true, edit: true,
            fillForms: true, modifyContentControl: true, modifyFilter: true,
            print: true, review: true
          }
        },
        editorConfig: { callbackUrl: callbackUrl, mode: editorMode }
      };
      try {
        configObj.document.permissions = jwtPayload.document.permissions;
      } catch (e) {}
      token = jwt.sign(jwtPayload, DOC_SERVER_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
      if (token) {
        token = String(token).replace(/\s+/g, '');
        configObj.token = token;
      }
    } catch (e) {
      console.error('failed to sign doc server token', e.message);
    }
  }

  return {
    configObj,
    docApiUrl: `${docServer}/web-apps/apps/api/documents/api.js`,
    token,
    browserUrl,
    callbackUrl
  };
}

// API endpoint for frontend EditorPage to fetch editor config as JSON
app.get('/api/editor-config/:name', (req, res) => {
  const name = req.params.name;
  const externalHost = `${req.protocol}://${req.get('host')}`;
  const mode = req.query.mode;
  const result = buildEditorConfig(name, mode, externalHost);
  res.json({
    docConfig: result.configObj,
    docApiUrl: result.docApiUrl,
    token: result.token,
    browserUrl: result.browserUrl,
    callbackUrl: result.callbackUrl
  });
});

// Create new file endpoint
app.post('/api/files/create', async (req, res) => {
  try {
    const { name, format } = req.body || {};
    if (!name) return res.status(400).json({ error: 'missing name' });

    // normalize filename
    const safeName = path.basename(name);
    const ext = path.extname(safeName) || (format ? `.${format.replace(/^[.]/, '')}` : '.docx');
    const finalName = safeName.toLowerCase().endsWith(ext.toLowerCase()) ? safeName : `${safeName}${ext}`;

    // ensure directory exists
    fs.mkdirSync(FILE_DIR, { recursive: true });

    let filePath = path.join(FILE_DIR, finalName);

    // If file exists, auto-rename with (1), (2), etc.
    if (fs.existsSync(filePath)) {
      const uniqueName = getUniqueFilename(FILE_DIR, finalName);
      filePath = path.join(FILE_DIR, uniqueName);
      console.log('File exists, auto-renamed:', finalName, '->', uniqueName);
    }

    // Try to create file from local template files located in backend/templates/
    const templatesDir = path.join(__dirname, 'server', 'templates');
    const templateFile = path.join(templatesDir, `blank${ext}`);

    // Remove any stale keymap entries that reference this filename so recreated files
    // do not pick up older saved content from Document Server keyed files.
    try {
      const keyMapFile = path.join(__dirname, 'data', 'keymap.json');
      if (fs.existsSync(keyMapFile)) {
        let map = {};
        try { map = JSON.parse(fs.readFileSync(keyMapFile, 'utf8') || '{}'); } catch (e) { map = {}; }
        let changed = false;
        for (const k of Object.keys(map)) {
          if (map[k] === finalName) {
            delete map[k];
            changed = true;
            // also remove any files saved under the key
            const candidates = [
              path.join(FILE_DIR, k),
              path.join(FILE_DIR, `${k}.docx`),
              path.join(FILE_DIR, `${k}.pdf`),
              path.join(FILE_DIR, `${k}.pptx`),
              path.join(FILE_DIR, `${k}.xlsx`)
            ];
            candidates.forEach(p => {
              try { if (fs.existsSync(p)) { fs.unlinkSync(p); console.log('Removed stale key-file during create cleanup:', p); } } catch (e) { /* ignore */ }
            });
          }
        }
        if (changed) fs.writeFileSync(keyMapFile, JSON.stringify(map, null, 2));
      }
    } catch (e) {
      console.warn('Failed to clean keymap during create:', e.message);
    }

    try {
      if (fs.existsSync(templateFile)) {
        try {
          const st = fs.statSync(templateFile);
          console.log('Template file exists at', templateFile, 'size', st.size);

          // Directly copy template to destination without validating header/magic bytes
          try {
            fs.copyFileSync(templateFile, filePath);
            console.log('Copied template to', filePath);
            return res.json({ ok: true, name: finalName });
          } catch (e) {
            console.warn('Failed to copy template file:', e.message);
          }
        } catch (e) {
          console.warn('Failed to inspect template file:', e.message);
        }
      } else {
        console.log('No local template file found at', templateFile);
      }

      // If requested ext is PDF, generate a minimal valid PDF (blank)
      if (ext.toLowerCase() === '.pdf') {
        const pdfMinimal = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 24 Tf 72 100 Td (Blank PDF) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000120 00000 n \n0000000200 00000 n \ntrailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n300\n%%EOF');
        fs.writeFileSync(filePath, pdfMinimal);
        return res.json({ ok: true, name: finalName });
      }

      // No valid local template and not PDF -> return error instead of creating empty file
      console.error('No valid local template available for', ext, 'cannot create', finalName);
      return res.status(500).json({ error: 'no_valid_local_template', detail: `No valid local template for ${ext}. Place a template at ${templateFile}` });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
   } catch (e) {
     return res.status(500).json({ error: e.message });
   }
});

// Ensure templates directory exists (do not fail startup if templates missing)
try {
  const templatesDir = path.join(__dirname, 'server', 'templates');
  fs.mkdirSync(templatesDir, { recursive: true });
} catch (e) {
  console.warn('Failed to ensure templates directory:', e.message);
}

// Serve static frontend build (SPA fallback to index.html)
const BUILD_DIR = path.join(__dirname, 'web', 'build');
if (fs.existsSync(BUILD_DIR)) {
  app.use(express.static(BUILD_DIR));
  app.get('*', (req, res) => {
    // API routes should not be intercepted
    if (req.path.startsWith('/api/') || req.path.startsWith('/files/') || req.path.startsWith('/onlyoffice/')) {
      return res.status(404).send('Not found');
    }
    res.sendFile(path.join(BUILD_DIR, 'index.html'));
  });
} else {
  console.warn('Frontend build directory not found at', BUILD_DIR);
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
