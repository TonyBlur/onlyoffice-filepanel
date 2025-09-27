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

const JWT_SECRET = process.env.DOC_SERVER_JWT_SECRET || 'your-secret-key';
const COOKIE_NAME = 'auth_token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const app = express();
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(cookieParser());

// simple base64 upload (no extra deps)

// store files under the app folder so docker-compose volume ./data/files maps to it
const FILE_DIR = path.join(__dirname, 'data', 'files');
const META_DIR = path.join(__dirname, 'data');
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

// Ensure meta files exist
try { saveJsonSafe(KEYMAP_FILE, loadJsonSafe(KEYMAP_FILE)); } catch (e) {}
try { saveJsonSafe(NAME_VERSIONS_FILE, loadJsonSafe(NAME_VERSIONS_FILE)); } catch (e) {}

// --- cleanup zero-byte files at startup to avoid invalid files lingering ---
try {
  const startupFiles = fs.readdirSync(FILE_DIR || '.');
  startupFiles.forEach(f => {
    const p = path.join(FILE_DIR, f);
    try {
      const st = fs.statSync(p);
      if (st && st.size === 0) {
        fs.unlinkSync(p);
        console.warn('Removed zero-size file at startup:', p);
      }
    } catch (e) {
      // ignore
    }
  });
} catch (e) {
  // ignore
}

// Configure multer for multipart/form-data uploads
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

    // sort by mtime desc
    items.sort((a,b) => b.mtimeMs - a.mtimeMs);

    const role = (req.query.role || 'guest');
    // parse pagination params
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const defaultPerPage = role === 'admin' ? 20 : 5;
    const perPage = Math.max(1, parseInt(req.query.perPage, 10) || defaultPerPage);

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));

    const start = (page - 1) * perPage;
    const paged = items.slice(start, start + perPage);

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

// Return a small HTML that embeds ONLYOFFICE editor with config to open the file
app.get('/editor/:name', (req, res) => {
  const name = req.params.name;
  const externalHost = `${req.protocol}://${req.get('host')}`;
  const fileUrl = `${externalHost}/files/${encodeURIComponent(name)}`;
  const docServer = DOC_SERVER_URL;
  
  // Compute internal host/urls for Document Server to download/save files
  let downloadUrl = fileUrl;
  let callbackUrl = `${externalHost}/onlyoffice/webhook`;
  let browserUrl = externalHost;
  
  if (DOC_SERVER_INTERNAL_HOST) {
    // DOC_SERVER_INTERNAL_HOST may include protocol and port, e.g. http://host.docker.internal:4000 or http://backend:4000
    const hostWithProto = DOC_SERVER_INTERNAL_HOST.startsWith('http') ? DOC_SERVER_INTERNAL_HOST : `http://${DOC_SERVER_INTERNAL_HOST}`;
    // Ensure no trailing slash
    const hostNoSlash = hostWithProto.replace(/\/$/, '');
    downloadUrl = `${hostNoSlash}/files/${encodeURIComponent(name)}`;
    callbackUrl = `${hostNoSlash}/onlyoffice/webhook`;
    // browserUrl remains external; docserver should use internal host for server-side operations
  } else {
    // default to using the external host (what the browser sees)
    downloadUrl = fileUrl;
    callbackUrl = `${externalHost}/onlyoffice/webhook`;
  }

  // Append version query param from nameVersions to force fresh fetch when file changed
  try {
    const nameVersions = loadJsonSafe(NAME_VERSIONS_FILE) || {};
    const ver = nameVersions[name] || 0;
    const sep = downloadUrl.includes('?') ? '&' : '?';
    downloadUrl = `${downloadUrl}${sep}v=${ver}`;
    // also reflect in callbackUrl if desired (not strictly necessary)
    callbackUrl = `${callbackUrl}`;
  } catch (e) {
    console.warn('Failed to append version to downloadUrl:', e.message);
  }

  console.log('Editor URLs:', { externalHost, downloadUrl, callbackUrl, browserUrl, docServer });

  // Build editor config as an object so we can sign it when JWT secret is provided
  // Determine documentType from the file extension so slides open as slides, sheets as cells, etc.
  let docType = 'word';
  try {
    const ext = path.extname(name || '').toLowerCase();
    if (ext === '.ppt' || ext === '.pptx' || ext === '.odp') docType = 'slide';
    else if (ext === '.xls' || ext === '.xlsx' || ext === '.ods' || ext === '.csv') docType = 'cell';
    else if (ext === '.pdf') docType = 'word'; // PDF will be opened in viewer mode within Document Server
    else if (ext === '.doc' || ext === '.docx' || ext === '.odt' || ext === '.rtf') docType = 'word';
    else if (!ext) {
      // fallback: try to guess by mime type
      const mt = mime.getType(name) || '';
      if (mt.includes('sheet') || mt.includes('spreadsheet')) docType = 'cell';
      else if (mt.includes('presentation')) docType = 'slide';
      else if (mt.includes('word') || mt.includes('pdf') || mt.includes('text')) docType = 'word';
    }
  } catch (e) {
    console.warn('Failed to determine documentType, using default word:', e.message);
  }
  
  const configObj = {
    documentType: docType,
    document: {
      title: name,
      url: downloadUrl,
      key: '' // will be set below
    },
    editorConfig: {
      callbackUrl: callbackUrl,
      mode: 'edit'
    }
  };

  // Document Server v7.1+ requires document.key in the config for auth.
  // Use a key that includes a per-filename version so recreating the same filename yields a new key.
  try {
    // load name versions
    let nameVersions = {};
    try { nameVersions = loadJsonSafe(NAME_VERSIONS_FILE); } catch (e) { nameVersions = {}; }
    const ver = nameVersions[name] || 0;
    const fileUrlForKey = `${fileUrl}?v=${ver}`;
    const documentKey = crypto.createHash('sha256').update(fileUrlForKey).digest('hex');
    configObj.document.key = documentKey; // place key in document object

    // Persist mapping from documentKey -> original filename so webhook can restore the proper filename
    try {
      const keyMapDir = path.join(__dirname, 'data');
      const keyMapFile = path.join(keyMapDir, 'keymap.json');
      fs.mkdirSync(keyMapDir, { recursive: true });
      let map = {};
      if (fs.existsSync(keyMapFile)) {
        try { map = JSON.parse(fs.readFileSync(keyMapFile, 'utf8') || '{}'); } catch (e) { map = {}; }
      }
      map[documentKey] = name;
      // also store version for debugging
      try { map[`_${documentKey}_v`] = ver; } catch (e) {}
      fs.writeFileSync(keyMapFile, JSON.stringify(map, null, 2));
    } catch (e) {
      console.warn('Failed to persist document key mapping:', e.message);
    }
  } catch (e) {
    console.error('failed to generate document key', e.message);
  }
  
  // Set document.fileType based on extension (no leading dot)
  try {
    const ext = path.extname(name || '').toLowerCase();
    let fileType = '';
    if (ext) fileType = ext.startsWith('.') ? ext.substring(1) : ext;
    else {
      // fallback to mime
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
      // ONLYOFFICE官方文档要求的JWT payload格式
      const jwtPayload = {
        // include a minimal user identity so Document Server has context
        user: {
          id: 'admin',
          name: 'Administrator',
          roles: ['admin']
        },
        document: {
          key: configObj.document.key,
          url: configObj.document.url,
          title: configObj.document.title || name,
          fileType: configObj.document.fileType || undefined,
          permissions: {
            comment: true,
            copy: true,
            download: true,
            edit: true,
            fillForms: true,
            modifyContentControl: true,
            modifyFilter: true,
            print: true,
            review: true
          }
        },
        editorConfig: {
          callbackUrl: callbackUrl,
          mode: 'edit'
        }
      };
      
      // Ensure the injected configObj contains the same permissions so OnlyOffice won't report modified permissions
      try {
        configObj.document.permissions = jwtPayload.document.permissions;
      } catch (e) {
        console.warn('Failed to set document permissions on configObj:', e.message);
      }
      
      console.log('JWT Payload:', JSON.stringify(jwtPayload, null, 2));
      
      // 生成JWT token — 对 Document Server 使用的直接 payload 进行签名
      token = jwt.sign(jwtPayload, DOC_SERVER_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
      console.log('Generated JWT Token:', token);
    } catch (e) {
      console.error('failed to sign doc server token', e.message);
      token = '';
    }
  }

  // 把 token 放入 configObj，确保前端能直接从 docConfig.token 读取到正确的 JWT
  try {
    if (token) {
      // Strip whitespace/newlines just in case
      token = String(token).replace(/\s+/g, '');
      // Verify token can be decoded with secret
      try {
        const decoded = jwt.verify(token, DOC_SERVER_JWT_SECRET);
        console.log('JWT verified successfully, payload:', JSON.stringify(decoded));
      } catch (verifyErr) {
        console.error('JWT verification failed:', verifyErr.message);
      }
      configObj.token = token;
    }
  } catch (e) {
    console.warn('Failed to attach token to configObj:', e.message);
  }

  const html = `<!doctype html>
  <html>
  <head><meta charset="utf-8"><title>OnlyOffice Editor - ${name}</title>
  <style>body,html{height:100%;margin:0}#editor{height:100vh}</style>
  </head>
  <body>
  <div id="editor"></div>
  <script src="${docServer}/web-apps/apps/api/documents/api.js"></script>

  <script>
    // config object injected from server (includes token)
    var docConfig = ${JSON.stringify(configObj)};
    // expose both browserUrl (used by client) and server-side downloadUrl when needed
    docConfig.browserUrl = ${JSON.stringify(browserUrl)};
    docConfig.callbackUrl = ${JSON.stringify(callbackUrl)};
    docConfig.document.key = ${JSON.stringify(configObj.document.key)};
    // Expose token explicitly as well
    window.__DOC_CONFIG__ = docConfig;
    window.__DOC_TOKEN__ = ${JSON.stringify(token)};
    // Frontend is expected to load api.js and call: new DocsAPI.DocEditor('editor', window.__DOC_CONFIG__);
  </script>
  </body>
  </html>`;

  res.send(html);
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

    const filePath = path.join(FILE_DIR, finalName);

    // If file exists, return conflict
    if (fs.existsSync(filePath)) return res.status(409).json({ error: 'file exists' });

    // Try to create file from local template files located in backend/templates/
    const templatesDir = path.join(__dirname, 'templates');
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
  const templatesDir = path.join(__dirname, 'templates');
  fs.mkdirSync(templatesDir, { recursive: true });
} catch (e) {
  console.warn('Failed to ensure templates directory:', e.message);
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
