#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DIST_DIR="$ROOT_DIR/dist/offline-package"
IMAGES_DIR="$DIST_DIR/images"
APP_IMAGE="boppps-app:offline"
MYSQL_SOURCE_IMAGE="docker.m.daocloud.io/library/mysql:8.0"
MYSQL_TARGET_IMAGE="boppps-mysql:8.0-offline"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "缺少命令: $1" >&2
        exit 1
    fi
}

require_cmd docker

rm -rf "$DIST_DIR"
mkdir -p "$IMAGES_DIR" \
         "$DIST_DIR/docker/mysql/init" \
         "$DIST_DIR/config" \
         "$DIST_DIR/static/uploads/resources" \
         "$DIST_DIR/scripts"

echo "[1/5] 构建应用镜像 $APP_IMAGE"
# Docker Desktop on macOS may emit provenance/attestation manifests by default.
# Those extra manifests can make `docker save` fail with "content digest not found".
if docker buildx version >/dev/null 2>&1; then
    docker buildx build \
        --platform "$DOCKER_PLATFORM" \
        --provenance=false \
        --load \
        -t "$APP_IMAGE" \
        "$ROOT_DIR"
else
    docker build \
        --platform "$DOCKER_PLATFORM" \
        -t "$APP_IMAGE" \
        "$ROOT_DIR"
fi

echo "[2/5] 准备数据库镜像 $MYSQL_TARGET_IMAGE"
docker pull --platform "$DOCKER_PLATFORM" "$MYSQL_SOURCE_IMAGE"
docker tag "$MYSQL_SOURCE_IMAGE" "$MYSQL_TARGET_IMAGE"

echo "[3/5] 导出离线镜像"
docker save --platform "$DOCKER_PLATFORM" -o "$IMAGES_DIR/boppps-app-offline.tar" "$APP_IMAGE"
docker save --platform "$DOCKER_PLATFORM" -o "$IMAGES_DIR/boppps-mysql-8.0-offline.tar" "$MYSQL_TARGET_IMAGE"

echo "[4/5] 复制运行文件"
cp "$ROOT_DIR/docker-compose.offline.yml" "$DIST_DIR/docker-compose.yml"
cp "$ROOT_DIR/docker.env.example" "$DIST_DIR/.env.example"
cp "$ROOT_DIR/scripts/start-offline.sh" "$DIST_DIR/scripts/start-offline.sh"
cp "$ROOT_DIR/scripts/start-offline.bat" "$DIST_DIR/scripts/start-offline.bat"
cp "$ROOT_DIR/scripts/start-offline.command" "$DIST_DIR/scripts/start-offline.command"
cp "$ROOT_DIR/docs/offline-deployment.md" "$DIST_DIR/README-OFFLINE.md"
cp "$ROOT_DIR/docker/mysql/HOWTO.txt" "$DIST_DIR/docker/mysql/HOWTO.txt"

if [ -d "$ROOT_DIR/docker/mysql/init" ]; then
    cp -R "$ROOT_DIR/docker/mysql/init/." "$DIST_DIR/docker/mysql/init/"
fi

chmod +x "$DIST_DIR/scripts/start-offline.sh" "$DIST_DIR/scripts/start-offline.command"

cat > "$DIST_DIR/.env" <<EOF
DOCKER_PLATFORM=$DOCKER_PLATFORM
EOF

echo "[5/5] 生成压缩包"
(
    cd "$ROOT_DIR/dist"
    tar -czf offline-package.tar.gz offline-package
)

cat <<EOF

离线部署包已生成：
  目录: $DIST_DIR
  压缩包: $ROOT_DIR/dist/offline-package.tar.gz

交付给最终用户时，建议额外附带：
  1. Docker Desktop / Docker Engine 安装包
  2. 你的使用说明或默认账号信息
EOF
