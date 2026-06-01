# OnlyOffice File Panel<br> — Extremely Simple File Management Panel for OnlyOffice

English | [简体中文](./README.zh-CN.md)

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
├── Dockerfile              # Multi-stage build → single image
├── docker-compose.yml      # Run pre-built image (default)
├── docker-compose.build.yml # Build image locally
└── .github/workflows/      # CI: build & publish Docker image to GHCR / Docker Hub
```

## 🚀 Quick start

This project does **NOT** include ONLYOFFICE Document Server; you need to deploy it separately and set the required environment variables.

**Prerequisites:**
- Docker & Docker Compose (recommended), or
- Node.js v18+ and npm for local development

### Environment variables

| Variable | Description |
|---|---|
| `DOC_SERVER_URL` | URL reachable by end-users to load Document Server assets (e.g. `http://docs.example.com`) |
| `DOC_SERVER_JWT_SECRET` | JWT secret shared between this app and Document Server |
| `DOC_SERVER_INTERNAL_HOST` | *(optional)* Address the Document Server uses to reach this app for webhook callbacks (e.g. `http://host.docker.internal:3000`) |
| `ADMIN_PASSWORD` | Admin login password |
| `PORT` | App listen port (default `3000`) |
| `APP_EXTERNAL_PORT` | Host port mapping in docker-compose (default `3000`) |
| `HOST_FILES_PATH` | Host path for file volume (default: named volume `files_data`) |
| `OOFP_IMAGE` | *(optional)* Docker image reference for `docker-compose.yml` (default: `ghcr.io/OWNER/onlyoffice-filepanel:latest`) |

### Templates

Place blank templates under `server/templates/` named `blank.docx`, `blank.pptx`, `blank.xlsx`, `blank.pdf`. Templates must be valid Office binary files (docx/pptx/xlsx are ZIP archives starting with `0x50 0x4B`). Do **not** use HTML placeholder files — OnlyOffice will report "file content does not match the file extension".

### Docker Compose (recommended)

1. Create a `.env` file (you can copy from `.env.example`):
   ```env
   DOC_SERVER_URL=http://localhost:8380
   DOC_SERVER_JWT_SECRET=your-secret
   ADMIN_PASSWORD=admin123
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
3. Access the UI at **http://localhost:3000**

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

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/files` | List files (supports `sortBy`, `sortOrder`, `search`, `page`, `perPage` query params) |
| `GET` | `/files/:name` | Serve a file inline (for OnlyOffice document loading) |
| `GET` | `/api/files/:name/download` | Download a file as attachment |
| `POST` | `/api/files/create` | Create a new file from template `{ name, format }` |
| `POST` | `/api/files/upload` | Upload a file (multipart/form-data, field `file`) |
| `POST` | `/api/files/upload-chunk` | Upload a file chunk `{ filename, index, totalChunks }` |
| `POST` | `/api/files/upload-chunk/cancel` | Cancel a chunked upload `{ filename }` |
| `PUT` | `/api/files/:name/rename` | Rename a file `{ newName }` |
| `POST` | `/api/files/:name/duplicate` | Duplicate a file |
| `DELETE` | `/api/files/:name` | Delete a file |
| `GET` | `/api/editor-config/:name` | Get signed OnlyOffice editor configuration JSON |
| `POST` | `/api/login` | Admin login `{ password }` |
| `POST` | `/api/logout` | Logout (clear auth cookie) |
| `GET` | `/api/auth` | Check authentication status |
| `POST` | `/onlyoffice/webhook` | OnlyOffice Document Server save callback |

## ❓ Troubleshooting

- **OnlyOffice shows an HTML page or reports "file content does not match the file extension"** — verify that templates in `server/templates/` are valid Office binaries (hex dump should start with `50 4B`).
- **Document Server cannot download files (ECONNREFUSED)** — set `DOC_SERVER_INTERNAL_HOST` to a host/address the Document Server container can reach (e.g. `http://host.docker.internal:3000`).
- **OnlyOffice shows "version has changed, reload to continue"** — this typically means the document key changed between sessions. Ensure you are not modifying `nameVersions.json` during webhook saves.
- **JWT verification failures** — ensure `DOC_SERVER_JWT_SECRET` matches on both this app and Document Server.
- **Last edited time not updating** — check that the webhook download URL is reachable from the app container (check server logs for `Rewrote webhook download URL`).

## 📜 License

This project is licensed under the MIT License. See `LICENSE` in the repository root.

Copyright (c) 2025-2026 TonyBlur
