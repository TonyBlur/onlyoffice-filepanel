<div align="center">

<img src="https://raw.githubusercontent.com/TonyBlur/onlyoffice-filepanel/main/web/public/oofp-icon-96.png" alt="OnlyOffice File Panel Logo" width="96" height="96" />

# OnlyOffice File Panel

Extremely Simple yet Powerful File Management Panel for OnlyOffice

English | [简体中文](./README.zh-CN.md)

</div>

## ✨ Features

- List, upload, create, delete, rename, duplicate, and download Office documents (docx, pptx, xlsx, pdf).
- Open and edit documents via OnlyOffice Document Server with signed JWT configuration.
- Chunked upload with pause/resume support for large files.
- Admin features: bulk operations, configurable pagination, and file management.
- Drag-and-drop file upload and real-time file search.
- Dark / light theme (follows system preference by default, manual toggle available).
- Accurate "last edited" time tracking via OnlyOffice webhook with content-change detection.
- Internationalized UI (English / Chinese).

## 🗂️ Repository layout

```
onlyoffice-filepanel/
├── server/                 # Runtime data directory
│   ├── data/files/         # Persistent file storage (mounted as host volume)
│   └── templates/          # Blank templates for new file creation
├── web/                    # React 18 + Vite + Ant Design 5 frontend
├── scripts/                # Build helper scripts
├── server.ts               # Express entry point (API + static frontend)
├── package.json            # Backend dependencies
├── Dockerfile              # 3-stage build → single image (non-root runtime)
├── docker-entrypoint.sh    # Runtime entrypoint (fixes volume permissions, drops to node user)
├── docker-compose.yml      # Run pre-built image (default)
├── docker-compose.build.yml # Build image locally
├── .dockerignore           # Excludes unnecessary files from Docker build context
├── .env.example            # Example environment configuration
└── .github/workflows/      # CI: build & publish Docker image to GHCR / Docker Hub
```

## 🚀 Quick start

This project does **NOT** include ONLYOFFICE Document Server; you need to deploy it separately and set the required environment variables.

**Prerequisites:**
- Docker & Docker Compose (recommended), or
- Node.js v18+ and npm for local development

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `DOC_SERVER_URL` | URL reachable by end-users to load Document Server assets (e.g. `http://docs.example.com`) | `http://localhost:8380` |
| `DOC_SERVER_JWT_SECRET` | JWT secret shared between this app and Document Server | `your-jwt-secret-here` |
| `DOC_SERVER_INTERNAL_HOST` | Address the Document Server uses to reach this app for webhook callbacks | `http://host.docker.internal:3000` |
| `ADMIN_PASSWORD` | Admin login password | `admin` |
| `CORS_ORIGIN` | Comma-separated list of allowed CORS origins. Leave empty to allow all (dev mode) | *(empty)* |
| `PORT` | App listen port inside the container | `3000` |
| `APP_EXTERNAL_PORT` | Host port mapping in docker-compose | `3000` |
| `HOST_FILES_PATH` | Host path for file volume (default: named volume `files_data`) | *(named volume)* |
| `OOFP_IMAGE` | Docker image reference for `docker-compose.yml` | `onlyoffice-filepanel:latest` |

### Templates

Place blank templates under `server/templates/` named `blank.docx`, `blank.pptx`, `blank.xlsx`, `blank.pdf`. Templates must be valid Office binary files (docx/pptx/xlsx are ZIP archives starting with `0x50 0x4B`). Do **not** use HTML placeholder files — OnlyOffice will report "file content does not match the file extension".

### Docker Compose (recommended)

All environment variables have sensible defaults, so you can start without a `.env` file for quick testing. For production, create a `.env` to override defaults:

1. *(Optional)* Create a `.env` file (see `.env.example` for reference):
   ```env
   DOC_SERVER_URL=http://localhost:8380
   DOC_SERVER_JWT_SECRET=your-jwt-secret-here
   ADMIN_PASSWORD=admin
   ```
2. Start the service:

   **Using a pre-built image:**
   ```bash
   docker compose up -d
   ```

   **Building locally:**
   ```bash
   docker compose -f docker-compose.build.yml up --build -d
   ```
3. Access the UI at **http://localhost:3000** (default login password: `admin`)

> **Note:** The container runs as a non-root `node` user. An entrypoint script automatically fixes volume ownership on first start.

### Local development

1. Install and build the frontend:
   ```bash
   cd web
   npm install
   npm run build
   ```
2. Start the server (from repo root):
   ```bash
   npm install
   npm run build && npm start
   ```
3. Open **http://localhost:3000**

   For live frontend development with hot reload:
   ```bash
   cd web
   npm run dev
   ```
   Configure the Vite proxy in `web/vite.config.ts` to point to your backend (e.g. `http://localhost:3000`).

### Install fonts

See [Install Fonts](./Install_Fonts.md)

## 📡 API reference

All write operations (create, upload, rename, delete, etc.) require admin authentication via a JWT cookie obtained through `/api/login`. Unauthenticated requests to protected endpoints receive `401`. File listing (`GET /api/files`) and editor config are publicly accessible.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Health check |
| `GET` | `/api/files` | — | List files (supports `sortBy`, `sortOrder`, `search`, `page`, `perPage` query params) |
| `GET` | `/files/:name` | — | Serve a file inline (for OnlyOffice document loading) |
| `GET` | `/api/files/:name/download` | Admin | Download a file as attachment |
| `POST` | `/api/files/create` | Admin | Create a new file from template `{ name, format }` |
| `POST` | `/api/files/upload` | Admin | Upload a file (multipart/form-data, field `file`) |
| `POST` | `/api/files/upload-chunk` | Admin | Upload a file chunk `{ filename, index, totalChunks }` |
| `POST` | `/api/files/upload-chunk/cancel` | Admin | Cancel a chunked upload `{ filename }` |
| `PUT` | `/api/files/:name/rename` | Admin | Rename a file `{ newName }` |
| `POST` | `/api/files/:name/duplicate` | Admin | Duplicate a file |
| `DELETE` | `/api/files/:name` | Admin | Delete a file |
| `POST` | `/api/upload-base64` | Admin | Upload a base64-encoded file `{ filename, data }` |
| `GET` | `/api/editor-config/:name` | — | Get signed OnlyOffice editor configuration JSON |
| `POST` | `/api/login` | — | Admin login `{ password }` |
| `POST` | `/api/logout` | — | Logout (clear auth cookie) |
| `GET` | `/api/auth` | — | Check authentication status |
| `POST` | `/onlyoffice/webhook` | — | OnlyOffice Document Server save callback |

## ❓ Troubleshooting

- **OnlyOffice shows an HTML page or reports "file content does not match the file extension"** — verify that templates in `server/templates/` are valid Office binaries (hex dump should start with `50 4B`).
- **Document Server cannot download files (ECONNREFUSED)** — set `DOC_SERVER_INTERNAL_HOST` to a host/address the Document Server container can reach (e.g. `http://host.docker.internal:3000`).
- **OnlyOffice shows "version has changed, reload to continue"** — this typically means the document key changed between sessions. Ensure you are not modifying `nameVersions.json` during webhook saves.
- **JWT verification failures** — ensure `DOC_SERVER_JWT_SECRET` matches on both this app and Document Server.
- **Last edited time not updating** — check that the webhook download URL is reachable from the app container (check server logs for `Rewrote webhook download URL`).

## 📜 License

This project is licensed under the MIT License. See `LICENSE` in the repository root.

Copyright (c) 2025-2026 TonyBlur
