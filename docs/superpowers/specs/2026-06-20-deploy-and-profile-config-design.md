# 部署优化与 Profile 多预设配置 — 设计文档

> ⚠️ **历史文档说明**：本 spec 撰写于项目改名之前，文中包名/路径/tar 名仍为旧名 `vision-mcp-server`。
> 项目后已更名为 `vision-mcp-for-reasonix`，对应：包名 `vision-mcp-for-reasonix`、tar 包 `vision-mcp-for-reasonix-deploy-v1.1.0.tar.gz`、安装目录 `~/vision-mcp-for-reasonix`。
> 文中的设计决策（Profile 多预设、方案 B 部署、key 只走 env）仍然有效；涉及具体路径/产物名处请按新名理解。

- **日期**：2026-06-20
- **目标**：让 Vision MCP Server 能轻松部署到其它可直连公网的电脑，为运行 DeepSeek 的 Reasonix 终端 agent 提供基于智谱 GLM-4.6V-FlashX 联网 API 的视觉理解能力。
- **部署形态**：方案 B —— 一键打包 tar + 一键安装脚本（不发布 npm）。

---

## 1. 背景与问题

### 1.1 当前状态

项目是一个 OpenAI 兼容的视觉 MCP Server，通过 stdio 被 MCP 客户端（Claude Code / Reasonix）调用，对外提供 4 个视觉工具。现有配置机制：

- **配置来源**（`src/config.ts`）：环境变量 > `config.json` / `vision-mcp.config.json` > 默认值。
- **默认模型**：硬编码 `Qwen3-VL-32B`，端点 `baseUrl` 必填（不填抛错）。
- **配置样例**：`.env.example`、`config.example.json`、`claude-code-config.example.json` 三个示例文件，均指向 `localhost:8000`（本地模型场景）。

### 1.2 痛点

1. **没有联网 API 预设**：要用智谱 `open.bigmodel.cn`，每台机器都得手填完整端点 URL（`https://open.bigmodel.cn/api/paas/v4/chat/completions`）和模型名，容易写错。
2. **部署没有标准流程**：没有打包脚本，向其它电脑部署靠手工 scp + 手工装依赖，步骤容易遗漏。
3. **示例只面向 Claude Code**：Reasonix（DeepSeek 原生终端 agent，MCP 兼容）没有对应的配置示例。
4. **配置文件零散**：根目录有一个误命名的草稿文件 `baseUrl=https:-open.bigmodel.cn-.txt`，实际是手写的智谱配置草稿，内容应当被正式配置机制吸收。

### 1.3 目标场景

```
┌──────────────┐   MCP/stdio    ┌──────────────────────┐   HTTPS/Bearer   ┌─────────────────┐
│   Reasonix   │ ◄────────────► │  Vision MCP Server   │ ───────────────► │ 智谱 GLM-4.6V    │
│ (DeepSeek)   │                │  (本机 node 进程)     │                  │ open.bigmodel.cn│
└──────────────┘                └──────────────────────┘                  └─────────────────┘
                                         │
                                         ▼
                                 ┌──────────────┐
                                 │ 本地文件系统   │
                                 │ (图片/视频)    │
                                 └──────────────┘
```

- DeepSeek 在 Reasonix 里负责代码推理，没有视觉能力。
- 遇到截图/UI/图片时，Reasonix 自动调用 `vision` MCP 的 `analyze_image` / `ocr_image` 等工具，由智谱 GLM-4.6V 提供视觉，两者各司其职。

---

## 2. 设计决策

### 2.1 部署形态：方案 B（tar 包 + 脚本）

**选定方案 B**，理由：

| 维度 | 方案 A（npm 发布 + npx） | **方案 B（tar + 脚本，选定）** |
|------|------------------------|------------------------------|
| 部署步骤 | 1 行，但要发 npm | 拷 1 个 tar + 跑 2 条命令 |
| 依赖外部 registry | 是 | 否 |
| 适合内部/小范围分发 | 否（要发公开或私服） | **是** |
| 版本管理 | npm 版本号 | tar 文件名带版本号 |
| 离线部署 | 不支持 | **支持**（tar 自带代码，只需目标机能装 2 个 npm 依赖） |

生产依赖只有 `@modelcontextprotocol/sdk` 和 `zod` 两个纯 JS 包，无 native binding，跨平台 `npm ci --omit=dev` 安全且秒级完成。

### 2.2 配置策略：Profile 多预设

引入 `VISION_PROFILE` 环境变量（或 config.json 中的 `profile` 字段），预置 4 个 profile，每个 profile 自带正确端点和默认模型：

| Profile | baseUrl | 默认 model | 用途 |
|---------|---------|-----------|------|
| `zhipu` | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | `glm-4.6v-flashx` | **主推**：智谱联网 API |
| `openai` | `https://api.openai.com/v1/chat/completions` | `gpt-4o` | OpenAI |
| `qwen` | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | `qwen-vl-max` | 阿里通义千问 VL |
| `local` | `http://localhost:8000/v1/chat/completions` | `Qwen3-VL-32B` | 本地模型（保留原默认语义） |

**智谱端点验证**：经查证，`open.bigmodel.cn` 是标准 OpenAI 兼容，`Authorization: Bearer {api_key}` 直接可用，现有 `src/utils/api-client.ts` 无需改动即可对接。

**配置优先级**（从高到低）：

```
1. 显式环境变量 VISION_BASE_URL / VISION_MODEL / VISION_API_KEY / ...
2. config.json 中的显式字段 baseUrl / model / apiKey / ...
3. VISION_PROFILE / config.profile 指向的预设（填充未指定的字段）
4. 兜底默认值（profile=local 的预设）
```

> 关键规则：**显式 env / config.json 字段永远覆盖 profile**。这样既能让"只想用智谱"的用户一行配置启动，也能让"想换某个参数"的用户单点覆盖（例如用智谱端点但换成 `glm-4.6v-flash` 免费模型）。

### 2.3 API Key 管理：只走环境变量

- API Key **不写入任何提交到仓库的文件**（config.example.json、.env.example、mcp-config.example.json 一律留空或占位）。
- 运行时只从 `VISION_API_KEY` 环境变量或目标机本地 `.env`（已 gitignore）读取。
- 部署文档强调：key 只填在 Reasonix 的 MCP `env` 字段或目标机本地 `.env`。

---

## 3. 组件设计

### 3.1 配置层改造：`src/config.ts`

新增一个 profile 预设表常量，并改造 `loadConfig()`：

```typescript
// profile 预设：每个 profile 提供默认 baseUrl 和 model
const PROFILES: Record<string, { baseUrl: string; model: string }> = {
  zhipu:  { baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4.6v-flashx" },
  openai: { baseUrl: "https://api.openai.com/v1/chat/completions",            model: "gpt-4o" },
  qwen:   { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", model: "qwen-vl-max" },
  local:  { baseUrl: "http://localhost:8000/v1/chat/completions",             model: "Qwen3-VL-32B" },
};
```

**加载逻辑**（伪代码）：

```
file = loadConfigFile()              # 读 config.json / vision-mcp.config.json
profileName = env.VISION_PROFILE || file.profile || "local"
profile = PROFILES[profileName]      # 不存在则报错并列出可用 profile

baseUrl    = env.VISION_BASE_URL    || file.baseUrl    || profile.baseUrl
model      = env.VISION_MODEL       || file.model      || profile.model
apiKey     = env.VISION_API_KEY     || file.apiKey     || ""
maxTokens  = env.VISION_MAX_TOKENS  || file.maxTokens  || 4096
temperature= env.VISION_TEMPERATURE || file.temperature|| 0.7

if (!baseUrl) throw                 # 理论上不会发生（profile 总有兜底），保留防御
return { baseUrl, model, apiKey, maxTokens, temperature, profile: profileName }
```

**向后兼容**：
- 不设 `VISION_PROFILE` 的老用户 → 走 `local` profile，行为与现状完全一致（端点 `localhost:8000`、模型 `Qwen3-VL-32B`）。
- 显式设了 `VISION_BASE_URL` 的老用户 → 覆盖 profile，行为不变。

### 3.2 类型层：`src/types.ts`

`VisionConfig` 增加 `profile` 字段（用于启动日志展示当前生效 profile）：

```typescript
export interface VisionConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  maxTokens: number;
  temperature: number;
  profile?: string;   // 新增：记录生效的 profile 名
}
```

### 3.3 入口层：`src/index.ts`

启动日志补充 profile 信息（一行改动）：

```typescript
console.error(
  `Vision MCP Server started (profile: ${config.profile}, model: ${config.model}, endpoint: ${config.baseUrl})`
);
```

### 3.4 打包脚本：`scripts/pack.sh`（新增）

源机执行，生成部署 tar 包：

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. 构建
npm run build

# 2. 收集部署产物到临时目录
VERSION=$(node -p "require('./package.json').version")
STAGE=$(mktemp -d)
mkdir -p "$STAGE/vision-mcp-server"
cp -r dist package.json package-lock.json "$STAGE/vision-mcp-server/"
cp .env.example mcp-config.example.json "$STAGE/vision-mcp-server/" 2>/dev/null || true
cp scripts/health-check.sh "$STAGE/vision-mcp-server/scripts/" 2>/dev/null || true
cat > "$STAGE/vision-mcp-server/README-deploy.md" <<'EOF'
... 部署说明（见 3.6）...
EOF

# 3. 打 tar
OUT="dist/vision-mcp-server-deploy-v${VERSION}.tar.gz"
tar -czf "$OUT" -C "$STAGE" vision-mcp-server
rm -rf "$STAGE"
echo "✅ 打包完成: $OUT"
```

产物路径：`dist/vision-mcp-server-deploy-v1.0.0.tar.gz`。

### 3.5 自检脚本：`scripts/health-check.sh`（新增）

目标机执行，部署后快速验证环境是否就绪：

```bash
#!/usr/bin/env bash
set -uo pipefail
PASS=0; FAIL=0

check() { # check "描述" "命令"
  if eval "$2" >/dev/null 2>&1; then echo "✅ $1"; PASS=$((PASS+1));
  else echo "❌ $1"; FAIL=$((FAIL+1)); fi
}

# 1. Node 版本 >= 18
check "Node >= 18" "node -e 'require(\"assert\")(process.versions.node.split(\".\")[0]>=18)'"

# 2. 构建产物存在
check "dist/index.js 存在" "test -f dist/index.js"

# 3. 依赖已装
check "node_modules 已安装" "test -d node_modules/@modelcontextprotocol"

# 4. API Key 已设置
if [ -z "${VISION_API_KEY:-}" ]; then echo "⚠️  VISION_API_KEY 未设置（本地模型可忽略）"; else echo "✅ VISION_API_KEY 已设置"; PASS=$((PASS+1)); fi

# 5. 端点可达（仅当 profile=zhipu 或显式 baseUrl 是 https）
BASEURL="${VISION_BASE_URL:-}"
PROFILE="${VISION_PROFILE:-local}"
if [ "$PROFILE" = "zhipu" ] || [[ "$BASEURL" == https://* ]]; then
  ENDPOINT="${BASEURL:-https://open.bigmodel.cn/api/paas/v4/chat/completions}"
  check "视觉端点可达 ($ENDPOINT)" "curl -sf -o /dev/null -m 5 \"$ENDPOINT\""
fi

echo "---"; echo "通过 $PASS / 失败 $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
```

### 3.6 部署说明：`README-deploy.md`（打包进 tar，新增）

随 tar 分发的简明部署指南，内容要点：

```markdown
# Vision MCP Server 部署指南

## 前置
- Node.js >= 18（Reasonix 机器通常已具备）
- 智谱 API Key（https://open.bigmodel.cn 控制台获取）

## 安装
tar xzf vision-mcp-server-deploy-v*.tar.gz -C ~
cd ~/vision-mcp-server
npm ci --omit=dev              # 只装 2 个生产依赖，秒级完成
./scripts/health-check.sh      # 自检

## 接入 Reasonix
将以下配置加入 Reasonix 的 MCP 配置（位置见 Reasonix 文档）：
{
  "mcpServers": {
    "vision": {
      "command": "node",
      "args": ["/Users/xxx/vision-mcp-server/dist/index.js"],
      "env": {
        "VISION_PROFILE": "zhipu",
        "VISION_API_KEY": "你的智谱key"
      }
    }
  }
}

## 验证
在 Reasonix 里让它分析一张本地图片，应返回 GLM-4.6V 的描述。
```

### 3.7 配置示例文件更新

| 文件 | 改动 |
|------|------|
| `.env.example` | 重写，突出 `VISION_PROFILE` + `VISION_API_KEY` 为主路径，其余 profile/env 列注释 |
| `config.example.json` | 增加 `profile` 字段示例，apiKey 留空 |
| `claude-code-config.example.json` → **`mcp-config.example.json`** | 改名，内含 Reasonix 和 Claude Code 两段示例 |
| 根目录 `baseUrl=https:-open.bigmodel.cn-.txt` | **删除**（内容已被 zhipu profile 吸收） |

### 3.8 package.json 发布字段补全

为后续可能发布 npm 留好字段（当前不发，但字段补齐便于维护）：

```json
{
  "name": "vision-mcp-server",
  "version": "1.1.0",                        // 配置改造升 minor
  "repository": { "type": "git", "url": "https://github.com/Loveacup/vision-mcp-server.git" },
  "files": ["dist", "scripts", "README.md", ".env.example", "mcp-config.example.json"],
  "bin": { "vision-mcp-server": "dist/index.js" }
}
```

### 3.9 README.md 新增章节

在现有 README 中插入两节：

1. **「🚀 部署到其它电脑」**：方案 B 完整流程（源机 pack → 目标机 install → health-check）。
2. **「🤖 Reasonix + DeepSeek 集成」**：profile 表 + MCP 配置片段 + 验证方法。

更新「配置优先级」章节，加入 profile 这一层。

---

## 4. 数据流

### 4.1 部署流

```
源机: npm run build → scripts/pack.sh → dist/vision-mcp-server-deploy-v1.1.0.tar.gz
        │
        ▼ (任意方式拷贝: scp / U盘 / 网盘 / 邮件)
目标机: tar xzf ... -C ~ → cd ~/vision-mcp-server
        → npm ci --omit=dev → ./scripts/health-check.sh
        → 编辑 Reasonix MCP 配置（填 profile=zhipu + key）
        → 重启 Reasonix，验证
```

### 4.2 运行时配置解析流

```
Reasonix 启动 → spawn node dist/index.js，注入 env {VISION_PROFILE=zhipu, VISION_API_KEY=xxx}
   │
   ▼
loadConfig():
   读 config.json（部署机一般没有，跳过）
   → profileName = env.VISION_PROFILE || "local" → "zhipu"
   → profile = PROFILES.zhipu → { baseUrl: "https://open.bigmodel.cn/...", model: "glm-4.6v-flashx" }
   → baseUrl   = env.VISION_BASE_URL    || profile.baseUrl    （env 没设 → 用 profile）
   → model     = env.VISION_MODEL       || profile.model      （env 没设 → 用 profile）
   → apiKey    = env.VISION_API_KEY     || ""                 （= "xxx"）
   → 返回 { profile:"zhipu", baseUrl, model:"glm-4.6v-flashx", apiKey:"xxx", maxTokens:4096, temperature:0.7 }
   │
   ▼
index.ts 启动日志: "Vision MCP Server started (profile: zhipu, model: glm-4.6v-flashx, ...)"
```

---

## 5. 错误处理

| 场景 | 处理 |
|------|------|
| `VISION_PROFILE` 设了未知值（如 `VISION_PROFILE=xxx`） | `loadConfig()` 抛错：`Unknown profile "xxx". Available: zhipu, openai, qwen, local` |
| 既没设 profile 也没设 baseUrl | 走 `local` 兜底（localhost:8000），不再抛"baseUrl required"（向后兼容改进） |
| `health-check.sh` 中端点不可达 | 报 ❌ 并提示检查网络/key，非零退出 |
| `pack.sh` 时 `dist/` 不存在 | 先 `npm run build` 自动构建 |
| 目标机 Node < 18 | `health-check.sh` 报 ❌，提示升级 |

---

## 6. 测试策略

### 6.1 配置加载单元测试（手动验证清单）

| 用例 | 输入 | 预期 baseUrl | 预期 model |
|------|------|-------------|-----------|
| 默认（无任何配置） | 无 env 无 config | `localhost:8000/...` | `Qwen3-VL-32B` |
| zhipu profile | `VISION_PROFILE=zhipu` | `open.bigmodel.cn/...` | `glm-4.6v-flashx` |
| profile + 覆盖 model | `VISION_PROFILE=zhipu VISION_MODEL=glm-4.6v-flash` | `open.bigmodel.cn/...` | `glm-4.6v-flash` |
| 显式 baseUrl 覆盖 profile | `VISION_PROFILE=zhipu VISION_BASE_URL=http://x` | `http://x` | `glm-4.6v-flashx` |
| config.json 指定 profile | `{"profile":"openai"}` | `api.openai.com/...` | `gpt-4o` |
| 未知 profile | `VISION_PROFILE=foo` | 抛错并列出可用值 | — |

> 项目当前无测试框架，本 spec 不引入测试框架（YAGNI）。改为在 `health-check.sh` 外加一个 `scripts/verify-config.sh`，通过 `VISION_PROFILE=xxx node -e "import('./dist/config.js').then(...)"` 逐项打印解析结果，人工对照预期表。

### 6.2 端到端冒烟

部署后，在 Reasonix 中让 DeepSeek 调用 `analyze_image` 分析一张本地 PNG，确认返回 GLM-4.6V 的描述文本，无报错。

---

## 7. 不做的事（YAGNI）

- ❌ 不发布到 npm（方案 B 已选定；npm 字段只是补齐留用）。
- ❌ 不引入测试框架（项目无测试基础，手动验证清单足够）。
- ❌ 不实现 HTTP/SSE 远程 MCP（目标机可直连公网，stdio 本地进程足够）。
- ❌ 不做 profile 的动态热切换（重启进程改 env 即可）。
- ❌ 不加密打包 key（key 只走环境变量，不入包）。
- ❌ 不新增除 4 个之外的 profile。

---

## 8. 文件改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/config.ts` | 改 | 增加 PROFILES 表 + profile 加载逻辑 |
| `src/types.ts` | 改 | `VisionConfig` 增 `profile?` 字段 |
| `src/index.ts` | 改 | 启动日志加 profile |
| `.env.example` | 改 | 重写，突出 profile + key |
| `config.example.json` | 改 | 增 profile 字段 |
| `claude-code-config.example.json` | **删** | 改名为 mcp-config.example.json |
| `mcp-config.example.json` | **新增** | Reasonix + Claude Code 双示例 |
| `scripts/pack.sh` | **新增** | 打包脚本 |
| `scripts/health-check.sh` | **新增** | 部署自检脚本 |
| `scripts/verify-config.sh` | **新增** | 配置解析验证脚本 |
| `README-deploy.md` | **新增** | 随 tar 分发的部署指南 |
| `README.md` | 改 | 增部署章节、Reasonix 章节、profile 表 |
| `package.json` | 改 | version→1.1.0，补 repository/files 字段 |
| `baseUrl=https:-open.bigmodel.cn-.txt` | **删** | 内容已被 zhipu profile 吸收 |
| `.gitignore` | 改 | 确认 `dist/*.tar.gz` 已忽略（避免提交大包） |

---

## 9. 验收标准

1. 在源机执行 `./scripts/pack.sh`，生成 `dist/vision-mcp-server-deploy-v1.1.0.tar.gz`。
2. 解压到任意目录，`npm ci --omit=dev` + `./scripts/health-check.sh` 通过。
3. 设 `VISION_PROFILE=zhipu VISION_API_KEY=<真实key>`，启动 `node dist/index.js`，启动日志显示 `profile: zhipu, model: glm-4.6v-flashx`。
4. 配置接入 Reasonix，DeepSeek 能成功调用 `analyze_image` 分析本地图片并返回 GLM-4.6V 的描述。
5. 第 6.1 节 6 个配置解析用例全部符合预期。
6. 旧的「不设 profile、设 VISION_BASE_URL」用法行为不变（向后兼容）。
