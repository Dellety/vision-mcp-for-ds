<div align="center">

# 👁️ Vision MCP for DS

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io/)

**给 DeepSeek V4 等纯文本模型补上视觉。**

DS V4 推理强，但看不到图。本项目是一个 MCP Server，把视觉模型的图像/视频理解能力，作为工具暴露给任何 MCP 客户端 —— Reasonix、ZCode，一份代码多处通用。截图分析、UI 对比、OCR、视频解读，各司其职。

> ⚠️ **客户端兼容性**：经测试，Reasonix / ZCode 可正常调用。WorkBuddy 存在工具触发不稳定的问题（其「图片输入」开关与 MCP 工具路由冲突），暂未列入支持，正在 [`workbuddy-compat`](https://github.com/Dellety/vision-mcp-for-ds/tree/workbuddy-compat) 分支研究中。

> 基于 [Loveacup/vision-mcp-server](https://github.com/Loveacup/vision-mcp-server)（MIT）改造，感谢原作者。

[工作原理](#-工作原理) · [快速开始](#-快速开始) · [部署到其它电脑](#-部署到其它电脑) · [Profile 预设](#-profile-预设) · [工具](#-工具)

</div>

---

## 💡 工作原理

```
┌─────────────────────────────┐  MCP/stdio  ┌──────────────────────┐  HTTPS/Bearer  ┌─────────────────────┐
│ Reasonix / ZCode │ ◄────────► │  Vision MCP for DS   │ ─────────────► │  视觉模型 (MiMo 等)  │
│      (DS V4，纯文本)         │             │  (本机 node 进程)     │                │  opencode.ai/zen/go │
└─────────────────────────────┘             └──────────────────────┘                └─────────────────────┘
                                                       │
                                                       ▼
                                               ┌──────────────┐
                                               │ 本地文件系统   │  (图片/视频 → base64)
                                               └──────────────┘
```

- **DS V4** 负责代码推理与任务编排。
- 遇到截图/UI/图片时，客户端**自动调用** `vision` MCP 的工具，由视觉模型提供理解。
- 本地文件会被自动转成 base64 data URI，对客户端完全透明。

## 🚀 快速开始

### 1. 安装

```bash
git clone https://github.com/Dellety/vision-mcp-for-ds.git
cd vision-mcp-for-ds
npm install && npm run build
```

### 2. 配置

创建 `.env`（最简：选 profile + 填 key）：

```bash
VISION_PROFILE=opencode                       # OpenCode Go 套餐，一个 key 接入多家模型
VISION_API_KEY=你的key                         # https://opencode.ai/go 订阅后获取
```

> **API Key 只走环境变量**，不要写入任何提交到仓库的文件。

<details>
<summary>🔧 其它 profile 或高级覆盖</summary>

| profile | 供应商 | 默认模型 |
|---|---|---|
| `opencode` *(推荐/默认)* | OpenCode Go 套餐 | `mimo-v2.5`（也可 `glm-5.2` / `kimi-k3`） |
| `zhipu` | 智谱 BigModel | `glm-4.6v-flashx`（`glm-4.6v-flash` 免费） |
| `openai` | OpenAI | `gpt-4o` |
| `qwen` | 阿里通义千问 VL | `qwen-vl-max` |
| `local` | 本地模型 | `Qwen3-VL-32B`（端点 `localhost:8000`） |

换模型不换供应商：加 `VISION_MODEL=glm-5.2`。
完全换端点：加 `VISION_BASE_URL=...`，或直接换 `VISION_PROFILE`。

</details>

### 3. 接入客户端

三个客户端的 MCP 配置格式各不相同，按你用的客户端选一个。下面 `/ABSOLUTE/PATH/TO` 替换为实际部署路径（如 `~/vision-mcp-for-ds`）。

<details>
<summary><b>Reasonix</b> — <code>~/.reasonix/config.toml</code>（TOML）</summary>

```toml
[[plugins]]
name    = "vision"
type    = "stdio"
command = "node"
args    = ["/ABSOLUTE/PATH/TO/vision-mcp-for-ds/dist/index.js"]
env     = { VISION_PROFILE = "opencode", VISION_API_KEY = "你的key" }
```

还需在 `~/.reasonix/mcp-activation.json` 里启用该 server（首次添加后 Reasonix 一般会自动写入）：

```json
{
  "version": 1,
  "overrides": [
    { "scope": "global", "source": "user_config", "server": "vision", "enabled": true }
  ]
}
```

</details>

<details>
<summary><b>ZCode</b> — <code>~/.zcode/cli/config.json</code>（JSON）</summary>

在 `mcp.servers` 下添加（server 名可自定义）：

```json
"ds-vision": {
  "type": "stdio",
  "command": "node",
  "args": ["/ABSOLUTE/PATH/TO/vision-mcp-for-ds/dist/index.js"],
  "env": {
    "VISION_PROFILE": "opencode",
    "VISION_API_KEY": "你的key"
  },
  "timeoutMs": 20000
}
```

</details>

<details>
<summary><b>OpenCode</b> — <code>~/.config/opencode/opencode.jsonc</code>（JSONC，特殊）</summary>

> 💡 **首选方案**：OpenCode 在插件市场推荐了社区视觉插件 `opencode-see-image`（在 `opencode.jsonc` 的 `plugin` 字段添加即可），开箱即用。**本方案对 OpenCode 只是备选**——当你想用自己的视觉模型/key、或需要 OCR/视频/对比等插件不具备的工具时，再配我们的 server。

> ⚠️ **OpenCode 的 mcp 配置不允许写入 API key 等资产信息**。key 通过部署目录的 `config.json` 传入（见下方第 2 步）。

**第 1 步**：在 `opencode.jsonc` 的 `mcp` 字段里添加（用 `cwd` 指向部署目录，让 server 能读到 config.json）：

```jsonc
"vision": {
  "type": "local",
  "command": ["node", "/ABSOLUTE/PATH/TO/vision-mcp-for-ds/dist/index.js"],
  "cwd": "/ABSOLUTE/PATH/TO/vision-mcp-for-ds",
  "enabled": true,
  "timeout": 10000
  // 不写 environment —— key 走 config.json
}
```

**第 2 步**：在部署目录创建 `config.json`（从 `config.example.json` 复制后填 key）：

```bash
cd /ABSOLUTE/PATH/TO/vision-mcp-for-ds
cp config.example.json config.json
# 编辑 config.json，填入 apiKey
```

```json
{
  "profile": "opencode",
  "apiKey": "你的key"
}
```

</details>

<details>
<summary>Claude Code 等其它 MCP 客户端</summary>

标准 MCP stdio 配置，key 走 env：

```json
{
  "mcpServers": {
    "vision": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/vision-mcp-for-ds/dist/index.js"],
      "env": {
        "VISION_PROFILE": "opencode",
        "VISION_API_KEY": "你的key"
      }
    }
  }
}
```

</details>

启动客户端，让 DS V4 分析一张本地图片即可验证。启动日志应为：
`Vision MCP for DS started (profile: opencode, model: mimo-v2.5, ...)`

## 📦 部署到其它电脑

面向「目标机可直连公网」的场景，提供 tar 包一键部署（不发布 npm）。

**源机打包：**
```bash
npm run pack
# → dist/vision-mcp-for-ds-deploy-v1.3.0.tar.gz
```

**目标机安装：**
```bash
tar xzf vision-mcp-for-ds-deploy-v1.3.0.tar.gz -C ~
cd ~/vision-mcp-for-ds
npm ci --omit=dev              # 只装 2 个生产依赖（sdk + zod），秒级完成
./scripts/health-check.sh      # 自检：node 版本 / 依赖 / key / 端点可达
```

然后按上面「接入客户端」的对应章节配置你用的客户端。**OpenCode 用户注意**：还需在部署目录 `cp config.example.json config.json` 并填 key（OpenCode 不允许在 mcp 配置里写资产信息）。

> 生产依赖仅 `@modelcontextprotocol/sdk` + `zod`，纯 JS 无 native binding，跨平台安全。

## 🎯 Profile 预设

一个 profile 自带正确端点和默认模型，部署时只需选 profile + 填 key。配置优先级：

```
1. 显式环境变量 (VISION_BASE_URL / VISION_MODEL / ...)
2. config.json 中的显式字段
3. VISION_PROFILE 指向的预设（填充未指定的字段）
4. 兜底：profile=opencode
```

| 变量 | 默认 | 说明 |
|---|---|---|
| `VISION_PROFILE` | `opencode` | 预设供应商，见上表 |
| `VISION_BASE_URL` | *(见 profile)* | OpenAI 兼容端点（覆盖 profile） |
| `VISION_MODEL` | *(见 profile)* | 模型名（覆盖 profile） |
| `VISION_API_KEY` | *(空)* | API key，只走环境变量 |
| `VISION_MAX_TOKENS` | `4096` | 最大响应 tokens |
| `VISION_TEMPERATURE` | `0.7` | 采样温度 |

## 🛠️ 工具

| 工具 | 说明 | 关键参数 |
|------|------|---------|
| 🔍 `analyze_image` | 自然语言分析图像 | `image`(路径/URL)、`prompt`、`detail`(low/high/auto) |
| 📝 `ocr_image` | OCR 文字识别 | `image`、`languages`(如 `zh,en`)、`format`(plain/markdown/json) |
| 🔀 `compare_images` | 对比 2–4 张图像 | `images[]`、`prompt` |
| 🎬 `analyze_video` | 视频内容分析（需视频模型） | `video`、`prompt` |

**支持格式：** JPEG/PNG/GIF/WebP/BMP/SVG ｜ MP4/AVI/MOV/MKV/WebM
**输入：** 本地路径（自动转 base64）或 URL

## 📁 项目结构

```
vision-mcp-for-ds/
├── src/
│   ├── index.ts              # MCP server 入口 + 工具注册
│   ├── config.ts             # 配置加载（env > config.json > profile）
│   ├── types.ts              # 类型定义
│   ├── tools/                # 4 个视觉工具
│   └── utils/                # API 客户端 + 文件处理
├── scripts/
│   ├── pack.sh               # 打包部署 tar
│   ├── health-check.sh       # 部署自检
│   └── verify-config.sh      # 配置解析验证
└── docs/superpowers/specs/   # 设计文档
```

## 📄 License

[MIT](LICENSE)

本项目基于 [Loveacup/vision-mcp-server](https://github.com/Loveacup/vision-mcp-server)（MIT）改造，特此致谢原作者。
在原项目基础上增加了 Profile 多预设、多客户端通用化、安全重试与超时保护，并重命名为 `vision-mcp-for-ds`。
