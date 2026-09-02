#!/usr/bin/env bash

# Build the explicitly selected application images on the production server.
# Source synchronization, Flyway, and container switching stay separate so a
# failed build cannot silently change data or replace a running container.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  DEPLOY_HOST=<ssh-host> npm run deploy:build-server -- <service> [<service> ...]

Services:
  backend web-app admin mobile-app official-site

Optional environment variables:
  DEPLOY_REMOTE_DIR=/home/ubuntu/duolinting  Server checkout directory.
  MIN_FREE_GIB=6                              Minimum free disk before building.
  BUILDKIT_BUILDER=duolinting-buildkit        Dedicated docker-container builder.
  BUILDKIT_MEMORY_LIMIT=1280m                 Memory limit for the builder.
  BUILDKIT_CPU_QUOTA=200000                   CPU quota (2 CPUs at 100000us period).

Run deploy:sync-sources -- release first. This command verifies that the
server has the same committed source revision, then builds only the named
application images on the server with --pull=false. It never migrates the
database or switches containers.
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
min_free_gib="${MIN_FREE_GIB:-6}"
buildkit_builder="${BUILDKIT_BUILDER:-duolinting-buildkit}"
buildkit_memory_limit="${BUILDKIT_MEMORY_LIMIT:-1280m}"
buildkit_cpu_quota="${BUILDKIT_CPU_QUOTA:-200000}"
cd "$root_dir"

image_for_service() {
  case "$1" in
    backend) printf '%s\n' 'duolinting-backend:latest' ;;
    web-app) printf '%s\n' 'duolinting-web-app:latest' ;;
    admin) printf '%s\n' 'duolinting-admin:latest' ;;
    mobile-app) printf '%s\n' 'duolinting-mobile-app:latest' ;;
    official-site) printf '%s\n' 'duolinting-official-site:latest' ;;
    *)
      printf 'Unsupported application service: %s\n' "$1" >&2
      exit 2
      ;;
  esac
}

services=("$@")
for service in "${services[@]}"; do
  image_for_service "$service" >/dev/null
done

release_revision="$(git rev-parse HEAD)"
remote_dir_quoted="$(printf '%q' "$remote_dir")"
services_quoted="$(printf '%q ' "${services[@]}")"

if ! [[ "$min_free_gib" =~ ^[0-9]+$ ]]; then
  printf 'MIN_FREE_GIB must be a whole number, got: %s\n' "$min_free_gib" >&2
  exit 2
fi

if ! [[ "$buildkit_builder" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
  printf 'BUILDKIT_BUILDER contains unsupported characters: %s\n' "$buildkit_builder" >&2
  exit 2
fi

if ! [[ "$buildkit_memory_limit" =~ ^[0-9]+[mMgG]$ ]]; then
  printf 'BUILDKIT_MEMORY_LIMIT must be an integer with m or g suffix, got: %s\n' \
    "$buildkit_memory_limit" >&2
  exit 2
fi

if ! [[ "$buildkit_cpu_quota" =~ ^[0-9]+$ ]]; then
  printf 'BUILDKIT_CPU_QUOTA must be a whole number, got: %s\n' "$buildkit_cpu_quota" >&2
  exit 2
fi

memory_number="${buildkit_memory_limit%?}"
memory_unit="${buildkit_memory_limit: -1}"
case "${memory_unit,,}" in
  m) buildkit_memory_bytes=$((memory_number * 1024 * 1024)) ;;
  g) buildkit_memory_bytes=$((memory_number * 1024 * 1024 * 1024)) ;;
esac

buildkit_builder_quoted="$(printf '%q' "$buildkit_builder")"
buildkit_memory_limit_quoted="$(printf '%q' "$buildkit_memory_limit")"
buildkit_cpu_quota_quoted="$(printf '%q' "$buildkit_cpu_quota")"

printf 'Building production images on %s for: %s\n' "$DEPLOY_HOST" "${services[*]}"
ssh "$DEPLOY_HOST" "set -euo pipefail
cd $remote_dir_quoted
test -f .duolinting-release-revision
test \"\$(cat .duolinting-release-revision)\" = '$release_revision'
free_kib=\$(df -Pk / | awk 'NR == 2 { print \$4 }')
required_kib=\$(( $min_free_gib * 1024 * 1024 ))
if (( free_kib < required_kib )); then
  printf 'Insufficient free disk for a server build: %s KiB available, %s GiB required\\n' \\
    \"\$free_kib\" '$min_free_gib' >&2
  exit 1
fi

builder=$buildkit_builder_quoted
builder_memory=$buildkit_memory_limit_quoted
builder_cpu_quota=$buildkit_cpu_quota_quoted
builder_container=\"buildx_buildkit_${buildkit_builder}0\"
if ! sudo docker buildx inspect \"\$builder\" >/dev/null 2>&1; then
  sudo docker buildx create --name \"\$builder\" --driver docker-container \\
    --driver-opt \"memory=\$builder_memory\" \\
    --driver-opt \"cpu-quota=\$builder_cpu_quota\" >/dev/null
fi
builder_driver=\$(sudo docker buildx inspect \"\$builder\" | awk -F': ' '\$1 == \"Driver\" { print \$2; exit }')
test \"\$builder_driver\" = docker-container || {
  printf 'BuildKit builder %s must use docker-container, got %s\\n' \"\$builder\" \"\$builder_driver\" >&2
  exit 1
}
sudo docker buildx inspect --bootstrap \"\$builder\" >/dev/null
actual_memory=\$(sudo docker inspect --format '{{.HostConfig.Memory}}' \"\$builder_container\")
actual_cpu_quota=\$(sudo docker inspect --format '{{.HostConfig.CpuQuota}}' \"\$builder_container\")
test \"\$actual_memory\" = '$buildkit_memory_bytes' || {
  printf 'BuildKit builder %s memory mismatch: %s bytes\\n' \"\$builder\" \"\$actual_memory\" >&2
  exit 1
}
test \"\$actual_cpu_quota\" = \"\$builder_cpu_quota\" || {
  printf 'BuildKit builder %s CPU quota mismatch: %s\\n' \"\$builder\" \"\$actual_cpu_quota\" >&2
  exit 1
}
printf 'Using BuildKit builder %s memory=%s cpu-quota=%s\\n' \"\$builder\" \"\$builder_memory\" \"\$builder_cpu_quota\"
sudo docker compose --progress plain -p duolinting -f docker-compose.prod.yml --env-file .env \\
  build --builder \"\$builder\" --pull=false $services_quoted
"

for service in "${services[@]}"; do
  image="$(image_for_service "$service")"
  remote_image="$(ssh "$DEPLOY_HOST" "sudo docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' '$image'")"
  case "$remote_image" in
    sha256:*' linux/amd64') ;;
    *)
      printf 'Unexpected server image for %s: %s\n' "$service" "$remote_image" >&2
      exit 1
      ;;
  esac
  printf 'Built %-14s %s\n' "$service" "$remote_image"
done

printf '%s\n' 'Server image build completed. Follow the runbook Flyway gate, then switch only these services with --no-build --no-deps.'
