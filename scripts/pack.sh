#!/usr/bin/env bash
# 打包部署 tar 包：dist/ + package.json + package-lock.json + 配置示例 + 自检脚本 + 部署说明。
# 在源机（开发机）执行，产物输出到 dist/vision-mcp-for-reasonix-deploy-v<version>.tar.gz
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. 构建（确保 dist/ 最新）
echo "▶ 构建 TypeScript ..."
npm run build

# 1b. 清理构建副产物：dist/ 下不应出现任何 config.json（resolveJsonModule 可能残留）
#     防止本地实际配置（含 API Key）被打进部署包。
rm -f dist/config.json

# 2. 收集部署产物到临时目录
VERSION=$(node -p "require('./package.json').version")
STAGE="$(mktemp -d)"
PKG_DIR="$STAGE/vision-mcp-for-reasonix"
mkdir -p "$PKG_DIR/scripts"

# 拷贝 dist/ 时显式排除 config.json（防御性，即便上面漏删也不会进包）
find dist -type f ! -name 'config.json' | while read -r f; do
  mkdir -p "$PKG_DIR/$(dirname "$f")"
  cp "$f" "$PKG_DIR/$f"
done
cp package.json package-lock.json "$PKG_DIR/"
cp .env.example                  "$PKG_DIR/" 2>/dev/null || true
cp config.example.json           "$PKG_DIR/" 2>/dev/null || true
cp mcp-config.example.json       "$PKG_DIR/" 2>/dev/null || true
cp scripts/health-check.sh       "$PKG_DIR/scripts/" 2>/dev/null || true
cp scripts/verify-config.sh      "$PKG_DIR/scripts/" 2>/dev/null || true

# 2b. 密钥泄露防护：扫描打包目录，若发现疑似 API Key 则中止。
#     匹配智谱 key 形态（hex.hex 或 hex.基64）及常见 apiKey 字段非空赋值。
if grep -rEn 'apiKey["'"'"']?\s*:\s*"[^"]{20,}"' "$PKG_DIR" \
      --include='*.json' --include='*.js' --include='*.md' --include='.env*' 2>/dev/null \
   | grep -vE '"your-|占位|示例|example|<|替换|实际";?$' ; then
  echo "❌ 中止：打包目录检测到疑似真实 API Key，请检查上述文件。" >&2
  rm -rf "$STAGE"
  exit 1
fi

# 打包进 tar 的部署说明（pack.sh 自身不打入，避免循环引用）
cat > "$PKG_DIR/README-deploy.md" <<'EOF'
# Vision MCP for Reasonix 部署指南

## 前置要求
- Node.js >= 18（装 Reasonix 的机器通常已具备）
- 智谱 API Key（https://open.bigmodel.cn 控制台获取）

## 安装步骤
```bash
tar xzf vision-mcp-for-reasonix-deploy-v*.tar.gz -C ~
cd ~/vision-mcp-for-reasonix
npm ci --omit=dev              # 只装 2 个生产依赖（sdk + zod），秒级完成
./scripts/health-check.sh      # 部署自检
```

## 接入 Reasonix（DeepSeek 终端 agent）
将以下配置加入 Reasonix 的 MCP 配置文件（位置见 Reasonix 官方文档）：

```json
{
  "mcpServers": {
    "vision": {
      "command": "node",
      "args": ["/你/的实际/路径/vision-mcp-for-reasonix/dist/index.js"],
      "env": {
        "VISION_PROFILE": "zhipu",
        "VISION_API_KEY": "你的智谱key"
      }
    }
  }
}
```

## 验证
在 Reasonix 里让 DeepSeek 分析一张本地图片，应返回 GLM-4.6V 的描述文本。
启动日志应为：`Vision MCP for Reasonix started (profile: zhipu, model: glm-4.6v-flashx, ...)`

## 可用 Profile
| profile | 供应商 | 默认模型 |
|---------|--------|---------|
| zhipu   | 智谱   | glm-4.6v-flashx |
| openai  | OpenAI | gpt-4o |
| qwen    | 通义千问 VL | qwen-vl-max |
| local   | 本地模型 | Qwen3-VL-32B |

换模型不换供应商：加 `VISION_MODEL` 覆盖。
换端点：加 `VISION_BASE_URL` 覆盖，或换 `VISION_PROFILE`。
EOF

# 3. 打 tar
OUT="dist/vision-mcp-for-reasonix-deploy-v${VERSION}.tar.gz"
tar -czf "$OUT" -C "$STAGE" vision-mcp-for-reasonix
rm -rf "$STAGE"

echo ""
echo "✅ 打包完成: $OUT"
echo "   将该文件拷贝到目标机，解压后运行 npm ci --omit=dev 即可。"
