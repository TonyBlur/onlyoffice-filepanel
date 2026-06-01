import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import mime from 'mime';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import axios from 'axios';
import multer from 'multer';

const JWT_SECRET = process.env.DOC_SERVER_JWT_SECRET || 'your-secret-key';
const COOKIE_NAME = 'auth_token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const app = express();
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(cookieParser());

// When running from compiled output (dist/server.js), __dirname is /app/dist/,
// so we need to resolve paths relative to the project root (/app/).
const ROOT_DIR = path.resolve(__dirname, '..');

const FILE_DIR = path.join(ROOT_DIR, 'server', 'data', 'files');
const META_DIR = path.join(ROOT_DIR, 'server', 'data');
const NAME_VERSIONS_FILE = path.join(META_DIR, 'nameVersions.json');
const KEYMAP_FILE = path.join(META_DIR, 'keymap.json');
const LAST_EDITED_FILE = path.join(FILE_DIR, '.meta', 'lastEditedTimes.json');
const CONTENT_HASHES_FILE = path.join(FILE_DIR, '.meta', 'contentHashes.json');
const DOC_SERVER_URL = process.env.DOC_SERVER_URL || 'http://localhost:80';
const DOC_SERVER_JWT_SECRET = process.env.DOC_SERVER_JWT_SECRET || 'hUQTo541dF2UjKzO56Ux9jHOD62csevJ';
const DOC_SERVER_INTERNAL_HOST = process.env.DOC_SERVER_INTERNAL_HOST || null;

/**
 * Rewrite a URL returned by the OnlyOffice Document Server so that it is
 * reachable from inside the Docker container.  The Document Server often
 * embeds its own `localhost:<port>` in webhook download URLs, which is
 * unreachable from the app container.  We replace the host portion with
 * `host.docker.internal` (or the host extracted from DOC_SERVER_INTERNAL_HOST).
 */
function rewriteDocServerUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Only rewrite if the URL points at localhost/127.0.0.1
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      // Derive the replacement host from DOC_SERVER_INTERNAL_HOST if available,
      // otherwise default to host.docker.internal
      let replacementHost = 'host.docker.internal';
      if (DOC_SERVER_INTERNAL_HOST) {
        try {
          const internalParsed = new URL(
            DOC_SERVER_INTERNAL_HOST.startsWith('http') ? DOC_SERVER_INTERNAL_HOST : `http://${DOC_SERVER_INTERNAL_HOST}`
          );
          replacementHost = internalParsed.hostname;
        } catch { /* fall back to default */ }
      }
      parsed.hostname = replacementHost;
      const rewritten = parsed.toString();
      console.log(`Rewrote webhook download URL: ${url} -> ${rewritten}`);
      return rewritten;
    }
  } catch { /* return original if parsing fails */ }
  return url;
}

try {
  fs.mkdirSync(FILE_DIR, { recursive: true });
} catch (e) {
  console.error('Failed to create file directory:', (e as Error).message);
}

function loadJsonSafe(fp: string): Record<string, unknown> {
  try {
    if (fs.existsSync(fp)) {
      return JSON.parse(fs.readFileSync(fp, 'utf8') || '{}');
    }
  } catch (e) {
    console.warn('Failed to load JSON', fp, (e as Error).message);
  }
  return {};
}

function saveJsonSafe(fp: string, obj: unknown) {
  try {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(obj || {}, null, 2));
  } catch (e) {
    console.warn('Failed to save JSON', fp, (e as Error).message);
  }
}

function getUniqueFilename(dir: string, baseName: string): string {
  const ext = path.extname(baseName);
  const nameWithoutExt = path.basename(baseName, ext);
  let candidate = baseName;
  let counter = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${nameWithoutExt} (${counter})${ext}`;
    counter++;
    if (counter > 999) break;
  }
  return candidate;
}

try { saveJsonSafe(KEYMAP_FILE, loadJsonSafe(KEYMAP_FILE)); } catch (e) { /* ignore */ }
try { saveJsonSafe(NAME_VERSIONS_FILE, loadJsonSafe(NAME_VERSIONS_FILE)); } catch (e) { /* ignore */ }

// One-time migration: clear stale lastEditedTimes.json that was polluted by
// the old forcesave endpoint which recorded timestamps on every file open.
// Flag is stored inside the mounted volume so it survives container recreation.
const MIGRATION_FLAG = path.join(FILE_DIR, '.meta', '.migrated_lastEdited');
if (!fs.existsSync(MIGRATION_FLAG)) {
  try {
    if (fs.existsSync(LAST_EDITED_FILE)) {
      fs.unlinkSync(LAST_EDITED_FILE);
      console.log('Migration: cleared stale lastEditedTimes.json');
    }
    fs.mkdirSync(path.dirname(MIGRATION_FLAG), { recursive: true });
    fs.writeFileSync(MIGRATION_FLAG, new Date().toISOString());
    console.log('Migration: marked lastEditedTimes migration complete');
  } catch (e) {
    console.warn('Migration failed:', (e as Error).message);
  }
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, FILE_DIR);
  },
  filename: function (_req, file, cb) {
    const safeName = path.basename(file.originalname);
    cb(null, safeName);
  }
});
const upload = multer({ storage });

const uploadMemory = multer({ storage: multer.memoryStorage() });

interface AuthRequest extends Request {
  user?: { role: string };
}

const checkAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) {
    req.user = { role: 'guest' };
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    req.user = decoded;
  } catch (e) {
    req.user = { role: 'guest' };
  }
  next();
};

interface FileItem {
  name: string;
  mtime: string | null;
  lastEdited: string | null;
  mtimeMs: number;
  size: number;
}

app.get('/api/files', checkAuth, (req: AuthRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const rawFiles = fs.readdirSync(FILE_DIR || '.').filter(f => {
      if (f.startsWith('.')) return false;
      const fp = path.join(FILE_DIR, f);
      try { return fs.statSync(fp).isFile(); } catch { return false; }
    });
    const editTimes = loadJsonSafe(LAST_EDITED_FILE) as Record<string, string>;
    const items: FileItem[] = rawFiles.map(f => {
      const p = path.join(FILE_DIR, f);
      let stat = null;
      try { stat = fs.statSync(p); } catch (e) { stat = null; }
      const trackedTime = editTimes[f];
      return {
        name: f,
        mtime: stat ? stat.mtime.toISOString() : null,
        lastEdited: trackedTime || (stat ? stat.mtime.toISOString() : null),
        mtimeMs: trackedTime ? new Date(trackedTime).getTime() : (stat ? stat.mtimeMs : 0),
        size: stat ? stat.size : 0
      };
    });

    const sortBy = req.query.sortBy || 'mtime';
    const sortOrder = req.query.sortOrder || 'desc';
    items.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'size') cmp = a.size - b.size;
      else cmp = (a.mtimeMs || 0) - (b.mtimeMs || 0);
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    const searchQuery = req.query.search || '';
    let filteredItems = items;
    if (searchQuery) {
      const lowerSearch = String(searchQuery).toLowerCase();
      filteredItems = items.filter(f => f.name.toLowerCase().includes(lowerSearch));
    }

    const role = String(req.query.role || 'guest');
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const defaultPerPage = role === 'admin' ? 20 : 5;
    const perPage = Math.max(1, parseInt(req.query.perPage as string, 10) || defaultPerPage);

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
    return res.status(500).json({ error: (e as Error).message });
  }
});

app.get('/files/:name', (req: Request, res: Response) => {
  const name = path.basename(String(req.params.name));
  const filePath = path.join(FILE_DIR, name);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');

  let contentType = mime.getType(filePath) || 'application/octet-stream';
  if (!path.extname(name) && name.includes('document')) {
    contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  // Do NOT send ETag / Last-Modified headers.  When the webhook writes the
  // saved file back to disk the mtime changes, and OnlyOffice would interpret
  // the new ETag as "document changed externally" → onOutdatedVersion → the
  // editor breaks.  Since the editor session is the single source of truth,
  // we skip conditional-request support here.
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', contentType);
  fs.createReadStream(filePath).pipe(res);
});

app.put('/api/files/:name/rename', (req: Request, res: Response) => {
  try {
    const name = path.basename(String(req.params.name));
    const { newName } = req.body || {};
    if (!newName) return res.status(400).json({ error: 'missing newName' });

    const oldPath = path.join(FILE_DIR, name);
    if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'not found' });

    const safeNewName = path.basename(newName);
    const newPath = path.join(FILE_DIR, safeNewName);
    if (fs.existsSync(newPath)) return res.status(409).json({ error: 'target exists' });

    fs.renameSync(oldPath, newPath);

    try {
      const keyMapFile = path.join(META_DIR, 'keymap.json');
      if (fs.existsSync(keyMapFile)) {
        let map: Record<string, string> = {};
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
      console.warn('Failed to update keymap after rename:', (e as Error).message);
    }

    res.json({ ok: true, name: safeNewName });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post('/api/files/:name/duplicate', (req: Request, res: Response) => {
  try {
    const name = path.basename(String(req.params.name));
    const srcPath = path.join(FILE_DIR, name);
    if (!fs.existsSync(srcPath)) return res.status(404).json({ error: 'not found' });

    const ext = path.extname(name);
    const baseName = path.basename(name, ext);
    const dupName = getUniqueFilename(FILE_DIR, `${baseName} (copy)${ext}`);
    const destPath = path.join(FILE_DIR, dupName);

    fs.copyFileSync(srcPath, destPath);

    try {
      const keyMapFile = path.join(META_DIR, 'keymap.json');
      if (fs.existsSync(keyMapFile)) {
        let map = loadJsonSafe(keyMapFile);
        let changed = false;
        for (const k of Object.keys(map)) {
          if (map[k] === name) {
            const newKey = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            map[newKey] = dupName;
            changed = true;
          }
        }
        if (changed) saveJsonSafe(keyMapFile, map);
      }
    } catch (e) {
      console.warn('Failed to copy keymap after duplicate:', (e as Error).message);
    }

    res.json({ ok: true, name: dupName });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get('/api/files/:name/download', (req: Request, res: Response) => {
  try {
    const name = path.basename(String(req.params.name));
    const filePath = path.join(FILE_DIR, name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' });

    const mimeType = mime.getType(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.delete('/api/files/:name', (req: Request, res: Response) => {
  const name = path.basename(String(req.params.name));
  const filePath = path.join(FILE_DIR, name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' });
  try {
    fs.unlinkSync(filePath);

    try {
      const keyMapFile = path.join(META_DIR, 'keymap.json');
      if (fs.existsSync(keyMapFile)) {
        let map: Record<string, string> = {};
        try { map = JSON.parse(fs.readFileSync(keyMapFile, 'utf8') || '{}'); } catch (e) { map = {}; }
        let changed = false;
        for (const k of Object.keys(map)) {
          if (map[k] === name) {
            delete map[k];
            changed = true;
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
                console.warn('Failed to remove associated key-file', p, (e as Error).message);
              }
            });
          }
        }
        if (changed) {
          try { fs.writeFileSync(keyMapFile, JSON.stringify(map, null, 2)); } catch (e) { console.warn('Failed to persist keymap after delete:', (e as Error).message); }
        }
      }

      try {
        const versions = loadJsonSafe(NAME_VERSIONS_FILE);
        versions[String(name)] = ((versions[String(name)] as number) || 0) + 1;
        saveJsonSafe(NAME_VERSIONS_FILE, versions);
        console.log('Incremented name version for deleted file', name, versions[name]);
      } catch (e) {
        console.warn('Failed to increment name version on delete:', (e as Error).message);
      }
    } catch (e) {
      console.warn('Failed to cleanup keymap for deleted file:', (e as Error).message);
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post('/api/upload-base64', (req: Request, res: Response) => {
  const { filename, data } = req.body || {};
  if (!filename) return res.status(400).json({ error: 'missing filename' });
  if (typeof data === 'undefined' || data === null) return res.status(400).json({ error: 'missing data' });
  const buf = Buffer.from(data || '', 'base64');
  const targetPath = path.join(FILE_DIR, filename);
  try {
    fs.mkdirSync(FILE_DIR, { recursive: true });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
  fs.writeFile(targetPath, buf, err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, name: filename });
  });
});

app.post('/api/files/upload', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
    const savedName = req.file.filename;
    return res.json({ ok: true, name: savedName });
  } catch (e) {
    console.error('Upload error:', (e as Error).message);
    return res.status(500).json({ error: (e as Error).message });
  }
});

app.post('/api/files/upload-chunk', uploadMemory.single('chunk'), (req: Request, res: Response) => {
  try {
    const { filename, index, totalChunks } = req.body || {};
    if (!filename) return res.status(400).json({ error: 'missing filename' });
    if (typeof index === 'undefined') return res.status(400).json({ error: 'missing index' });
    const idx = parseInt(index, 10);
    const total = totalChunks ? parseInt(totalChunks, 10) : null;

    let safeName = path.basename(filename);
    let destPath = path.join(FILE_DIR, safeName);

    try { fs.mkdirSync(FILE_DIR, { recursive: true }); } catch (e) { /* ignore */ }

    if (idx === 0) {
      if (fs.existsSync(destPath)) {
        safeName = getUniqueFilename(FILE_DIR, safeName);
        destPath = path.join(FILE_DIR, safeName);
        console.log('Upload file exists, auto-renamed:', filename, '->', safeName);
      }
      try { fs.writeFileSync(destPath, Buffer.alloc(0)); } catch (e) { /* ignore */ }
    }

    if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'missing chunk' });

    try {
      fs.appendFileSync(destPath, req.file.buffer);
    } catch (e) {
      console.error('Failed to append chunk:', (e as Error).message);
      return res.status(500).json({ error: (e as Error).message });
    }

    if (total !== null && idx === total - 1) {
      return res.json({ ok: true, name: safeName, completed: true });
    }

    return res.json({ ok: true, name: safeName, index: idx });
  } catch (e) {
    console.error('Chunk upload error:', (e as Error).message);
    return res.status(500).json({ error: (e as Error).message });
  }
});

app.post('/api/files/upload-chunk/cancel', (req: Request, res: Response) => {
  try {
    const filename = req.body && req.body.filename || req.query && req.query.filename;
    if (!filename) return res.status(400).json({ error: 'missing filename' });
    const safeName = path.basename(filename as string);
    const destPath = path.join(FILE_DIR, safeName);
    if (fs.existsSync(destPath)) {
      try { fs.unlinkSync(destPath); } catch (e) { console.warn('Failed to remove partial file:', (e as Error).message); }
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

// (forcesave endpoint removed — OnlyOffice auto-saves on destroyEditor())

app.post('/onlyoffice/webhook', (req: Request, res: Response) => {
  try {
    const { key, status } = req.body || {};
    // Rewrite the download URL so it's reachable from inside the Docker container
    const url = req.body?.url ? rewriteDocServerUrl(String(req.body.url)) : undefined;

    console.log('Received webhook:', { key, status, url });

    if ((status === 2 || status === 6) && url) {
      const fileNameFromKeymap = (function() {
        try {
          const keyMapFile = path.join(META_DIR, 'keymap.json');
          if (fs.existsSync(keyMapFile)) {
            const map = JSON.parse(fs.readFileSync(keyMapFile, 'utf8') || '{}');
            if (map && map[key]) return map[key];
          }
        } catch (e) {
          console.warn('Failed to read keymap.json:', (e as Error).message);
        }
        return null;
      })();

      const fileName = fileNameFromKeymap ? fileNameFromKeymap : (key ? `${key}.docx` : `document_${Date.now()}.docx`);
      const filePath = path.join(FILE_DIR, fileName);

      console.log(`Downloading saved document from ${url} to ${filePath}`);

      if (url.startsWith('file://') || url.startsWith('/')) {
        const localPath = url.startsWith('file://') ? url.substring(7) : url;
        console.log(`Reading local file from ${localPath}`);

        try {
          const fileData = fs.readFileSync(localPath);

          // Compare content hash against OnlyOffice's LAST save (not the file
          // on disk).  OnlyOffice re-encodes documents on save, so byte-level
          // comparison with the disk file always shows "different" even when the
          // user made no edits.  By tracking the hash of what OnlyOffice last
          // sent us, we can detect whether the content genuinely changed
          // between two webhook calls.
          const newHash = crypto.createHash('sha256').update(fileData).digest('hex');
          const hashes = loadJsonSafe(CONTENT_HASHES_FILE);
          const prevHash = hashes[fileName] as string | undefined;
          const contentChanged = !prevHash || prevHash !== newHash;

          // Always write the file (keeps disk copy in sync with OnlyOffice)
          fs.writeFileSync(filePath, fileData);
          hashes[fileName] = newHash;
          saveJsonSafe(CONTENT_HASHES_FILE, hashes);

          if (contentChanged) {
            console.log(`Document saved to ${filePath} (content changed vs last webhook)`);
            try {
              const editTimes = loadJsonSafe(LAST_EDITED_FILE);
              editTimes[fileName] = new Date().toISOString();
              saveJsonSafe(LAST_EDITED_FILE, editTimes);
            } catch (e) { /* ignore */ }
          } else {
            console.log(`Webhook for ${fileName}: content same as last save, skipping timestamp`);
          }

          // Do NOT increment nameVersions here — changing the version alters the document key,
          // which causes OnlyOffice to show "version has changed" on next open and breaks editing.
          // The document key should only change for external modifications (upload, create, delete, rename).

          res.json({ error: 0, message: 'Document saved successfully' });
        } catch (fileError) {
          console.error('Error reading local file:', (fileError as Error).message);
          res.status(500).json({ error: 1, message: `Failed to read local file: ${(fileError as Error).message}` });
        }
      } else {
        console.log(`Downloading from URL: ${url}`);

        const axiosConfig = {
          responseType: 'arraybuffer' as const,
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        };

        axios.get(url, axiosConfig)
          .then(response => {
            const newData = Buffer.from(response.data);

            // Hash-based comparison against OnlyOffice's last save
            const newHash = crypto.createHash('sha256').update(newData).digest('hex');
            const hashes = loadJsonSafe(CONTENT_HASHES_FILE);
            const prevHash = hashes[fileName] as string | undefined;
            const contentChanged = !prevHash || prevHash !== newHash;

            fs.writeFileSync(filePath, newData);
            hashes[fileName] = newHash;
            saveJsonSafe(CONTENT_HASHES_FILE, hashes);

            if (contentChanged) {
              console.log(`Document saved to ${filePath}, size: ${newData.length} bytes (content changed)`);
              try {
                const editTimes = loadJsonSafe(LAST_EDITED_FILE);
                editTimes[fileName] = new Date().toISOString();
                saveJsonSafe(LAST_EDITED_FILE, editTimes);
              } catch (e) { /* ignore */ }
            } else {
              console.log(`Webhook for ${fileName}: content same as last save, skipping timestamp`);
            }

            // Do NOT increment nameVersions here — same reason as above.

            res.json({ error: 0, message: 'Document saved successfully' });
          })
          .catch(error => {
            console.error('Error downloading document:', error.message);
            console.error('Error response:', error.response ? error.response.status : 'No response');
            res.status(500).json({ error: 1, message: `Failed to download document: ${error.message}` });
          });
      }
    } else {
      console.log(`Document not ready for save. Status: ${status}`);
      res.json({ error: 0, message: 'Document not ready for save' });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 1, message: 'Internal server error' });
  }
});

app.post('/api/login', (req: Request, res: Response) => {
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

app.post('/api/logout', (_req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/auth', (req: Request, res: Response) => {
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

interface EditorConfigResult {
  configObj: {
    documentType: string;
    document: {
      title: string;
      url: string;
      key: string;
      fileType?: string;
      permissions?: Record<string, boolean>;
    };
    editorConfig: {
      callbackUrl: string;
      mode: string;
    };
    token?: string;
  };
  docApiUrl: string;
  token: string;
}

function buildEditorConfig(name: string, mode: string | undefined, externalHost: string): EditorConfigResult {
  const fileUrl = `${externalHost}/files/${encodeURIComponent(name)}`;
  const docServer = DOC_SERVER_URL;

  let downloadUrl = fileUrl;
  let callbackUrl = `${externalHost}/onlyoffice/webhook`;

  if (DOC_SERVER_INTERNAL_HOST) {
    const hostWithProto = DOC_SERVER_INTERNAL_HOST.startsWith('http') ? DOC_SERVER_INTERNAL_HOST : `http://${DOC_SERVER_INTERNAL_HOST}`;
    const hostNoSlash = hostWithProto.replace(/\/$/, '');
    downloadUrl = `${hostNoSlash}/files/${encodeURIComponent(name)}`;
    callbackUrl = `${hostNoSlash}/onlyoffice/webhook`;
  }

  try {
    const nameVersions = loadJsonSafe(NAME_VERSIONS_FILE) || {};
    const ver = nameVersions[name] as number || 0;
    const sep = downloadUrl.includes('?') ? '&' : '?';
    downloadUrl = `${downloadUrl}${sep}v=${ver}`;
  } catch (e) {
    console.warn('Failed to append version to downloadUrl:', (e as Error).message);
  }

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
    console.warn('Failed to determine documentType, using default word:', (e as Error).message);
  }

  const editorMode = mode === 'view' ? 'view' : 'edit';
  const configObj: {
    documentType: string;
    document: {
      title: string;
      url: string;
      key: string;
      fileType?: string;
      permissions?: Record<string, boolean>;
    };
    editorConfig: {
      callbackUrl: string;
      mode: string;
    };
    token?: string;
  } = {
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

  try {
    let nameVersions: Record<string, unknown> = {};
    try { nameVersions = loadJsonSafe(NAME_VERSIONS_FILE); } catch (e) { nameVersions = {}; }
    const ver = (nameVersions[String(name)] as number) || 0;
    const fileUrlForKey = `${fileUrl}?v=${ver}`;
    const documentKey = crypto.createHash('sha256').update(fileUrlForKey).digest('hex');
    configObj.document.key = documentKey;

    try {
      const keyMapDir = path.join(ROOT_DIR, 'server', 'data');
      const keyMapFile = path.join(keyMapDir, 'keymap.json');
      fs.mkdirSync(keyMapDir, { recursive: true });
      let map: Record<string, string> = {};
      if (fs.existsSync(keyMapFile)) {
        try { map = JSON.parse(fs.readFileSync(keyMapFile, 'utf8') || '{}'); } catch (e) { map = {}; }
      }
      map[documentKey] = name;
      try { map[`_${documentKey}_v`] = String(ver); } catch (e) { /* ignore */ }
      fs.writeFileSync(keyMapFile, JSON.stringify(map, null, 2));
    } catch (e) {
      console.warn('Failed to persist document key mapping:', (e as Error).message);
    }
  } catch (e) {
    console.error('failed to generate document key', (e as Error).message);
  }

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
    console.warn('Failed to set document.fileType:', (e as Error).message);
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
      } catch (e) { /* ignore */ }
      token = jwt.sign(jwtPayload, DOC_SERVER_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
      if (token) {
        token = String(token).replace(/\s+/g, '');
        configObj.token = token;
      }
    } catch (e) {
      console.error('failed to sign doc server token', (e as Error).message);
    }
  }

  return {
    configObj,
    docApiUrl: `${docServer}/web-apps/apps/api/documents/api.js`,
    token
  };
}

app.get('/api/editor-config/:name', (req: Request, res: Response) => {
  const name = path.basename(String(req.params.name));
  const externalHost = `${req.protocol}://${req.get('host')}`;
  const mode = req.query.mode;
  const result = buildEditorConfig(name, mode as string, externalHost);
  res.json({
    docConfig: result.configObj,
    docApiUrl: result.docApiUrl,
    token: result.token
  });
});

app.post('/api/files/create', async (req: Request, res: Response) => {
  try {
    const { name, format } = req.body || {};
    if (!name) return res.status(400).json({ error: 'missing name' });

    const safeName = path.basename(name);
    const ext = path.extname(safeName) || (format ? `.${format.replace(/^[.]/, '')}` : '.docx');
    const finalName = safeName.toLowerCase().endsWith(ext.toLowerCase()) ? safeName : `${safeName}${ext}`;

    fs.mkdirSync(FILE_DIR, { recursive: true });

    let filePath = path.join(FILE_DIR, finalName);

    if (fs.existsSync(filePath)) {
      const uniqueName = getUniqueFilename(FILE_DIR, finalName);
      filePath = path.join(FILE_DIR, uniqueName);
      console.log('File exists, auto-renamed:', finalName, '->', uniqueName);
    }

    const templatesDir = path.join(ROOT_DIR, 'server', 'templates');
    const templateFile = path.join(templatesDir, `blank${ext}`);

    try {
      const keyMapFile = path.join(META_DIR, 'keymap.json');
      if (fs.existsSync(keyMapFile)) {
        let map: Record<string, string> = {};
        try { map = JSON.parse(fs.readFileSync(keyMapFile, 'utf8') || '{}'); } catch (e) { map = {}; }
        let changed = false;
        for (const k of Object.keys(map)) {
          if (map[k] === finalName) {
            delete map[k];
            changed = true;
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
      console.warn('Failed to clean keymap during create:', (e as Error).message);
    }

    try {
      if (fs.existsSync(templateFile)) {
        try {
          const st = fs.statSync(templateFile);
          console.log('Template file exists at', templateFile, 'size', st.size);

          try {
            fs.copyFileSync(templateFile, filePath);
            console.log('Copied template to', filePath);
            return res.json({ ok: true, name: finalName });
          } catch (e) {
            console.warn('Failed to copy template file:', (e as Error).message);
          }
        } catch (e) {
          console.warn('Failed to inspect template file:', (e as Error).message);
        }
      } else {
        console.log('No local template file found at', templateFile);
      }

      if (ext.toLowerCase() === '.pdf') {
        const pdfMinimal = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 24 Tf 72 100 Td (Blank PDF) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000120 00000 n \n0000000200 00000 n \ntrailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n300\n%%EOF');
        fs.writeFileSync(filePath, pdfMinimal);
        return res.json({ ok: true, name: finalName });
      }

      console.error('No valid local template available for', ext, 'cannot create', finalName);
      return res.status(500).json({ error: 'no_valid_local_template', detail: `No valid local template for ${ext}. Place a template at ${templateFile}` });
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

try {
  const templatesDir = path.join(ROOT_DIR, 'server', 'templates');
  fs.mkdirSync(templatesDir, { recursive: true });
} catch (e) {
  console.warn('Failed to ensure templates directory:', (e as Error).message);
}

const BUILD_DIR = path.join(ROOT_DIR, 'dist', 'web', 'build');
if (fs.existsSync(BUILD_DIR)) {
  app.use(express.static(BUILD_DIR));
  app.get('*', (req: Request, res: Response) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/files/') || req.path.startsWith('/onlyoffice/')) {
      return res.status(404).send('Not found');
    }
    res.sendFile(path.join(BUILD_DIR, 'index.html'));
  });
} else {
  console.warn('Frontend build directory not found at', BUILD_DIR);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
