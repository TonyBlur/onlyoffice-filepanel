# OnlyOffice File Panel — Minimal Prototype

这是一个最小原型，演示如何基于 OnlyOffice Document Server 集成文件管理面板。

目录结构简要：

- backend/ — Node.js (Express) 后端，提供文件列表与编辑器页面
- frontend/ — React + Vite 前端，文件列表与编辑器页面
- data/files/ — 放置示例文档
- docker-compose.yml — 启动 documentserver、backend、frontend

配置:
- 在 `.env` 或 docker-compose 中设置 DOC_SERVER_URL，默认使用 http://docserver:80

启动（docker）:
1. docker-compose up --build

然后访问 http://localhost:3000
