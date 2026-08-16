#!/usr/bin/env bash

# Synchronize only server-side source files that are already tracked by Git.
# Application containers run locally-built images, so backend/web/admin/mobile
# source trees and all local dependencies/outputs are deliberately excluded.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  DEPLOY_HOST=<ssh-host> npm run deploy:sync-sources -- <scope> [<scope> ...]

Scopes:
  deployment    docker-compose.prod.yml, Flyway migrations, and Nginx configs.
  official-site Tracked official-site source, synchronized independently.

Examples:
  DEPLOY_HOST=duolinting-cloud npm run deploy:sync-sources -- deployment
  DEPLOY_HOST=duolinting-cloud npm run deploy:sync-sources -- deployment official-site

This command never scans or transfers untracked files. In particular it omits
node_modules, dist, temp, caches, nested .git directories, and all .env files.
It also never deletes remote files, so the server production .env is preserved.
Any new server-side source file must be added to Git before synchronization.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$#" -eq 0 ]]; then
  usage >&2
  exit 2
fi

if [[ -z "${DEPLOY_HOST:-}" ]]; then
  printf 'DEPLOY_HOST is required, for example: DEPLOY_HOST=duolinting-cloud\n' >&2
  exit 2
fi

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
remote_dir="${DEPLOY_REMOTE_DIR:-/home/ubuntu/duolinting}"
cd "$root_dir"

sync_tracked() {
  local label="$1"
  shift
  local file_count
  file_count="$(git ls-files -- "$@" | wc -l | tr -d ' ')"

  if [[ "$file_count" -eq 0 ]]; then
    printf 'No tracked files found for %s.\n' "$label" >&2
    return 1
  fi

  printf 'Synchronizing %s (%s tracked files)\n' "$label" "$file_count"
  git ls-files -z -- "$@" | rsync -az --from0 --files-from=- \
    "$root_dir/" "$DEPLOY_HOST:$remote_dir/"
}

assert_no_untracked_files() {
  local label="$1"
  shift
  local untracked_files
  untracked_files="$(git status --porcelain --untracked-files=all -- "$@" | \
    sed -n 's/^?? //p')"

  if [[ -n "$untracked_files" ]]; then
    printf 'Refusing to sync %s: add these new server-side files to Git first:\n%s\n' \
      "$label" "$untracked_files" >&2
    return 1
  fi
}

for scope in "$@"; do
  case "$scope" in
    deployment)
      assert_no_untracked_files 'deployment configuration' \
        docker-compose.prod.yml infra/mysql/migrations infra/nginx
      sync_tracked 'deployment configuration' \
        docker-compose.prod.yml infra/mysql/migrations infra/nginx
      ;;
    official-site)
      assert_no_untracked_files 'official-site source' official-site
      sync_tracked 'official-site source' official-site
      ;;
    *)
      printf 'Unsupported sync scope: %s\n' "$scope" >&2
      usage >&2
      exit 2
      ;;
  esac
done

printf '%s\n' 'Tracked-source synchronization completed. Continue with the runbook migration and image-switch gates.'
