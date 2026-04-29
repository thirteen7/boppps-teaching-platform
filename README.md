# BOPPPS Teaching Platform

基于 Flask + React 的教学管理与教学设计系统，支持课程管理、题库管理、资源上传、用户管理、系统日志，以及 AI 教学辅助配置。

## 项目简介

本项目面向教学场景，围绕 BOPPPS 教学设计流程提供一体化工作台，帮助教师完成课程组织、资源沉淀与教学数据管理。

## 主要功能

- 用户认证与权限控制（管理员/教师/学生）
- 课程管理与教学流程管理
- 题库与测评相关功能
- 教学资源上传与管理
- 系统日志与审计
- AI 参数配置与扩展能力

## 技术栈

- 后端: Flask, SQLAlchemy, JWT, PyMySQL
- 前端: React, Axios
- 数据库: MySQL 8
- 部署: Docker Compose（Nginx + Frontend + Backend + MySQL）

## 目录结构

```text
.
├─ frontend/                # React 前端 + Nginx 配置
├─ routes/                  # 后端路由
├─ services/                # 服务层
├─ static/                  # 静态资源/上传目录
├─ docker-compose.yml       # 容器编排
├─ Dockerfile.backend       # 后端镜像构建
├─ requirements.txt         # 后端依赖
└─ .env.example             # 环境变量模板
```

## 快速部署（Docker）

1. 复制环境变量模板

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

2. 启动服务

```bash
docker compose up -d --build
```

3. 访问系统

- 前端: `http://localhost:8080`
- API: `http://localhost:8080/api`

4. 停止服务

```bash
docker compose down
```

## 部署说明与注意事项

- 首次部署建议修改 `.env` 中的 `JWT_SECRET_KEY`，避免使用默认值。
- 数据库连接通过 `SQLALCHEMY_DATABASE_URI` 配置，可按需切换到外部 MySQL。
- MySQL 数据使用 Docker 卷 `mysql_data` 持久化，重建容器不会丢失数据。
- 前端通过 Nginx 反向代理 `/api` 到后端容器，无需前端写死后端地址。
- 若需上传大文件，可调整 `frontend/nginx.conf` 的 `client_max_body_size`。
- 如端口 `8080` 被占用，可在 `docker-compose.yml` 中修改映射端口。

## 常用运维命令

查看服务状态:

```bash
docker compose ps
```

查看日志:

```bash
docker compose logs -f
```

仅重启后端:

```bash
docker compose restart backend
```

## 开源仓库

GitHub: [https://github.com/thirteen7/boppps-teaching-platform](https://github.com/thirteen7/boppps-teaching-platform)
