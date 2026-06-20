# AGENTS.md — 项目修改记录

本文件记录 vision-mcp-for-reasonix 项目的重要改动，供后续 AI agent / 开发者快速了解项目状态。

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

