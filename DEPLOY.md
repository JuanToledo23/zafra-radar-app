# Deployment

One Ubuntu VM serves https://zafraradar.earth (`www.` redirects to the root). `docker-compose.prod.yml`: Caddy (`Caddyfile`) is the only service with ports (80, 443), serves the web build and proxies `/api` to the api; the api and PostGIS have no published ports.

**VM prerequisites.** Docker Engine with the compose v2 plugin; an SSH user in the `docker` group; ports 80 and 443 open; DNS A records for `zafraradar.earth` and `www.zafraradar.earth` pointing at the VM before the first start (Caddy requests the certificates then).

**First-time setup** (on the VM; a private repository needs a deploy key):

```bash
sudo mkdir -p /srv/zafra/data /srv/zafra/derived && sudo chown -R "$USER" /srv/zafra
git clone https://github.com/JuanToledo23/zafra-radar-app.git /srv/zafra/app
printf '%s\n' "POSTGRES_PASSWORD=$(openssl rand -hex 24)" 'SITE_ADDRESS="zafraradar.earth, www.zafraradar.earth"' \
  ZAFRA_DATA=/srv/zafra/data ZAFRA_DERIVED=/srv/zafra/derived > /srv/zafra/app/.env && chmod 600 /srv/zafra/app/.env
```

**Deploy** (from the developer's machine, after pushing; the VM pulls `origin`): `VM_HOST=… VM_USER=… ZAFRA_DATA=/path/to/zafra-radar-research ./deploy.sh [--with-rasters] [--dry-run]`. It copies the loader's input files (`python -m app.loader --list-inputs`) and `data/derived/` with rsync (never deleting), then runs `git pull`, `compose up -d --build --wait` and the loader for all sites over ssh.

**Verify:** `curl -s https://zafraradar.earth/api/health` gives `{"status":"ok","db":"ok"}`; `curl -s -o /dev/null -w '%{http_code} %{size_download}\n' -H 'Accept-Encoding: gzip' https://zafraradar.earth/api/tiles/morelos/12/919/1832.pbf` gives `200` and about 87 KB (178 KB uncompressed).

**Roll back** to a previous commit (the database keeps its data; add `--recreate-schema` to a loader run if the schema differs):

```bash
ssh "$VM_USER@$VM_HOST" 'cd /srv/zafra/app && git checkout <commit> && docker compose -f docker-compose.prod.yml up -d --build --wait'
```

Run `git checkout main` there before the next `deploy.sh` (`git pull` fails on a detached HEAD).
