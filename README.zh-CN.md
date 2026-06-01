# OnlyOffice File Panel<br> — OnlyOffice 极简文件管理面板

[English](./README.md) | 简体中文

## ✨ 主要功能

- 列出、上传、创建、删除、重命名、复制和下载 Office 文档（docx、pptx、xlsx、pdf）。
- 通过 OnlyOffice Document Server 在线打开和编辑文档（使用 JWT 签名保护）。
- 支持大文件分片上传，可暂停/恢复。
- 管理员功能：批量操作、可配置分页、文件管理。
- 支持拖拽上传文件和实时搜索。
- 深色/浅色主题（默认跟随系统偏好，支持手动切换）。
- 基于 OnlyOffice Webhook 的精确"最近编辑时间"追踪（通过内容变更检测）。
- 国际化界面（中文 / 英文）。

## 🗂️ 项目结构

```
onlyoffice-filepanel/
├── server/                 # 运行时数据目录
│   ├── data/files/         # 文件持久化存储（挂载为主机卷）
│   └── templates/          # 新建文件用的空白模板
├── web/                    # React 18 + Vite + Ant Design 5 前端
├── scripts/                # 构建辅助脚本
├── server.ts               # Express 入口（同时提供 API 和静态前端）
├── package.json            # 后端依赖
├── Dockerfile              # 多阶段构建 → 单一镜像
├── docker-compose.yml      # 使用预构建镜像（默认）
├── docker-compose.build.yml # 本地构建镜像
└── .github/workflows/      # CI：构建并发布 Docker 镜像到 GHCR / Docker Hub
```

## 🚀 快速开始

本项目**不包含** ONLYOFFICE Document Server，需要单独部署并配置相关环境变量。

**环境要求：**
- 推荐使用 Docker + Docker Compose 运行完整环境
- 本地开发需要 Node.js v18+ 和 npm

### 环境变量说明

| 变量 | 说明 |
|---|---|
| `DOC_SERVER_URL` | 浏览器可访问的 Document Server 地址（如 `http://docs.example.com`） |
| `DOC_SERVER_JWT_SECRET` | 与 Document Server 共享的 JWT 密钥 |
| `DOC_SERVER_INTERNAL_HOST` | *（可选）* Document Server 用于回调本应用的内部地址（如 `http://host.docker.internal:3000`） |
| `ADMIN_PASSWORD` | 管理员登录密码 |
| `PORT` | 应用监听端口（默认 `3000`） |
| `APP_EXTERNAL_PORT` | docker-compose 中映射到宿主机的端口（默认 `3000`） |
| `HOST_FILES_PATH` | 文件卷的宿主机路径（默认使用命名卷 `files_data`） |
| `OOFP_IMAGE` | *（可选）* `docker-compose.yml` 使用的 Docker 镜像地址（默认 `ghcr.io/OWNER/onlyoffice-filepanel:latest`） |

### 模板说明

在 `server/templates/` 目录放置对应扩展名的空白模板：`blank.docx`、`blank.pptx`、`blank.xlsx`、`blank.pdf`。请使用真实的 Office 二进制文件（docx/pptx/xlsx 格式为 ZIP 压缩包，十六进制开头为 `50 4B`）。**不要使用 HTML 占位文件**，否则 OnlyOffice 会提示扩展名不匹配。

### 使用 Docker Compose（推荐）

1. 创建 `.env` 文件（可从 `.env.example` 复制）：
   ```env
   DOC_SERVER_URL=http://localhost:8380
   DOC_SERVER_JWT_SECRET=your-secret
   ADMIN_PASSWORD=admin123
   ```
2. 启动服务：

   **使用预构建镜像：**
   ```bash
   docker compose up -d
   ```

   **本地构建：**
   ```bash
   docker compose -f docker-compose.build.yml up --build -d
   ```
3. 浏览器访问 **http://localhost:3000**

### 本地开发

1. 安装并构建前端：
   ```bash
   cd web
   npm install
   npm run build
   ```
2. 从仓库根目录启动服务：
   ```bash
   npm install
   npm run build && npm start
   ```
3. 打开 **http://localhost:3000**

   若需要前端热更新开发：
   ```bash
   cd web
   npm run dev
   ```
   将 `web/vite.config.ts` 中的代理配置指向后端地址（如 `http://localhost:3000`）。

### 安装字体

请参阅 [安装字体](./Install_Fonts.zh-CN.md)

## 📡 API 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/files` | 获取文件列表（支持 `sortBy`、`sortOrder`、`search`、`page`、`perPage` 查询参数） |
| `GET` | `/files/:name` | 内联访问文件（供 OnlyOffice 加载文档） |
| `GET` | `/api/files/:name/download` | 以附件形式下载文件 |
| `POST` | `/api/files/create` | 基于模板创建新文件 `{ name, format }` |
| `POST` | `/api/files/upload` | 上传文件（multipart/form-data，字段名 `file`） |
| `POST` | `/api/files/upload-chunk` | 分片上传 `{ filename, index, totalChunks }` |
| `POST` | `/api/files/upload-chunk/cancel` | 取消分片上传 `{ filename }` |
| `PUT` | `/api/files/:name/rename` | 重命名文件 `{ newName }` |
| `POST` | `/api/files/:name/duplicate` | 复制文件 |
| `DELETE` | `/api/files/:name` | 删除文件 |
| `GET` | `/api/editor-config/:name` | 获取签名后的 OnlyOffice 编辑器配置 JSON |
| `POST` | `/api/login` | 管理员登录 `{ password }` |
| `POST` | `/api/logout` | 退出登录（清除认证 Cookie） |
| `GET` | `/api/auth` | 检查认证状态 |
| `POST` | `/onlyoffice/webhook` | OnlyOffice Document Server 保存回调 |

## ❓ 常见问题与排查

- **OnlyOffice 显示 HTML 内容或提示扩展名不匹配** — 检查 `server/templates/` 中的模板是否为真实 Office 文件（十六进制开头应为 `50 4B`）。
- **Document Server 下载文件失败（ECONNREFUSED）** — 设置 `DOC_SERVER_INTERNAL_HOST` 为 Document Server 容器可访问的地址（如 `http://host.docker.internal:3000`）。
- **OnlyOffice 提示"版本已变化，请刷新"** — 通常意味着文档密钥在会话之间发生了变化。确保 webhook 保存时不会修改 `nameVersions.json`。
- **JWT 验证失败** — 确认本应用与 Document Server 使用相同的 `DOC_SERVER_JWT_SECRET`。
- **最近编辑时间不更新** — 检查 webhook 下载 URL 是否可从应用容器内访问（查看服务端日志中的 `Rewrote webhook download URL`）。

## 📜 许可证

本项目采用 MIT 许可证。许可证全文见仓库根目录的 `LICENSE` 文件。

版权所有 (c) 2025-2026 TonyBlur
