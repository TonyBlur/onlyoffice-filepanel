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
const DOC_SERVER_URL = process.env.DOC_SERVER_URL || 'http://localhost:80';
const DOC_SERVER_JWT_SECRET = process.env.DOC_SERVER_JWT_SECRET || 'hUQTo541dF2UjKzO56Ux9jHOD62csevJ';
// When Document Server runs in Docker, it may need a different host to reach this backend.
// Set DOC_SERVER_INTERNAL=true and DOC_SERVER_INTERNAL_HOST to an address accessible from the Document Server, e.g. "host.docker.internal:4000" or "backend:4000" in the same Docker network.
const DOC_SERVER_INTERNAL = process.env.DOC_SERVER_INTERNAL === 'true' || !!process.env.DOC_SERVER_INTERNAL;
const DOC_SERVER_INTERNAL_HOST = process.env.DOC_SERVER_INTERNAL_HOST || (DOC_SERVER_INTERNAL ? 'host.docker.internal:4000' : null);
// Ensure file directory exists at startup
try {
  fs.mkdirSync(FILE_DIR, { recursive: true });
} catch (e) {
  console.error('Failed to create file directory:', e.message);
}

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
      const fileName = key || `document_${Date.now()}.docx`;
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
    // DOC_SERVER_INTERNAL_HOST may include port, e.g. host.docker.internal:4000 or backend:4000
    const hostWithProto = DOC_SERVER_INTERNAL_HOST.startsWith('http') ? DOC_SERVER_INTERNAL_HOST : `http://${DOC_SERVER_INTERNAL_HOST}`;
    // Ensure no trailing slash
    const hostNoSlash = hostWithProto.replace(/\/$/, '');
    downloadUrl = `${hostNoSlash}/files/${encodeURIComponent(name)}`;
    callbackUrl = `${hostNoSlash}/onlyoffice/webhook`;
    // browserUrl remains external; docserver should use internal host for server-side operations
  } else if (DOC_SERVER_INTERNAL) {
    // Fallback to host.docker.internal with port 4000 when DOC_SERVER_INTERNAL is truthy but no host specified
    const hostNoSlash = 'http://host.docker.internal:4000';
    downloadUrl = `${hostNoSlash}/files/${encodeURIComponent(name)}`;
    callbackUrl = `${hostNoSlash}/onlyoffice/webhook`;
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
  // Use a stable key per file (sha256 of fileUrl) so the same document reuses the same key.
  try {
    const documentKey = crypto.createHash('sha256').update(fileUrl).digest('hex');
    configObj.document.key = documentKey; // place key in document object
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
