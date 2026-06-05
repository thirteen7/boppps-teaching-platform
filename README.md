# BOPPPS Teaching Platform

一个面向教学场景的 BOPPPS 教学平台，前后端一体，支持课程管理、题库管理、教学资源上传、系统日志、用户管理，以及基于 LLM 的 AI 配置与分析能力。

## 功能概览

- 用户登录、注册、修改密码
- 角色管理：`admin`、`teacher`、`student`
- 课程与章节管理
- BOPPPS 教学流程内容管理
- 题库管理与测验分析
- 教学资源上传、下载、预览
- 系统日志查看
- AI / LLM 提供方配置与连通性测试
- Docker 一键部署

## 项目结构

```text
boppps-teaching-platform/
├── app.py                # Flask 应用入口
├── config.py             # 配置项
├── models.py             # 数据模型
├── routes/               # API 路由
├── services/             # 业务服务
├── frontend/             # React 前端
├── docker-compose.yml    # Docker 编排
├── Dockerfile            # 后端镜像构建
└── tests/                # 后端测试
```

## 环境要求

- Python 3.10+
- Node.js 18+（仅前端本地开发需要）
- MySQL 8.0
- Docker / Docker Compose（推荐）

## 本地运行

### 1. 启动后端

```bash
pip install -r requirements.txt
set SQLALCHEMY_DATABASE_URI=mysql+pymysql://koppps:rootroot@localhost:3306/koppps?charset=utf8mb4
set JWT_SECRET_KEY=super-secret-key
python app.py
```

后端默认运行在 `http://127.0.0.1:5000`

### 2. 启动前端

```bash
cd frontend
npm install
npm start
```

前端默认运行在 `http://localhost:3000`

### 3. 构建前端生产包

如果希望后端直接托管前端静态资源，需要先构建前端：

```bash
cd frontend
npm run build
```

## Docker 运行

推荐直接使用 `docker-compose.yml`：

```bash
docker compose up --build
```

启动后：

- 前端 / 后端统一访问：`http://localhost:5000`
- MySQL：`localhost:3307`

## 默认账号

项目首次启动后会自动创建以下默认账号：

- 管理员：`admin / 123`
- 教师：`teacher / 123`
- 学生：`student / 123`

## 测试

后端测试：

```bash
pytest
```

前端测试：

```bash
cd frontend
npm test
```

端到端测试：

```bash
cd frontend
npm run test:e2e
```

## 配置说明

常用环境变量：

- `SQLALCHEMY_DATABASE_URI`：数据库连接串
- `JWT_SECRET_KEY`：JWT 密钥
- `OLLAMA_BASE_URL`：Ollama 地址
- `OLLAMA_MODEL`：Ollama 模型名

如果使用 Docker Compose，数据库连接通常已经在 `docker-compose.yml` 中配置好。

## 说明

- 后端入口在 `app.py`
- 前端源码在 `frontend/src`
- 上传资源默认保存到 `static/uploads/resources`
- AI 配置可以在管理员首次登录后通过页面向导完成

