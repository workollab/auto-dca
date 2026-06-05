# Deploying Auto DCA

Auto DCA is a **static site** — the entire decline-curve engine runs in the browser, so there's
no app server, database, or runtime to manage. Deployment is just: build the site and serve the
`app/dist/` folder from any static host.

```
npm run build  ->  app/dist/  ->  serve as static files (HTTPS)
```

## Build

```bash
npm install        # workspace install (engine + app)
npm run build      # builds the engine, then the app -> app/dist/
```

`app/dist/` is a self-contained static bundle (HTML, JS, CSS, sample data). Drop it on any host.

## Option A — a static host / CDN (simplest)

Point any static host at the build. Typical settings:

| Host                              | Build command   | Publish directory |
|-----------------------------------|-----------------|-------------------|
| Netlify / Vercel / Cloudflare Pages | `npm run build` | `app/dist`        |
| GitHub Pages                      | `npm run build` | `app/dist`        |
| Any S3 + CDN bucket               | `npm run build` | upload `app/dist` |

These provide HTTPS automatically. If you serve under a sub-path (e.g. `/auto-dca/`), set
`base` in `app/vite.config.ts` accordingly and rebuild.

## Option B — your own server (Caddy)

A reverse proxy that does automatic HTTPS makes this a two-minute job. An example
[`deploy/Caddyfile`](../deploy/Caddyfile) is included (gzip/zstd, immutable asset caching,
security headers, SPA fallback). Edit the hostname, then:

```bash
# on the server: install Caddy (see https://caddyserver.com/docs/install), create a web root,
# copy deploy/Caddyfile into Caddy's config, then:
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy issues and renews a Let's Encrypt certificate automatically once DNS resolves to the box.
(nginx/Apache work too — just serve `app/dist` as static files and add your own TLS.)

### Deploy the build

A small helper script, [`deploy/deploy.sh`](../deploy/deploy.sh), builds and rsyncs the bundle:

```bash
SSH_USER=user SSH_HOST=your-server DEPLOY_PATH=/var/www/auto-dca ./deploy/deploy.sh
# optional: SSH_PORT, SSH_KEY
```

## Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) builds the engine, runs the test
suite, and builds the app on every push and pull request, uploading `app/dist` as an artifact.
Wire that artifact into whatever hosting you use.

## Notes

- **Privacy**: the engine makes no backend calls — production data never leaves the visitor's
  browser. There's nothing to log or secure server-side beyond the static files.
- **Caching**: fingerprinted assets under `/assets/*` are immutable and long-cached; the HTML
  entry point is `no-cache`, so a new deploy is picked up immediately.
- **Rollback**: the build is deterministic and stateless — redeploy any previous build (or
  re-run a previous CI run). No migrations, no server state.
