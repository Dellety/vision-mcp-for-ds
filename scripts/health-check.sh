#!/usr/bin/env bash
# 部署自检：验证目标机环境是否就绪。
# 在部署目录（含 dist/、package.json）下执行。
set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
WARN=0

check() { # check "描述" "命令"
  local desc="$1" cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo "✅ $desc"
    PASS=$((PASS + 1))
  else
    echo "❌ $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "── Vision MCP for Reasonix 部署自检 ──"
echo ""

# 1. Node 版本 >= 18
check "Node.js >= 18" \
  "node -e 'require(\"assert\")(Number(process.versions.node.split(\".\")[0])>=18)'"

# 2. 构建产物存在
check "dist/index.js 存在" "test -f dist/index.js"

# 3. 生产依赖已装
check "node_modules 已安装 (@modelcontextprotocol)" \
  "test -d node_modules/@modelcontextprotocol"
check "node_modules 已安装 (zod)" \
  "test -d node_modules/zod"

# 4. API Key
PROFILE="${VISION_PROFILE:-local}"
BASEURL="${VISION_BASE_URL:-}"
if [ "$PROFILE" = "local" ] && [ -z "$BASEURL" ]; then
  echo "ℹ️  profile=local 且未设 baseUrl，API Key 非必需（本地模型）"
  WARN=$((WARN + 1))
elif [ -z "${VISION_API_KEY:-}" ]; then
  echo "⚠️  VISION_API_KEY 未设置（联网 API 需要它）"
  WARN=$((WARN + 1))
else
  echo "✅ VISION_API_KEY 已设置"
  PASS=$((PASS + 1))
fi

# 5. 端点可达性（仅对联网 profile 或 https baseUrl 探测）
SHOULD_PROBE=false
ENDPOINT="$BASEURL"
if [ "$PROFILE" = "zhipu" ] && [ -z "$ENDPOINT" ]; then
  ENDPOINT="https://open.bigmodel.cn/api/paas/v4/chat/completions"
  SHOULD_PROBE=true
elif [ "$PROFILE" = "openai" ] && [ -z "$ENDPOINT" ]; then
  ENDPOINT="https://api.openai.com/v1/chat/completions"
  SHOULD_PROBE=true
elif [ "$PROFILE" = "qwen" ] && [ -z "$ENDPOINT" ]; then
  ENDPOINT="https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
  SHOULD_PROBE=true
elif [[ "$ENDPOINT" == https://* ]]; then
  SHOULD_PROBE=true
fi

if [ "$SHOULD_PROBE" = true ]; then
  # chat/completions 端点对 GET 通常返回 405/401，-f 会失败；改用 -w 取 http_code
  CODE=$(curl -s -o /dev/null -m 8 -w "%{http_code}" "$ENDPOINT" 2>/dev/null || echo "000")
  if [ "$CODE" = "000" ]; then
    echo "❌ 端点不可达 ($ENDPOINT) —— 检查网络/代理"
    FAIL=$((FAIL + 1))
  else
    echo "✅ 端点可达 ($ENDPOINT, HTTP $CODE)"
    PASS=$((PASS + 1))
  fi
else
  echo "ℹ️  跳过端点探测（profile=local）"
fi

echo ""
echo "── 结果：通过 $PASS / 失败 $FAIL / 警告 $WARN ──"
[ "$FAIL" -eq 0 ]
