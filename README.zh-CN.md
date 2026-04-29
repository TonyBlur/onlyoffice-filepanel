# OnlyOffice File Panel<br> — OnlyOffice 极简文件管理面板

[English](./README.md) | 简体中文

## ✨ 主要功能
- 在面板中列出、上传、创建、删除 Office 文档（docx、pptx、xlsx、pdf 等）。
- 通过 OnlyOffice Document Server 打开并在线编辑文档（使用 JWT 保护）。
- 管理员可进行批量删除等操作。
- 支持拖拽上传文件和文件搜索。

## 🗂️ 项目结构
```
onlyoffice-filepanel/
├── server/          # Express 后端：文件管理 API、OnlyOffice webhook 等
│   ├── data/        # 文件持久化存储（挂载为主机卷）
│   └── templates/   # 新建文件用的空白模板
├── web/             # React 18 + Ant Design 5 前端
├── server.js        # 统一入口（同时提供 API 和静态前端）
├── package.json     # 合并后的依赖
├── Dockerfile       # 多阶段构建 → 单一镜像
└── docker-compose.yml  # 单服务，端口 4000
```

## 🚀 快速开始

本项目**不包含** ONLYOFFICE Document Server，需要单独部署并配置相关环境变量。

- 推荐使用 Docker + docker-compose 运行完整环境。
- 本地开发：需要 Node.js（v18+）和 npm。

### 环境变量说明
| 变量 | 说明 |
|---|---|
| `DOC_SERVER_URL` | 浏览器可访问的 Document Server 地址（如 `http://docs.example.com`） |
| `DOC_SERVER_JWT_SECRET` | 与 Document Server 共享的 JWT 密钥 |
| `DOC_SERVER_INTERNAL_HOST` | *（可选）* Document Server 用于回调本应用的内部地址（如 `http://host.docker.internal:4000`） |
| `ADMIN_PASSWORD` | 管理员登录密码 |
| `PORT` | 应用监听端口（默认 `4000`） |
| `APP_EXTERNAL_PORT` | docker-compose 中映射到宿主机的端口（默认 `4000`） |
| `HOST_FILES_PATH` | 文件卷的宿主机路径（默认使用命名卷 `files_data`） |

### 模板说明
- 在 `server/templates/` 目录放置对应扩展名的空白模板：`blank.docx`、`blank.pptx`、`blank.xlsx`、`blank.pdf`。
- 请使用真实的 Office 二进制文件（docx/pptx/xlsx 格式为 ZIP，十六进制开头为 `50 4B`）。**不要使用 HTML 占位文件**，否则 OnlyOffice 会提示扩展名不匹配。

### 使用 Docker Compose（推荐）
1. 复制或创建 `.env` 文件，填入所需变量：
   ```env
   DOC_SERVER_URL=http://localhost:8380
   DOC_SERVER_JWT_SECRET=your-secret
   ADMIN_PASSWORD=admin123
   ```
2. 启动服务：
   ```bash
   docker-compose up --build
   ```
3. 浏览器访问 **http://localhost:4000**

### 本地开发
1. 构建前端：
   ```bash
   cd web
   npm install
   npm run build
   ```
2. 从仓库根目录启动服务：
   ```bash
   npm install
   DOC_SERVER_JWT_SECRET=your-secret node server.js
   ```
3. 打开 **http://localhost:4000**

   若需要前端热更新，在 `web/` 目录运行 `npm run dev`，并将 Vite 代理指向 `http://localhost:4000`。

### 安装字体
请参阅 [安装字体](./Install_Fonts.zh-CN.md)

## 📡 API 接口
| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/files?page=1&perPage=10` | 获取文件列表（支持分页） |
| `GET` | `/files/:name` | 下载/直接访问文件 |
| `POST` | `/api/files/create` | 基于模板创建新文件 `{ name, format }` |
| `POST` | `/api/files/upload` | 上传文件（multipart/form-data，字段名 `file`） |
| `DELETE` | `/api/files/:name` | 删除文件 |
| `GET` | `/api/editor-config/:name` | 获取签名后的编辑器配置 JSON |
| `POST` | `/api/login` | 管理员登录 `{ password }` |
| `POST` | `/onlyoffice/webhook` | Document Server 保存回调 |

## ❓ 常见问题与排查
- **OnlyOffice 显示 HTML 内容或提示扩展名不匹配** — 检查 `server/templates/` 中的模板是否为真实 Office 文件（十六进制开头应为 `50 4B`）。
- **Document Server 下载文件失败（ECONNREFUSED）** — 设置 `DOC_SERVER_INTERNAL_HOST` 为 Document Server 容器可访问的地址（如 `http://host.docker.internal:4000`）。
- **JWT 验证失败** — 确认本应用与 Document Server 使用相同的 `DOC_SERVER_JWT_SECRET`。

## 📜 许可证
本项目采用 MIT 许可证。许可证全文见仓库根目录的 `LICENSE` 文件。
版权所有：TonyBlur © 2025
