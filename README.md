# OnlyOffice File Panel<br> — Extremely Simple File Management Panel for OnlyOffice

English | [简体中文](./README.zh-CN.md)

## ✨ Features
- List, upload, create, and delete Office documents (docx, pptx, xlsx, pdf).
- Open and edit documents via OnlyOffice Document Server using signed JWT configuration.
- Admin features include bulk delete and pagination.

## 🗂️ Repository layout
- `backend/` — Node.js (Express) backend: file APIs, /editor/:name HTML injector, OnlyOffice webhook handler.
- `frontend/` — React frontend with Ant Design: file list, editor page, i18n.
- `files_data:/app/data/files` or `backend/data/files` — Persistent storage for files (mapped host volume).
- `backend/templates/` — Local blank templates used for new file creation (use real Office binaries).
- `docker-compose.yml` — Docker-compose to run backend and frontend.

## 🚀 Quick start

This project does NOT include ONLYOFFICE Document Server; you need to deploy it separately and set the required environment variables.

- Docker & docker-compose (recommended).
- Node.js (v18+) and npm/pnpm for local development.

### Important environment variables
- `DOC_SERVER_URL` — URL reachable by end-users to load Document Server frontend assets (e.g. `http://docs.example.com`).
- `DOC_SERVER_JWT_SECRET` — JWT secret shared between backend and Document Server.
- `DOC_SERVER_INTERNAL_HOST` (optional) — internal address that Document Server can use to reach backend (e.g. `host.docker.internal:4000` or `backend:4000`).
- `DOC_SERVER_INTERNAL` (optional) — boolean flag; when true and no host provided a default internal host is used.
- `ADMIN_PASSWORD` — simple admin password used by the example login endpoint.
- `PORT` — backend listen port (default 4000).

### Templates
- Place blank templates under `backend/templates/` named `blank.docx`, `blank.pptx`, `blank.xlsx`, `blank.pdf`.
- Templates must be valid Office binary files — do not use HTML placeholder files. Office formats like docx/pptx/xlsx are ZIP (start with PK 0x50 0x4B).

### Docker Compose
1. Copy or create `.env` and set environment variables as needed.
2. Start services:
   ```
   docker-compose up --build
   ```
3. Access the UI:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:4000

### Local development (optional)
- Backend:
  ```
  npm install
  NODE_ENV=development
  DOC_SERVER_JWT_SECRET=your-secret node index.js
  ```

- Frontend:
  ```
  cd frontend
  npm install
  npm start
  ```

  (Note: In a containerized environment, the frontend dev server must point to the backend address. Set `VITE_BACKEND_URL` or configure `proxy` in package.json accordingly.)

### APIs (backend)
- `GET /api/files?page=1&perPage=10`
- `GET /files/:name`
- `POST /api/files/create`
- `POST /api/files/upload` (multipart/form-data, field 'file')
- `DELETE /api/files/:name`
- `POST /api/login { password }`
- `POST /onlyoffice/webhook`

### Install fonts
See [Install Fonts](./Install_Fonts.md)

## ❓ Troubleshooting
- If OnlyOffice shows an HTML page or reports "file content does not match the file extension", verify that templates are valid Office binaries.
- If Document Server cannot download files (ECONNREFUSED), set `DOC_SERVER_INTERNAL_HOST` to a host/address the Document Server can use to reach the backend.
- Ensure `DOC_SERVER_JWT_SECRET` matches on both sides to avoid JWT verification failures.

## 📜 License
- This project is licensed under the MIT License. See `LICENSE` in the repository root.