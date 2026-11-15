#!/usr/bin/env bash
# Deploy to the production VM (DEPLOY.md). Run from the developer's machine:
#   VM_HOST=... VM_USER=... ZAFRA_DATA=/path/to/zafra-radar-research ./deploy.sh [options]
#     --with-rasters  also copy the raster tile directories (data/tiles/, ~650 MB) and the
#                     app's derived overview tiles (data/derived/tiles/, tools/build_overview_tiles.py)
#     --dry-run       print every command without running it
# 1. rsync the loader's input files, data/derived (without its tiles/) and (optionally) the
#    library's raster tiles with the derived overview tiles to the VM, keeping their paths
#    relative to the library root; nothing remote is ever deleted.
#    The file list is the loader's own (python -m app.loader --list-inputs), so it cannot
#    drift; it is computed even with --dry-run (local and read-only).
# 2. ssh: git pull in the app checkout, compose up --build with docker-compose.prod.yml,
#    then load every site.
# Optional: ZAFRA_DERIVED (default data/derived), PYTHON (default $ZAFRA_DATA/.venv/bin/python,
# any Python with PyYAML).
set -euo pipefail

REMOTE_ROOT=/srv/zafra
REMOTE_APP=$REMOTE_ROOT/app
COMPOSE="docker compose -f docker-compose.prod.yml"

die() { echo "deploy.sh: $*" >&2; exit 1; }

dry_run=0
with_rasters=0
for arg in "$@"; do
  case $arg in
    --dry-run) dry_run=1 ;;
    --with-rasters) with_rasters=1 ;;
    -h | --help) sed -n '2,17p' "$0"; exit 0 ;;
    *) die "unknown option: $arg (see --help)" ;;
  esac
done

missing=()
for var in VM_HOST VM_USER ZAFRA_DATA; do
  [[ -n ${!var:-} ]] || missing+=("$var")
done
((${#missing[@]} == 0)) || die "missing environment variable(s): ${missing[*]} (see DEPLOY.md)"

cd "$(dirname "$0")"
ZAFRA_DERIVED=${ZAFRA_DERIVED:-data/derived}
PYTHON=${PYTHON:-$ZAFRA_DATA/.venv/bin/python}
target="$VM_USER@$VM_HOST"
[[ -d $ZAFRA_DATA ]] || die "ZAFRA_DATA is not a directory: $ZAFRA_DATA"
[[ -d $ZAFRA_DERIVED ]] || die "ZAFRA_DERIVED is not a directory: $ZAFRA_DERIVED (run tools/build_alerts.py)"
[[ -x $PYTHON ]] || die "no Python at $PYTHON; set PYTHON to one with PyYAML"
if ((with_rasters)); then
  [[ -d $ZAFRA_DATA/data/tiles ]] || die "--with-rasters: no $ZAFRA_DATA/data/tiles"
  [[ -d $ZAFRA_DERIVED/tiles ]] ||
    die "--with-rasters: no $ZAFRA_DERIVED/tiles (run tools/build_overview_tiles.py --site all)"
fi

# Print a command (shell-quoted), then run it unless --dry-run.
run() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
  ((dry_run)) || "$@"
}

inputs=$(mktemp)
trap 'rm -f "$inputs"' EXIT
echo "+ (cd api && ZAFRA_DATA=$ZAFRA_DATA $PYTHON -B -m app.loader --site all --list-inputs) > $inputs"
(cd api && ZAFRA_DATA=$ZAFRA_DATA "$PYTHON" -B -m app.loader --site all --list-inputs) >"$inputs" ||
  die "could not list the loader's input files (see the error above)"
[[ -s $inputs ]] || die "the loader listed no input files"
echo "# $(wc -l <"$inputs" | tr -d ' ') input files:"
sed 's/^/#   /' "$inputs"

# 1. data (no --delete anywhere)
run rsync -a --human-readable --stats --files-from="$inputs" "$ZAFRA_DATA/" "$target:$REMOTE_ROOT/data/"
run rsync -a --human-readable --stats --exclude=/tiles/ "$ZAFRA_DERIVED/" "$target:$REMOTE_ROOT/derived/"
if ((with_rasters)); then
  # explicit destinations: macOS openrsync ignores the /./ marker of --relative. The remote
  # data directory mirrors the library root, so its data/tiles/ is under $REMOTE_ROOT/data/.
  run rsync -a --human-readable --stats "$ZAFRA_DATA/data/tiles/" "$target:$REMOTE_ROOT/data/data/tiles/"
  run rsync -a --human-readable --stats "$ZAFRA_DERIVED/tiles/" "$target:$REMOTE_ROOT/derived/tiles/"
fi

# 2. app
remote="set -e
cd $REMOTE_APP
test -f .env || { echo 'no $REMOTE_APP/.env (DEPLOY.md, first-time setup)' >&2; exit 1; }
git pull --ff-only
git log -1 --format='deploying %h %s'
$COMPOSE up -d --build --wait
$COMPOSE exec -T api python -m app.loader --site all"
echo "# remote script:"
sed 's/^/#   /' <<<"$remote"
run ssh "$target" "$remote"
