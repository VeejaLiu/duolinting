#!/usr/bin/env bash

# Synchronize only source files that are already tracked by Git. Production
# images are built from this exact server-side source tree, never from local
# dependency folders, generated output, temporary files, or local .env files.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  DEPLOY_HOST=<ssh-host> npm run deploy:sync-sources -- <scope> [<scope> ...]

Scopes:
  release       All Git-tracked project source required for server-side builds.

Examples:
  DEPLOY_HOST=duolinting-cloud npm run deploy:sync-sources -- release

This command never scans or transfers untracked files. In particular it omits
node_modules, dist, temp, caches, nested .git directories, and all .env files.
It preserves the server production .env. A release manifest removes only files
that were tracked by a previous release but were deleted from Git, so builds
cannot accidentally consume stale source files. On the first release after
adoption, it clears only Git-managed top-level source/configuration paths
before copying the tracked source; it never touches .env, backups, temp, or
Docker volumes.
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
  local destination="$2"
  shift 2
  local file_count
  file_count="$(git ls-files -- "$@" | wc -l | tr -d ' ')"

  if [[ "$file_count" -eq 0 ]]; then
    printf 'No tracked files found for %s.\n' "$label" >&2
    return 1
  fi

  printf 'Synchronizing %s (%s tracked files)\n' "$label" "$file_count"
  git ls-files -z -- "$@" | rsync -az --from0 --files-from=- \
    "$root_dir/" "$DEPLOY_HOST:$destination/"
}

sync_release() {
  local manifest_file
  local release_revision
  local managed_roots_file
  local remote_dir_quoted
  local remote_manifest
  local remote_next_manifest
  local remote_revision
  local remote_next_revision

  if ! git diff --quiet || ! git diff --cached --quiet; then
    printf 'Refusing to sync: commit tracked changes before a production release.\n' >&2
    return 1
  fi

  manifest_file="$(mktemp)"
  managed_roots_file="$(mktemp)"
  trap 'rm -f "$manifest_file" "$managed_roots_file"' RETURN
  git ls-files | LC_ALL=C sort > "$manifest_file"
  awk -F/ '{ print $1 }' "$manifest_file" | LC_ALL=C sort -u > "$managed_roots_file"
  release_revision="$(git rev-parse HEAD)"

  remote_dir_quoted="$(printf '%q' "$remote_dir")"
  remote_manifest="$remote_dir/.duolinting-release-manifest"
  remote_next_manifest="$remote_dir/.duolinting-release-manifest.next"
  remote_revision="$remote_dir/.duolinting-release-revision"
  remote_next_revision="$remote_dir/.duolinting-release-revision.next"

  # Before the first manifest exists, replace only source/configuration paths
  # that this Git checkout owns. It avoids stale deleted files without risking
  # production .env files, local backups, temporary artifacts, or Docker data.
  cat "$managed_roots_file" | ssh "$DEPLOY_HOST" "set -euo pipefail
root=$remote_dir_quoted
manifest=$(printf '%q' "$remote_manifest")
if [[ ! -f \"\$manifest\" ]]; then
  while IFS= read -r managed_root; do
    case \"\$managed_root\" in
      ''|.|..|.env|.env/*|temp|backups|node_modules|dist)
        printf 'Unsafe first-release managed path: %s\\n' \"\$managed_root\" >&2
        exit 1
        ;;
    esac
    target=\"\$root/\$managed_root\"
    if [[ -d \"\$target\" ]]; then
      rm -rf -- \"\$target\"
    else
      rm -f -- \"\$target\"
    fi
  done
fi
mkdir -p \"\$root\"
"

  sync_tracked 'release source' "$remote_dir"

  cat "$manifest_file" | ssh "$DEPLOY_HOST" "cat > $(printf '%q' "$remote_next_manifest")"
  printf '%s\n' "$release_revision" | ssh "$DEPLOY_HOST" "cat > $(printf '%q' "$remote_next_revision")"

  ssh "$DEPLOY_HOST" "set -euo pipefail
root=$remote_dir_quoted
previous=$(printf '%q' "$remote_manifest")
next=$(printf '%q' "$remote_next_manifest")
revision=$(printf '%q' "$remote_revision")
next_revision=$(printf '%q' "$remote_next_revision")
if [[ -f \"\$previous\" ]]; then
  while IFS= read -r stale_path; do
    case \"\$stale_path\" in
      ''|/*|*'..'*|.env|.env/*)
        printf 'Unsafe stale release path: %s\\n' \"\$stale_path\" >&2
        exit 1
        ;;
    esac
    rm -f -- \"\$root/\$stale_path\"
  done < <(comm -23 \"\$previous\" \"\$next\")
fi
mv -f \"\$next\" \"\$previous\"
mv -f \"\$next_revision\" \"\$revision\"
"

  printf 'Synchronized release revision %s\n' "$release_revision"
}

for scope in "$@"; do
  case "$scope" in
    release)
      sync_release
      ;;
    *)
      printf 'Unsupported sync scope: %s\n' "$scope" >&2
      usage >&2
      exit 2
      ;;
  esac
done

printf '%s\n' 'Tracked-source synchronization completed. Build named application images on the server, complete the Flyway gate, then switch only those services.'
