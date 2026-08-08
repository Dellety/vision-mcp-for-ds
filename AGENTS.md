# AGENTS.md — 项目修改记录

本文件记录 vision-mcp-for-ds 项目的重要改动，供后续 AI agent / 开发者快速了解项目状态。

## 2026-08-08: 完善多客户端配置指南 (v1.3.0 文档)

**背景**：原 README 用一个「通用 JSON」示例覆盖所有客户端，但三个客户端格式各异（Reasonix 用 TOML、ZCode 用 JSON、OpenCode 用 JSONC），尤其 OpenCode 不允许在 mcp 配置里写 API key，一刀切示例会误导。

**调研结论**：
- Reasonix：`~/.reasonix/config.toml`，`[[plugins]]` 段，TOML 格式，key 在 env 里
- ZCode：`~/.zcode/cli/config.json`，`mcp.servers` 下，JSON 格式，key 在 env 里
- OpenCode：`~/.config/opencode/opencode.jsonc`，`mcp` 字段，JSONC 格式，**不支持在配置里写 key**（写了被拒/清除）。解决：用 `cwd` 字段指向部署目录，server 通过 `config.json` 读 key（config.ts 的 `process.cwd()` 查找逻辑正好满足，无需改代码）

**改动**（纯文档，无代码改动）：
- README「接入客户端」章节重写：按客户端分列（折叠式），各给从真实配置提取的准确格式
- OpenCode 单独说明 key 走 config.json 的两步操作（配 cwd + 建 config.json）
- mcp-config.example.json 重写为配置速查表（按客户端分段）
- README 部署章节补 OpenCode 需额外建 config.json 的提示
- 修 README 版本号残留（v1.2.0 → v1.3.0）

## 2026-08-08: 剔除 WorkBuddy 兼容 + 清理调试代码 (v1.3.0)

**背景**：端到端测试发现 WorkBuddy（v5.3.8）存在工具触发不稳定的问题——其「图片输入」开关与 MCP 工具路由冲突：
- 勾选图片输入 → WorkBuddy 把原图直接塞进 messages 发给 DS V4（纯文本模型）→ 报 `unknown variant image_url`
- 取消图片输入 + 直接发图 → 前置拦截「当前模型暂不支持图片」
- 纯文字+路径 → DS V4 不主动调工具（工具未可靠注入 tools 声明）
- 仅「勾选→报错→取消→说继续」特定顺序能触发一次 MCP 调用（副作用，不可复现）

**诊断证据**：vision server 加调试日志后，`/tmp/vision-mcp-debug.log` 始终为空——证明 WorkBuddy 从未把请求发给我们的 stdio server。问题在 WorkBuddy 客户端层面，非本 server 代码问题。Reasonix 配置正确时可正常调用。

**改动**：
- 从 v1.3.0 支持列表中剔除 WorkBuddy，README/METHODOLOGY/mcp-config.example.json/pack.sh 同步改为「Reasonix / ZCode」
- README 增加客户端兼容性说明，指向 `workbuddy-compat` 分支
- 清理 index.ts 的临时调试日志（debugLog / appendFileSync / wrapTool 的 name 参数）
- 版本号 1.2.0 → 1.3.0

**后续**：在 `workbuddy-compat` 分支研究 WorkBuddy 的 connector-proxy 机制与工具注入策略，待找到稳定 trigger 或 WorkBuddy 修复后再合并。

## 2026-08-08: 重定位为通用视觉桥 + 新增 opencode profile (v1.2.0)

**目标**：项目从「专为 Reasonix」转为「给 DS V4 等纯文本模型补视觉的通用 MCP 桥」，跨 Reasonix / ZCode / WorkBuddy；接入 OpenCode Go 套餐的视觉模型（MiMo-V2.5 / GLM-5.2 / Kimi K3 等）。

**背景调研**：动手前对比了社区竞品（ghbalf/llm-vision-mcp、farhanic017/opencode-vision、Capetlevrai/clipboard-vision-mcp），确认 MCP 视觉桥模式正确、本项目的 profile 多预设 + 部署脚本是差异化优势，予以保留并增强。

### 核心改动

1. **改名 vision-mcp-for-reasonix → vision-mcp-for-ds**（11 个文件）
   - package.json: name / bin / description / repository.url / keywords（移除 reasonix，加 opencode/ds/mimo）/ version 1.1.0→1.2.0
   - src/index.ts: MCP server name + 启动/错误日志
   - scripts/pack.sh / health-check.sh: 部署目录、tar 名、自检标题
   - README.md 重写、METHODOLOGY.md 同步（架构图 MCP Client 改为 Reasonix/ZCode/WorkBuddy）
   - mcp-config.example.json: 去掉 reasonix/claude_code 分段，改为通用示例
   - ⚠️ **GitHub 远程仓库需用户手动改名**（本地引用已改，remote URL 待 `git remote set-url`）

2. **新增 `opencode` profile**（`src/config.ts`）
   - baseUrl: `https://opencode.ai/zen/go/v1/chat/completions`，model: `mimo-v2.5`
   - `DEFAULT_PROFILE` 从 `local` 改为 `opencode`
   - 去掉 `as string` 强制断言；新增 `resolveNumber()` 防 NaN/空串

3. **API 客户端健壮性**（`src/utils/api-client.ts`）
   - 加 `AbortSignal.timeout(30_000)`，30s 超时
   - 对 429/5xx 指数退避重试（最多 2 次，500ms→1000ms）；4xx/超时不重试（避免重复计费）

4. **文件处理安全**（`src/utils/file-handler.ts`）
   - 图片上限收紧 100MB→20MB，视频保留 100MB（标注云端通常拒）
   - 修 bug：`resolveVideoSource` 补 `isVideoMime` 校验（原来任何文件都会被编码发出）
   - 超限错误信息更友好（提示改用 URL）

5. **index.ts 去重**：抽 `wrapTool(fn)` 高阶函数，4 段重复 try/catch 收敛为 4 行

6. **analyze-video 工具描述**：标注「本地视频 base64 编码，大文件可能被云端拒，建议用 URL」

### 验证状态
- ✅ `npm run build` 通过
- ✅ `VISION_PROFILE=opencode ./scripts/verify-config.sh` 输出 mimo-v2.5 + opencode.ai 端点
- ✅ `VISION_PROFILE=foo ./scripts/verify-config.sh` 报错并列出 5 个可用 profile
- ✅ `grep -ri reasonix src/ scripts/ *.json *.md`（排除 docs/ 历史 spec）零残留
- ⏳ 端到端冒烟（真实 OpenCode Go + MiMo 调用 analyze_image）待用户验证

## 2026-06-20: 部署优化与 Profile 多预设配置 (v1.1.0)

**目标**：让 MCP Server 能轻松部署到其它电脑，为运行 DeepSeek 的 Reasonix 终端 agent 提供基于智谱 GLM-4.6V-FlashX 联网 API 的视觉能力。

**设计文档**：`docs/superpowers/specs/2026-06-20-deploy-and-profile-config-design.md`

### 核心改动

1. **Profile 多预设**（`src/config.ts`）：引入 `VISION_PROFILE` 环境变量，预置 4 个供应商 profile：
   - `zhipu`（智谱 GLM-4.6V，主推） / `openai` / `qwen` / `local`（默认，向后兼容）
   - 配置优先级：显式 env > config.json > profile 预设 > 兜底
   - `src/types.ts` 的 `VisionConfig` 新增 `profile` 字段；`src/index.ts` 启动日志展示 profile

2. **方案 B 一键部署**（不发布 npm）：
   - 源机：`npm run pack` → `dist/vision-mcp-for-reasonix-deploy-v1.1.0.tar.gz`
   - 目标机：`tar xzf ... -C ~` → `npm ci --omit=dev` → `./scripts/health-check.sh`
   - 3 个脚本：`scripts/pack.sh`（打包）、`scripts/health-check.sh`（自检）、`scripts/verify-config.sh`（配置解析验证）

3. **API Key 只走环境变量**：key 不进任何提交到仓库的文件。

### ⚠️ 重要安全事项

- **pack.sh 内置密钥泄露防护**：打包前会删除 `dist/config.json`（tsc 的 `resolveJsonModule` 副产物，可能含本地实际配置/key），并扫描打包目录，发现疑似真实 key 则中止。
- 本次改造中发现 `dist/config.json` 内残留了一个真实智谱 key（`f924b...`，源自历史构建的根目录 config.json，git 未跟踪）。已在本地删除，但**该 key 仍有效，建议去智谱控制台吊销重置**。

### 配置示例文件变更

- 删除：`claude-code-config.example.json`、`baseUrl=https:-open.bigmodel.cn-.txt`（误命名草稿）
- 新增：`mcp-config.example.json`（同时含 Reasonix + Claude Code 两段示例）
- 重写：`.env.example`（突出 profile + key）、`config.example.json`（增 profile 字段）
- `.gitignore` 增补 `config.json` / `vision-mcp.config.json`（实际配置，区别于 .example）

### 验证状态

- ✅ `npm run build` 通过
- ✅ spec 6.1 节 6 个配置解析用例全部符合预期
- ✅ 打包产出 tar，密钥泄露扫描通过
- ✅ health-check.sh 在 profile=local 环境通过（4/0/1）
- ⏳ 端到端冒烟（真实 Reasonix + GLM-4.6V 调用 analyze_image）待用户在目标机验证

## 2026-06-20: 项目改名 vision-mcp-for-reasonix

**背景**：原名 `vision-mcp-server` 过于泛化，改为 `vision-mcp-for-reasonix` 以明确「为 Reasonix(DeepSeek) 补齐视觉」的定位。

### 改动

- **包名/标识**：`package.json` name、`bin` key、`src/index.ts` 的 MCP server name（`vision-mcp-for-reasonix`，version 对齐 1.1.0）；`package-lock.json` 重新生成对齐。
- **展示名**：README、启动日志、脚本输出、配置示例统一为 `Vision MCP for Reasonix`。
- **路径/产物**：tar 包名、打包目录名、部署说明里的安装路径全部同步（`~/vision-mcp-for-reasonix`）。
- **README 重写**：聚焦 Reasonix + DeepSeek 定位，精简旧的通用描述（删冗余中文说明、Models 大表、Claude Code 单独章节等），保留工作原理图、快速开始、部署、Profile、工具、结构。
- **.gitignore 加固**：补充 IDE(.vscode/.idea)、系统文件(Thumbs.db)、env 变体(.env.*.local)、npm-debug.log 等。
- **METHODOLOGY.md**：标题、首行、架构图（MCP Client 从 Claude Code 改为 Reasonix/DeepSeek）同步为新名。

### keywords 调整

移除 `qwen3-vl`/`claude-code`/`video-analysis`，新增 `reasonix`/`deepseek`/`glm-4.6v`/`zhipu`，与定位一致。

