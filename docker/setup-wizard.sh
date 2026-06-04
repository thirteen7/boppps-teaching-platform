#!/bin/sh
# ============================================================
#  大模型 API 配置向导 — LLM Setup Wizard
#  First-run interactive prompt that collects LLM backend
#  settings and persists them for subsequent container starts.
# ============================================================
set -e

CONFIG_FILE="${LLM_CONFIG_FILE:-/app/config/llm.env}"

# ── Guard: skip if config already exists ────────────────────
if [ -f "$CONFIG_FILE" ] && [ -s "$CONFIG_FILE" ]; then
    echo "[向导] 检测到已有配置文件 $CONFIG_FILE，跳过配置向导。"
    exit 0
fi

# ── Check for non-interactive environment ───────────────────
if [ ! -t 0 ]; then
    cat >&2 <<'MSG'

  [向导] 未检测到交互式终端 (stdin 不可用)。
  [向导] 跳过交互式配置，将使用环境变量或默认值启动。

  提示：如需进入交互式向导，请使用 docker run -it 启动容器，
  或通过 docker-compose.yml 的 environment: 传入 LLM 配置。

  支持的变量：
    LLM_PROVIDER=ollama | openai_compatible
    OLLAMA_BASE_URL=http://host.docker.internal:11434
    OLLAMA_MODEL=qwen3:30b
    OPENAI_BASE_URL=https://api.openai.com/v1
    OPENAI_API_KEY=sk-xxxx
    OPENAI_MODEL=gpt-4

MSG
    exit 0
fi

# ── Welcome ─────────────────────────────────────────────────
cat <<'WELCOME'

╔══════════════════════════════════════════════════════════════╗
║      欢迎使用 BOPPPS 教学设计平台 — 大模型 API 配置向导      ║
║                                                             ║
║  本向导将帮助您配置 AI 教学助手所需的大语言模型后端。         ║
║  您可以选择 Ollama (本地部署) 或任何 OpenAI 兼容 API。       ║
╚══════════════════════════════════════════════════════════════╝

提示：
  • 如果选择 Ollama，请确保 Ollama 已在宿主机运行并监听端口 11434
  • Docker 容器内请使用 host.docker.internal 替代 127.0.0.1
    (Linux 用户可能需要用 --add-host 或宿主机 IP)
  • 按 Ctrl+C 随时退出，配置不会保存

WELCOME

# ── Select provider ─────────────────────────────────────────
echo ""
echo "请选择 LLM 后端类型："
echo "  1) Ollama (本地部署，默认)"
echo "  2) OpenAI 兼容 API (如 DeepSeek、OpenAI、通义千问等)"
printf "请输入编号 [1/2] (默认 1): "
read -r provider_choice
provider_choice="${provider_choice:-1}"

LLM_PROVIDER="ollama"
case "$provider_choice" in
    2|openai|OpenAI|openai_compatible)
        LLM_PROVIDER="openai_compatible"
        ;;
    1|ollama|Ollama|*)
        LLM_PROVIDER="ollama"
        ;;
esac

# ── Collect common fields ───────────────────────────────────
echo ""
case "$LLM_PROVIDER" in
    ollama)
        echo ">>> Ollama 配置"
        printf "Ollama 服务地址 (默认 http://host.docker.internal:11434): "
        read -r OLLAMA_BASE_URL
        OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://host.docker.internal:11434}"

        printf "模型名称 (默认 qwen3:30b): "
        read -r OLLAMA_MODEL
        OLLAMA_MODEL="${OLLAMA_MODEL:-qwen3:30b}"

        # Write config file
        cat > "$CONFIG_FILE" <<EOF
# BOPPPS 教学平台 — LLM 配置 (由配置向导自动生成)
# 删除此文件并重启容器可重新进入配置向导
LLM_PROVIDER=$LLM_PROVIDER
OLLAMA_BASE_URL=$OLLAMA_BASE_URL
OLLAMA_MODEL=$OLLAMA_MODEL
EOF
        ;;

    openai_compatible)
        echo ">>> OpenAI 兼容 API 配置"
        printf "API 地址 (例如 https://api.openai.com/v1): "
        read -r OPENAI_BASE_URL
        OPENAI_BASE_URL="${OPENAI_BASE_URL:-https://api.openai.com/v1}"

        printf "API Key (输入不可见): "
        read -r -s OPENAI_API_KEY
        echo ""
        if [ -z "$OPENAI_API_KEY" ]; then
            echo "[警告] API Key 为空，某些服务可能无法使用。"
        fi

        printf "模型名称 (例如 gpt-4, deepseek-chat, qwen-plus): "
        read -r OPENAI_MODEL
        OPENAI_MODEL="${OPENAI_MODEL:-gpt-4}"

        # Write config file
        cat > "$CONFIG_FILE" <<EOF
# BOPPPS 教学平台 — LLM 配置 (由配置向导自动生成)
# 删除此文件并重启容器可重新进入配置向导
LLM_PROVIDER=$LLM_PROVIDER
OPENAI_BASE_URL=$OPENAI_BASE_URL
OPENAI_API_KEY=$OPENAI_API_KEY
OPENAI_MODEL=$OPENAI_MODEL
EOF
        ;;
esac

# Restrict file permissions
chmod 600 "$CONFIG_FILE"

echo ""
echo "✔ 配置已保存至 $CONFIG_FILE"

# ── Source the config into current environment ──────────────
echo "[向导] 加载配置到当前会话..."
. "$CONFIG_FILE"

# Export all variables for the app process
export LLM_PROVIDER OLLAMA_BASE_URL OLLAMA_MODEL \
       OPENAI_BASE_URL OPENAI_API_KEY OPENAI_MODEL 2>/dev/null || true

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  配置完成！系统即将启动。                                    ║"
echo "║  下次重启容器时将自动跳过此向导。                            ║"
echo "║  如需重新配置，请删除 $CONFIG_FILE 后重启容器。             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
