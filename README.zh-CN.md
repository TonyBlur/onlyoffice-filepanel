# OnlyOffice File Panel<br> — OnlyOffice极简文件管理面板

[English](./README.md) | 简体中文

## ✨ 主要功能
- 在面板中列出、上传、创建、删除 Office 文档（docx、pptx、xlsx、pdf 等）。
- 通过 OnlyOffice Document Server 打开并在线编辑文档（使用 JWT 保护）。
- 管理员可进行批量删除等操作。

## 🗂️ 项目结构
- `backend/` — Node.js (Express) 后端：文件管理 API、/editor/:name 页面、OnlyOffice webhook 等。
- `frontend/` — React 前端：文件列表、编辑器页面、国际化支持（i18n）。
- `files_data:/app/data/files` 或 `backend/data/files` — 文件的持久化存储（映射到主机卷）。
- `backend/templates/` — 新建文件的空白模板（请使用真实 Office 二进制文件，避免 HTML 占位文件）。
- `docker-compose.yml` — 启动 backend、frontend 的编排。

## 🚀 快速开始

本项目的 docker-compose 不包含 ONLYOFFICE Document Server，需要单独部署并设置所需的环境变量。

- 推荐使用 Docker + docker-compose 来运行完整环境。
- 如果本地开发：需要 Node.js（建议 v18+）、npm 或 pnpm。

### 环境变量
- `DOC_SERVER_URL`：OnlyOffice Document Server 在浏览器可访问的 URL（示例：`http://localhost`）。
- `DOC_SERVER_JWT_SECRET`：与 Document Server 共享的 JWT 密钥，用于签名编辑器配置。
- `DOC_SERVER_INTERNAL_HOST`（可选）：当 Document Server 在容器内或不同网络，需要一个 Document Server 从后端访问后端文件的内部地址，例如 `host.docker.internal:4000` 或 `backend:4000`。
- `DOC_SERVER_INTERNAL`（可选）：设为 `true` 时启用内部 host 回退逻辑。
- `ADMIN_PASSWORD`：管理员登录密码（测试用）。
- `PORT`：后端监听端口（默认 4000）。

### 模板说明
- `backend/templates/` 目录应包含针对常见扩展名的空白模板文件：`blank.docx`、`blank.pptx`、`blank.xlsx`、`blank.pdf`。
- 请使用真实的 Office 二进制文件（docx/pptx/xlsx 为 zip/PK 格式），不要使用示例网站的 HTML 占位文件；否则 OnlyOffice 会提示“file content does not match the file extension” 或显示 HTML 页面。
- 如果没有模板，后端会在创建 PDF 时生成一个最小 PDF；其它格式会返回错误，提示放置模板文件。

### 使用 Docker Compose
1. 在仓库根目录，复制或编辑 `.env`（如果有），设置环境变量，例如：
   DOC_SERVER_URL=http://docserver:80
   DOC_SERVER_JWT_SECRET=your-secret
   ADMIN_PASSWORD=admin123
2. 启动（示例）：
   docker-compose up --build
3. 打开浏览器访问：
   - 前端（面板）：http://localhost:3000
   - 后端 API（开发检查）：http://localhost:4000

### 本地开发（可选）
- 后端：
  ```
  cd backend
  npm install
  NODE_ENV=development
  DOC_SERVER_JWT_SECRET=your-secret node index.js
  ```

- 前端：
  ```
  cd frontend
  npm install
  npm start
  ```

（注：前端开发服务器在容器化环境下需要指向后端地址，环境变量 VITE_BACKEND_URL 或 package.json 中 proxy 需要配置为后端地址。）

### 常用 API（后端）
- `GET /api/files?page=1&perPage=10` — 列表（支持分页）
- `GET /files/:name` — 下载/直接访问文件
- `POST /api/files/create { name, format }` — 基于模板创建新文件
- `POST /api/files/upload` — 上传文件（multipart/form-data，字段名 file）
- `DELETE /api/files/:name` — 删除文件
- `POST /api/login { password }` — 管理员登录（设置 cookie）
- `POST /onlyoffice/webhook` — Document Server 保存回调（由 Document Server 调用）

## ❓ 常见问题与排查
- OnlyOffice 在编辑器中显示 HTML 内容或提示扩展名不匹配：
  - 检查 `backend/templates` 中对应模板是否为真实 Office 文件（用十六进制查看首字节应为 `50 4B` 表示 zip）。
- Document Server 下载失败（ECONNREFUSED 到 127.0.0.1:4000）：
  - 当 Document Server 与后端运行在不同容器或主机时，需设置 `DOC_SERVER_INTERNAL_HOST` 为 Document Server 能访问的地址（如 `host.docker.internal:4000`）。
- JWT 验证失败：
  - 确认 `DOC_SERVER_JWT_SECRET` 在后端与 Document Server 配置中一致。

## 📜 许可证
- 本项目采用 MIT 许可证（MIT）。许可证全文见仓库根目录的 `LICENSE` 文件。
- 版权所有：TonyBlur © 2025