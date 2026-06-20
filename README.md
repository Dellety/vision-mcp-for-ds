<div align="center">

# 👁️ Vision MCP for Reasonix

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io/)

**给 DeepSeek 的 Reasonix 补上视觉。**

Reasonix 是 DeepSeek 原生的终端编码 agent，推理强但没有眼睛。
本项目是一个 MCP Server，把智谱 GLM-4.6V（或任何 OpenAI 兼容视觉模型）的图像/视频理解能力，作为工具暴露给 Reasonix —— 截图分析、UI 对比、OCR、视频解读，各司其职。

[工作原理](#-工作原理) · [快速开始](#-快速开始) · [部署到其它电脑](#-部署到其它电脑) · [Profile 预设](#-profile-预设) · [工具](#-工具)

</div>

---

## 💡 工作原理

```
┌──────────────┐   MCP/stdio    ┌──────────────────────────┐   HTTPS/Bearer   ┌─────────────────┐
│   Reasonix   │ ◄────────────► │  Vision MCP for Reasonix │ ───────────────► │ 智谱 GLM-4.6V    │
│ (DeepSeek)   │                │   (本机 node 进程)        │                  │ open.bigmodel.cn│
└──────────────┘                └──────────────────────────┘                  └─────────────────┘
                                         │
                                         ▼
                                 ┌──────────────┐
                                 │ 本地文件系统   │  (图片/视频 → base64)
                                 └──────────────┘
```

- **DeepSeek** 负责代码推理与任务编排。
- 遇到截图/UI/图片时，Reasonix **自动调用** `vision` MCP 的工具，由 GLM-4.6V 提供视觉理解。
- 本地文件会被自动转成 base64 data URI，对 Reasonix 完全透明。

## 🚀 快速开始

### 1. 安装

```bash
git clone https://github.com/Loveacup/vision-mcp-for-reasonix.git
cd vision-mcp-for-reasonix
npm install && npm run build
```

### 2. 配置

创建 `.env`（最简：选 profile + 填 key）：

```bash
VISION_PROFILE=zhipu                       # 智谱 GLM-4.6V，国内联网 API
VISION_API_KEY=你的智谱key                  # https://open.bigmodel.cn 控制台获取
```

> **API Key 只走环境变量**，不要写入任何提交到仓库的文件。

<details>
<summary>🔧 其它 profile 或高级覆盖</summary>

| profile | 供应商 | 默认模型 |
|---|---|---|
| `zhipu` *(推荐)* | 智谱 BigModel | `glm-4.6v-flashx`（`glm-4.6v-flash` 免费） |
| `openai` | OpenAI | `gpt-4o` |
| `qwen` | 阿里通义千问 VL | `qwen-vl-max` |
| `local` *(默认)* | 本地模型 | `Qwen3-VL-32B`（端点 `localhost:8000`） |

换模型不换供应商：加 `VISION_MODEL=glm-4.6v-flash`。
完全换端点：加 `VISION_BASE_URL=...`，或直接换 `VISION_PROFILE`。

</details>

### 3. 接入 Reasonix

把以下配置加入 Reasonix 的 MCP 配置（位置见 [Reasonix 文档](https://github.com/esengine/deepseek-reasonix)）：

```json
{
  "mcpServers": {
    "vision": {
      "command": "node",
      "args": ["/path/to/vision-mcp-for-reasonix/dist/index.js"],
      "env": {
        "VISION_PROFILE": "zhipu",
        "VISION_API_KEY": "你的智谱key"
      }
    }
  }
}
```

启动 Reasonix，让它分析一张本地图片即可验证。启动日志应为：
`Vision MCP for Reasonix started (profile: zhipu, model: glm-4.6v-flashx, ...)`

## 📦 部署到其它电脑

面向「目标机可直连公网」的场景，提供 tar 包一键部署（不发布 npm）。

**源机打包：**
```bash
npm run pack
# → dist/vision-mcp-for-reasonix-deploy-v1.1.0.tar.gz
```

**目标机安装：**
```bash
tar xzf vision-mcp-for-reasonix-deploy-v1.1.0.tar.gz -C ~
cd ~/vision-mcp-for-reasonix
npm ci --omit=dev              # 只装 2 个生产依赖（sdk + zod），秒级完成
./scripts/health-check.sh      # 自检：node 版本 / 依赖 / key / 端点可达
```

然后把上面的 Reasonix 配置指向 `~/vision-mcp-for-reasonix/dist/index.js`，填 key，重启即可。

> 生产依赖仅 `@modelcontextprotocol/sdk` + `zod`，纯 JS 无 native binding，跨平台安全。

## 🎯 Profile 预设

一个 profile 自带正确端点和默认模型，部署时只需选 profile + 填 key。配置优先级：

```
1. 显式环境变量 (VISION_BASE_URL / VISION_MODEL / ...)
2. config.json 中的显式字段
3. VISION_PROFILE 指向的预设（填充未指定的字段）
4. 兜底：profile=local
```

| 变量 | 默认 | 说明 |
|---|---|---|
| `VISION_PROFILE` | `local` | 预设供应商，见上表 |
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
vision-mcp-for-reasonix/
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
