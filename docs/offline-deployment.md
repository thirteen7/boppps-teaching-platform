# 离线部署说明

这套离线包是给最终使用者准备的，目标是让对方在没有外网、网络很差、或者不想现场下载依赖的情况下，也能把系统启动起来。

## 你需要提前准备什么

在一台可以联网的机器上执行一次打包：

```bash
./scripts/prepare-offline-package.sh
```

如果你的目标用户主要是 Windows 电脑，保持默认即可；脚本会默认打出 `linux/amd64` 离线镜像。

如果你明确要发给 Apple Silicon Mac，可以这样打包：

```bash
DOCKER_PLATFORM=linux/arm64 ./scripts/prepare-offline-package.sh
```

执行后会生成：

- `dist/offline-package/`
- `dist/offline-package.tar.gz`

这两个产物里已经包含：

- 项目的应用镜像
- MySQL 镜像
- 离线专用 `docker-compose.yml`
- 小白启动脚本 `scripts/start-offline.sh`
- Windows 双击脚本 `scripts/start-offline.bat`
- macOS 双击脚本 `scripts/start-offline.command`
- 平台配置文件 `.env`
- 数据库初始化目录

## 交付给最终用户时，还建议额外附带

- `Docker Desktop` 安装包，或目标系统对应的 `Docker Engine` 安装包
- 一个简短的文字说明，例如“先安装 Docker，再双击脚本”

注意：
应用本身可以做到离线部署，但 Docker 运行环境本体不在本仓库里，通常需要你另外把安装包也放进 U 盘或压缩包。

## 最终用户怎么启动

假设用户已经安装好了 Docker，并且 Docker 已经启动：

```bash
cd offline-package
./scripts/start-offline.sh
```

如果是 Windows 用户，也可以直接双击：

```text
scripts/start-offline.bat
```

如果是 macOS 用户，也可以双击：

```text
scripts/start-offline.command
```

启动完成后访问：

```text
http://localhost:5000
```

默认账号：

- `admin / 123`
- `teacher / 123`
- `student / 123`

## 常用命令

查看容器状态：

```bash
docker compose -f docker-compose.yml ps
```

查看日志：

```bash
docker compose -f docker-compose.yml logs -f
```

停止服务：

```bash
docker compose -f docker-compose.yml down
```

## 这个方案解决了什么

它解决的是：

- 不需要现场 `docker build`
- 不需要现场拉基础镜像
- 不需要现场下载 `pip` 依赖
- 不需要现场下载 `npm` 依赖

它没有自动解决的是：

- 用户电脑上还没装 Docker
- Docker Desktop 因权限或虚拟化未开启而无法运行
- 端口 `5000` 或 `3307` 被本机其他程序占用

如果你还想继续往前走一步，我下一轮可以再帮你补：

- 一个“打包 Docker 安装器”的交付目录结构
- 一个“老师看得懂”的图文部署手册
- 一个“一键检查端口和 Docker 是否正常”的预检脚本
