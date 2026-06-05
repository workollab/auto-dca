# Deploying Auto DCA to workollab-02

Auto DCA is a **static site** — the entire decline-curve engine runs in the browser, so there's
no app server, database, or runtime to manage. Deployment is just: build `app/dist` and serve
it behind Caddy (which handles HTTPS automatically).

```
build (npm run build)  ->  app/dist/  ->  rsync to /var/www/auto-dca  ->  Caddy serves it
```

Two ways to ship it: **manual** (one command) or **automated** (GitHub Actions on push to
`main`). Both are below.

---

## 0. Prerequisites

- A subdomain pointing at workollab-02 — e.g. `autodca.workollab.com` (A/AAAA DNS record to the
  box's IP). Update the hostname in `deploy/Caddyfile` to match.
- SSH access to the box.
- Node 22 + npm locally (for manual deploys); CI uses the version in `.nvmrc`.

---

## 1. Create the GitHub repo (one time)

The repo is already initialised locally with an initial commit on `main`. To publish it under the
Workollab org/account and push:

```bash
# with the GitHub CLI (replace <OWNER> with the org or username)
gh repo create <OWNER>/auto-dca --public --source=. --remote=origin --push

# or manually
git remote add origin git@github.com:<OWNER>/auto-dca.git
git push -u origin main
```

Pushing to `main` triggers CI (build + engine tests). Deploy stays skipped until the secrets in
§3b are set.

---

## 2. One-time VPS setup (workollab-02)

```bash
# 2.1 Install Caddy (Debian/Ubuntu) — skip if already installed
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# 2.2 Create the web root
sudo mkdir -p /var/www/auto-dca
sudo chown -R "$USER":www-data /var/www/auto-dca

# 2.3 Install the site config
#     Copy deploy/Caddyfile into Caddy's config (edit the hostname first).
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile          # or import it from the main Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

If Caddy already serves other sites from one `Caddyfile`, paste the `autodca.workollab.com { … }`
block from `deploy/Caddyfile` into it (or use `import`), rather than overwriting the whole file.

Once DNS resolves, Caddy issues a Let's Encrypt certificate on first request — HTTPS is automatic.

---

## 3a. Deploy — manual (simplest)

From your machine:

```bash
SSH_USER=<user> SSH_HOST=workollab-02 DEPLOY_PATH=/var/www/auto-dca ./deploy/deploy.sh
# optional: SSH_PORT=2222  SSH_KEY=~/.ssh/your_key
```

This builds the engine + app and rsyncs `app/dist/` to the server (with `--delete`, so the web
root mirrors the build exactly). Refresh the site — done.

---

## 3b. Deploy — automated (GitHub Actions)

`.github/workflows/ci.yml` builds and tests on every push/PR, and **deploys on push to `main`
once these repository secrets exist** (Settings → Secrets and variables → Actions):

| Secret        | Example                  | Notes                                   |
|---------------|--------------------------|-----------------------------------------|
| `SSH_HOST`    | `203.0.113.10` or host   | workollab-02 address                     |
| `SSH_USER`    | `deploy`                 | deploy user on the box                   |
| `SSH_KEY`     | *(private key contents)* | the **private** half of a deploy keypair |
| `DEPLOY_PATH` | `/var/www/auto-dca`      | web root from §2.2                       |
| `SSH_PORT`    | `22` (optional)          | only if non-standard                     |

Create a dedicated deploy keypair and authorise it on the box:

```bash
ssh-keygen -t ed25519 -f deploy_key -N '' -C 'auto-dca-deploy'
ssh-copy-id -i deploy_key.pub <user>@workollab-02      # or append deploy_key.pub to ~/.ssh/authorized_keys
# paste the contents of deploy_key (the private file) into the SSH_KEY secret, then delete it locally
```

Until `SSH_HOST` is set, the deploy job logs a notice and skips — CI stays green.

---

## Rollback & ops notes

- **Rollback**: re-run a previous green Actions run, or `git revert` and push. The static build
  is deterministic; there's no migration/state to undo.
- **Cache**: fingerprinted assets under `/assets/*` are immutable and long-cached; `index.html`
  is `no-cache`, so a new deploy is picked up immediately.
- **Logs**: `/var/log/caddy/auto-dca.log`; `journalctl -u caddy` for the service.
- **Health**: it's static — if Caddy is up and files exist, the site is up. No process to babysit.
- **Privacy**: the engine makes no backend calls; production data never leaves the visitor's
  browser. Nothing to log or secure server-side beyond the static files.
