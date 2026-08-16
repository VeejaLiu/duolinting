#!/usr/bin/env bash

# Build selected production images locally, then deliver the exact tagged
# images to a server. Database migration and container switching are kept out
# of this script so their backup and Flyway gates cannot be bypassed.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  DEPLOY_HOST=<ssh-host> npm run deploy:images -- <service> [<service> ...]

Services:
  backend web-app admin mobile-app official-site

Optional environment variables:
  BUILD_PLATFORM=linux/amd64              Docker platform for production images.
  DEPLOY_ENV_FILE=.env.production.example Local Compose build environment file.

The production Compose definition applies each service's stable image tag. This
script builds locally with --pull=false, streams docker image save to the
server's docker image load, and requires exact local and remote image-ID
matches. It never builds, migrates, or switches services on the server.
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
cd "$root_dir"

deploy_env_file="${DEPLOY_ENV_FILE:-.env.production.example}"
build_platform="${BUILD_PLATFORM:-linux/amd64}"

if [[ ! -f "$deploy_env_file" ]]; then
  printf 'Local Compose environment file does not exist: %s\n' "$deploy_env_file" >&2
  exit 2
fi

image_for_service() {
  case "$1" in
    backend) printf '%s\n' 'duolinting-backend:latest' ;;
    web-app) printf '%s\n' 'duolinting-web-app:latest' ;;
    admin) printf '%s\n' 'duolinting-admin:latest' ;;
    mobile-app) printf '%s\n' 'duolinting-mobile-app:latest' ;;
    official-site) printf '%s\n' 'duolinting-official-site:latest' ;;
    *)
      printf 'Unsupported deployable service: %s\n' "$1" >&2
      exit 2
      ;;
  esac
}

services=("$@")
images=()

for service in "${services[@]}"; do
  image_for_service "$service" >/dev/null
done

printf 'Building local production images for: %s\n' "${services[*]}"
# Plain progress exposes each service's "transferring context" size. It must
# remain source-sized; a hundreds-of-megabytes or gigabytes context means an
# ignore rule has regressed and the release must stop for investigation.
DOCKER_DEFAULT_PLATFORM="$build_platform" docker compose \
  --progress plain \
  -p duolinting-preflight \
  -f docker-compose.prod.yml \
  --env-file "$deploy_env_file" \
  build --pull=false "${services[@]}"

for service in "${services[@]}"; do
  image="$(image_for_service "$service")"
  image_id="$(docker image inspect --format '{{.Id}}' "$image")"
  image_platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image")"

  if [[ "$image_platform" != "$build_platform" ]]; then
    printf 'Image %s has platform %s; expected %s\n' \
      "$image" "$image_platform" "$build_platform" >&2
    exit 1
  fi

  # Assert the production tag against the immutable image ID before export.
  docker image tag "$image_id" "$image"
  images+=("$image")
done

printf 'Loading production-tagged images on %s\n' "$DEPLOY_HOST"
docker image save "${images[@]}" | ssh "$DEPLOY_HOST" 'sudo docker image load >/dev/null'

for index in "${!services[@]}"; do
  service="${services[$index]}"
  image="${images[$index]}"
  local_image_id="$(docker image inspect --format '{{.Id}}' "$image")"
  remote_image_id="$(ssh "$DEPLOY_HOST" "sudo docker image inspect --format '{{.Id}}' '$image'")"

  if [[ "$local_image_id" != "$remote_image_id" ]]; then
    printf 'Image ID mismatch for %s: local=%s remote=%s\n' \
      "$service" "$local_image_id" "$remote_image_id" >&2
    exit 1
  fi

  printf 'Verified %-14s %s\n' "$service" "$local_image_id"
done

printf '%s\n' 'Image delivery completed. Follow the runbook: complete the source-sync and Flyway gates, then switch only these services with --no-build --no-deps.'
