# syntax=docker/dockerfile:1

FROM docker.m.daocloud.io/library/node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && npm install
COPY frontend/ ./
ENV CI=true
RUN npm run build

FROM docker.m.daocloud.io/library/python:3.12-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

COPY . .
COPY --from=frontend-build /app/frontend/build ./frontend/build

# CRA emits /static/js, /static/css under build/static — merge into Flask static/ next to uploads
RUN mkdir -p static/uploads/resources /app/config && \
    if [ -d frontend/build/static ]; then \
      cp -a frontend/build/static/. static/; \
    fi

COPY docker/entrypoint.sh     /docker-entrypoint.sh
COPY docker/setup-wizard.sh   /docker-entrypoint-wizard.sh
RUN chmod +x /docker-entrypoint.sh /docker-entrypoint-wizard.sh

EXPOSE 5000

ENTRYPOINT ["/docker-entrypoint.sh"]
