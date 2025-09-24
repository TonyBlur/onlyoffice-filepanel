# Environment variables for onlyoffice-filepanel

This document lists environment variables supported by the backend and compose, how to set the ONLYOFFICE Document Server JWT secret, and how to verify everything is working.

## Backend service (supported environment variables)

- `PORT` - port the backend listens on (default: `4000`).
- `JWT_SECRET` - secret used by backend for admin login JWT (default: `your-secret-key`).
- `ADMIN_PASSWORD` - password for admin login (default: `admin123`).
- `DOC_SERVER_URL` - browser-accessible URL for ONLYOFFICE Document Server (example: `http://localhost` or `https://docs.example.com`). This URL is injected into the editor HTML so the browser can load the Document Server script.
- `DOC_SERVER_INTERNAL` - internal network address of Document Server that backend may use when making server-to-server requests inside the docker network (example: `http://onlyoffice-documentserver:80`).
- `DOC_SERVER_JWT_SECRET` - (optional) JWT secret used to sign the editor configuration/token. If your Document Server is configured to require JWT, set this to the same secret that the Document Server uses.

## Frontend service (supported environment variables)

- `IN_DOCKER` - if set to `1`, the `vite.config.js` uses the internal container backend URL (`http://backend:4000`).
- `VITE_BACKEND_URL` - when `IN_DOCKER` is not set, this can point the frontend dev server to the host backend (example: `http://localhost:4000`).

## How to obtain the Document Server default secret

If you used the official ONLYOFFICE Docker image, a random secret is generated automatically if a custom secret has not been added. To read the default secret from a running container, run (replace CONTAINER with your container id or name):

```bash
sudo docker exec CONTAINER /var/www/onlyoffice/documentserver/npm/json -f /etc/onlyoffice/documentserver/local.json 'services.CoAuthoring.secret.session.string'
```

That command prints the secret stored inside Document Server's configuration JSON. Use that value as `DOC_SERVER_JWT_SECRET` in the backend's environment variables.

## How to configure the secret in docker-compose

Example snippet to add to `docker-compose.yml` (backend service):

```yaml
services:
  backend:
    build: ./backend
    environment:
      - DOC_SERVER_URL=http://localhost
      - DOC_SERVER_INTERNAL=http://onlyoffice-documentserver:80
      - DOC_SERVER_JWT_SECRET=your-secret-here
```

Prefer using an external `.env` file or Docker secrets for production deployments. Example using `.env`:

```
DOC_SERVER_JWT_SECRET=your-secret-here
```

and in `docker-compose.yml`:

```yaml
    environment:
      - DOC_SERVER_JWT_SECRET=${DOC_SERVER_JWT_SECRET}
```

## How to verify token is injected and valid

1. After setting `DOC_SERVER_JWT_SECRET` in the backend container env, rebuild and restart the backend:

```powershell
cd path/to/onlyoffice-filepanel
docker compose up -d --build backend
```

2. Request the editor page for any file and verify the returned HTML contains a non-empty `docConfig.token` field. For example:

```powershell
curl http://localhost:4000/editor/yourfile.docx -o editor.html
Get-Content editor.html | Select-String "docConfig.token"
```

3. If your Document Server requires JWT and the token is present, attempt to open the editor in a browser. If you still see "The document security token is not correctly formed", verify the Document Server is using the same secret (see command above to read it).

## Security notes

- Do not commit secrets to the repository. Use `.env` files excluded by `.gitignore`, or Docker secrets / environment management systems in production.
- Prefer HTTPS when exposing Document Server to the internet.

## Troubleshooting

- If `docConfig.token` is empty after you set `DOC_SERVER_JWT_SECRET`, ensure the backend container was rebuilt and restarted so the environment variable is available at runtime.
- If Document Server still rejects the token, verify both sides (backend and Document Server) use the exact same secret string. Also ensure there are no leading/trailing whitespace differences.
- If Document Server is behind a reverse proxy, make sure the browser can reach the `DOC_SERVER_URL` you configured.

---

If you want, I can now:
- add `DOC_SERVER_JWT_SECRET` to `docker-compose.yml` with a temporary secret and rebuild backend for an end-to-end test; or
- provide a secure `.env` snippet and commands for you to run locally to set the secret and restart backend.