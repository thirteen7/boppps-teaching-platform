#!/bin/sh
set -eu

PACKAGE_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
IMAGES_DIR="$PACKAGE_DIR/images"
COMPOSE_FILE="$PACKAGE_DIR/docker-compose.yml"

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "缺少命令: $1" >&2
        exit 1
    fi
}

require_cmd docker

if [ ! -f "$IMAGES_DIR/boppps-app-offline.tar" ]; then
    echo "未找到镜像文件: $IMAGES_DIR/boppps-app-offline.tar" >&2
    exit 1
fi

if [ ! -f "$IMAGES_DIR/boppps-mysql-8.0-offline.tar" ]; then
    echo "未找到镜像文件: $IMAGES_DIR/boppps-mysql-8.0-offline.tar" >&2
    exit 1
fi

mkdir -p "$PACKAGE_DIR/config" "$PACKAGE_DIR/static/uploads/resources"

if [ ! -f "$PACKAGE_DIR/.env" ] && [ -f "$PACKAGE_DIR/.env.example" ]; then
    cp "$PACKAGE_DIR/.env.example" "$PACKAGE_DIR/.env"
fi

echo "[1/3] 导入应用镜像"
docker load -i "$IMAGES_DIR/boppps-app-offline.tar"

echo "[2/3] 导入数据库镜像"
docker load -i "$IMAGES_DIR/boppps-mysql-8.0-offline.tar"

echo "[3/3] 启动服务"
docker compose -f "$COMPOSE_FILE" up -d

cat <<'EOF'

部署完成。
访问地址:
  http://localhost:5000

默认账号:
  admin / 123
  teacher / 123
  student / 123

查看状态:
  docker compose -f docker-compose.yml ps

查看日志:
  docker compose -f docker-compose.yml logs -f
EOF
