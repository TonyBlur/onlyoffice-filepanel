# ONLYOFFICE Document Server — 安装说明（for onlyoffice-filepanel）

本项目的 docker-compose 不包含 ONLYOFFICE Document Server（Document Server 需要单独部署）。这是因为 Document Server 的容器名在容器网络内可解析，但浏览器在宿主环境下通常无法解析容器名（例如 `http://docserver`），会导致前端无法加载 OnlyOffice 的脚本。

请按照下面步骤在本机或服务器上部署 ONLYOFFICE Document Server，并确保浏览器可访问到其地址，然后将该地址配置到本项目后端的 `DOC_SERVER_URL` 环境变量。

官方仓库（推荐）：
https://github.com/ONLYOFFICE/Docker-DocumentServer

快速开始（Docker run，宿主映射为 8080）：

```powershell
# 在宿主机上运行 Document Server 并把容器 80 端口映射到宿主 8080
docker run -i -t -d -p 8080:80 onlyoffice/documentserver:latest
```

或使用官方 docker-compose（参考仓库）：

```powershell
# clone 官方示例并启动
git clone https://github.com/ONLYOFFICE/Docker-DocumentServer.git
cd Docker-DocumentServer
# 按需修改 .env 或 docker-compose.yml 中的端口设置，然后
docker compose up -d
```

配置后端（示例）

- 若使用 `docker compose` 启动本项目（backend/frontend），请确保在环境变量中把 `DOC_SERVER_URL` 设置为浏览器可访问地址，例如：

```yaml
services:
  backend:
    environment:
      - DOC_SERVER_URL=http://localhost:8080
```

- 如果你在宿主机上运行 Document Server（8080:80），这就是合适的值：`http://localhost:8080`。

调试与排查

- 在浏览器打开编辑器时，Network 中应该能成功加载 `${DOC_SERVER_URL}/web-apps/apps/api/documents/api.js`（HTTP 200）。
- 如果出现 Mixed Content（页面为 HTTPS，而 Document Server 使用 HTTP），请改为在 HTTPS 下访问 Document Server（生产环境推荐将 Document Server 放到 HTTPS 子域，并使用反向代理）。

安全与生产注意

- 生产环境请使用 HTTPS 并把 Document Server 放到专用域（例如 `https://docs.example.com`）。
- 后端可以实现编辑器 token（JWT）签发以控制编辑权限（当前 prototype 中 token 留空）。