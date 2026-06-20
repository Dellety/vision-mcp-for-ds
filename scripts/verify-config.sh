#!/usr/bin/env bash
# 配置解析验证：对照 spec 6.1 节用例表，逐项打印 loadConfig() 的解析结果。
# 用于人工核对配置加载逻辑是否正确（项目不引入测试框架）。
#
# 用法：
#   ./scripts/verify-config.sh                          # 默认：读 dist/config.js，无 env
#   VISION_PROFILE=zhipu ./scripts/verify-config.sh     # 指定 profile
#   VISION_PROFILE=foo ./scripts/verify-config.sh       # 期望：报错并列出可用值
set -uo pipefail
cd "$(dirname "$0")/.."

RUNNER='import("./dist/config.js").then(m => {
  try {
    const c = m.loadConfig();
    console.log(JSON.stringify(c, null, 2));
    process.exit(0);
  } catch (e) {
    console.error("THROWN: " + e.message);
    process.exit(2);
  }
});'

echo "── 配置解析结果 (VISION_PROFILE=${VISION_PROFILE:-<未设置>}) ──"
OUT=$(node -e "$RUNNER" 2>&1)
CODE=$?
echo "$OUT"
echo ""
if [ "$CODE" -eq 0 ]; then
  echo "✅ 解析成功"
else
  echo "❌ 解析抛错 (退出码 $CODE)"
fi
exit "$CODE"
