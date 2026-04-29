# OnlyOffice File Panel<br> — Extremely Simple File Management Panel for OnlyOffice

English | [简体中文](./README.zh-CN.md)

## ✨ Features
- List, upload, create, and delete Office documents (docx, pptx, xlsx, pdf).
- Open and edit documents via OnlyOffice Document Server using signed JWT configuration.
- Admin features include bulk delete and pagination.
- Drag-and-drop file upload and file search.

## 🗂️ Repository layout
```
onlyoffice-filepanel/
├── server/          # Express backend: file APIs, OnlyOffice webhook handler
│   ├── data/        # Persistent file storage (mapped as host volume)
│   └── templates/   # Blank templates for new file creation
├── web/             # React 18 + Ant Design 5 frontend
├── server.js        # Unified entry point (serves API + static frontend)
├── package.json     # Combined dependencies
├── Dockerfile       # Multi-stage build → single image
└── docker-compose.yml  # Single service, port 4000
```

## 🚀 Quick start

This project does **NOT** include ONLYOFFICE Document Server; you need to deploy it separately and set the required environment variables.

- Docker & docker-compose (recommended).
- Node.js (v18+) and npm for local development.

### Important environment variables
| Variable | Description |
|---|---|
| `DOC_SERVER_URL` | URL reachable by end-users to load Document Server assets (e.g. `http://docs.example.com`) |
| `DOC_SERVER_JWT_SECRET` | JWT secret shared between this app and Document Server |
| `DOC_SERVER_INTERNAL_HOST` | *(optional)* Address Document Server uses to reach this app for file callbacks (e.g. `http://host.docker.internal:4000`) |
| `ADMIN_PASSWORD` | Admin login password |
| `PORT` | App listen port (default `4000`) |
| `APP_EXTERNAL_PORT` | Host port mapping in docker-compose (default `4000`) |
| `HOST_FILES_PATH` | Host path for file volume (default: named volume `files_data`) |

### Templates
- Place blank templates under `server/templates/` named `blank.docx`, `blank.pptx`, `blank.xlsx`, `blank.pdf`.
- Templates must be valid Office binary files (docx/pptx/xlsx start with PK `0x50 0x4B`). Do **not** use HTML placeholder files — OnlyOffice will report "file content does not match the file extension".

### Docker Compose (recommended)
1. Copy or create `.env` and set environment variables:
   ```env
   DOC_SERVER_URL=http://localhost:8380
   DOC_SERVER_JWT_SECRET=your-secret
   ADMIN_PASSWORD=admin123
   ```
2. Start the service:
   ```bash
   docker-compose up --build
   ```
3. Access the UI at **http://localhost:4000**

### Local development
1. Build the frontend:
   ```bash
   cd web
   npm install
   npm run build
   ```
2. Start the server (from repo root):
   ```bash
   npm install
   DOC_SERVER_JWT_SECRET=your-secret node server.js
   ```
3. Open **http://localhost:4000**

   For live frontend development, run `npm run dev` inside `web/` and configure the Vite proxy to point to `http://localhost:4000`.

### Install fonts
See [Install Fonts](./Install_Fonts.md)

## 📡 API reference
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/files?page=1&perPage=10` | List files (paginated) |
| `GET` | `/files/:name` | Download / serve a file |
| `POST` | `/api/files/create` | Create a new file from template `{ name, format }` |
| `POST` | `/api/files/upload` | Upload file (multipart/form-data, field `file`) |
| `DELETE` | `/api/files/:name` | Delete a file |
| `GET` | `/api/editor-config/:name` | Get signed editor config JSON for OnlyOffice |
| `POST` | `/api/login` | Admin login `{ password }` |
| `POST` | `/onlyoffice/webhook` | Document Server save callback |

## ❓ Troubleshooting
- **OnlyOffice shows an HTML page or reports "file content does not match the file extension"** — verify that templates in `server/templates/` are valid Office binaries (hex dump should start with `50 4B`).
- **Document Server cannot download files (ECONNREFUSED)** — set `DOC_SERVER_INTERNAL_HOST` to a host/address the Document Server container can reach (e.g. `http://host.docker.internal:4000`).
- **JWT verification failures** — ensure `DOC_SERVER_JWT_SECRET` matches on both this app and Document Server.

## 📜 License
This project is licensed under the MIT License. See `LICENSE` in the repository root.
