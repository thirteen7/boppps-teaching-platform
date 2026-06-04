#!/bin/sh
set -e
cd /app

# ─────────────────────────────────────────────────────────────
#  大模型 API 配置向导 (首次启动时交互式配置)
# ─────────────────────────────────────────────────────────────
# 确保持久化配置目录存在
mkdir -p /app/config

# 如果存在持久化配置文件，先加载到环境变量
if [ -f /app/config/llm.env ]; then
    echo "[entrypoint] 加载 LLM 配置: /app/config/llm.env"
    . /app/config/llm.env
fi

# 导出所有 LLM 相关变量 (未设置的变量安全地展开为空)
export LLM_PROVIDER="${LLM_PROVIDER}"
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL}"
export OLLAMA_MODEL="${OLLAMA_MODEL}"
export OPENAI_BASE_URL="${OPENAI_BASE_URL}"
export OPENAI_API_KEY="${OPENAI_API_KEY}"
export OPENAI_MODEL="${OPENAI_MODEL}"

# 运行配置向导 (如果已有配置或非交互环境会静默跳过)
/docker-entrypoint-wizard.sh

# ─────────────────────────────────────────────────────────────
#  数据库初始化 & 默认数据
# ─────────────────────────────────────────────────────────────
python <<'PY'
from app import create_app, ensure_default_users
from extensions import db
from models import AIProviderConfig
import os

app = create_app()
with app.app_context():
    db.create_all()
    ensure_default_users()

    # ── 从环境变量创建 LLM provider (由配置向导或 -e 注入) ──
    provider_type = os.environ.get("LLM_PROVIDER", "").strip().lower()

    if provider_type == "openai_compatible":
        base_url = os.environ.get("OPENAI_BASE_URL", "").strip()
        api_key  = os.environ.get("OPENAI_API_KEY", "").strip()
        model    = os.environ.get("OPENAI_MODEL", "gpt-4").strip()

        existing = AIProviderConfig.query.filter_by(provider_type="openai_compatible").first()
        if not existing and base_url and model:
            provider = AIProviderConfig(
                provider_type="openai_compatible",
                name="OpenAI-Compatible (向导配置)",
                base_url=base_url,
                api_key=api_key,
                model=model,
                enabled=True,
                is_default=True,
            )
            db.session.add(provider)
            db.session.commit()
            print(f"[entrypoint] 已创建默认 OpenAI-compatible provider: {base_url} / {model}")

    elif provider_type == "ollama":
        base_url = os.environ.get("OLLAMA_BASE_URL", "").strip()
        model    = os.environ.get("OLLAMA_MODEL", "").strip()

        existing = AIProviderConfig.query.filter_by(provider_type="ollama").first()
        if not existing and base_url and model:
            provider = AIProviderConfig(
                provider_type="ollama",
                name="Ollama (向导配置)",
                base_url=base_url,
                api_key="",
                model=model,
                enabled=True,
                is_default=True,
            )
            db.session.add(provider)
            db.session.commit()
            print(f"[entrypoint] 已创建默认 Ollama provider: {base_url} / {model}")

    # ── 未指定 LLM_PROVIDER 但设置了 OLLAMA 变量 → 创建 Ollama provider ──
    if not provider_type:
        base_url = os.environ.get("OLLAMA_BASE_URL", "").strip()
        model    = os.environ.get("OLLAMA_MODEL", "").strip()
        if base_url and model:
            existing = AIProviderConfig.query.filter_by(provider_type="ollama").first()
            if not existing:
                provider = AIProviderConfig(
                    provider_type="ollama",
                    name="Ollama (默认)",
                    base_url=base_url,
                    api_key="",
                    model=model,
                    enabled=True,
                    is_default=True,
                )
                db.session.add(provider)
                db.session.commit()
                print(f"[entrypoint] 已从环境变量创建 Ollama provider: {base_url} / {model}")
PY

exec gunicorn --bind 0.0.0.0:5000 --workers 2 --timeout 120 'app:create_app()'
