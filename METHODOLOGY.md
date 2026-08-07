# Vision MCP for DS — 开发方法论

本文档面向 AI 编程助手和开发者，说明 Vision MCP for DS 的设计思路、架构决策和扩展方式。

## 1. 设计目标

**核心问题**：DeepSeek V4 等纯文本大模型推理能力强，但本身没有视觉能力，无法分析截图、读取图片中的文字、对比 UI 变更。

**解决方案**：通过 MCP（Model Context Protocol）协议，将视觉能力作为工具暴露给任何 MCP 客户端（Reasonix / ZCode / WorkBuddy 等），由外部视觉模型（如 OpenCode Go 套餐的 MiMo、智谱 GLM、GPT-4o）提供实际的图像/视频理解。

**设计原则**：
- **模型无关**：不绑定任何特定视觉模型，通过 OpenAI 兼容 API 适配所有主流模型
- **客户端无关**：标准 MCP/stdio，任何 MCP 客户端都能接入，一份代码多处通用
- **零依赖推理**：服务器本身不运行模型，只做协议转换和文件处理
- **本地文件友好**：AI agent 操作的是本地文件系统，自动将本地文件转为 base64 data URI

## 2. 架构

```
┌─────────────────────────────┐   MCP/stdio   ┌──────────────────────┐   HTTP/JSON   ┌─────────────┐
│ Reasonix / ZCode / WorkBuddy │ ◄──────────► │ Vision MCP for DS    │ ────────────► │  Vision LLM │
│      (DS V4，纯文本)         │               │   (本项目)            │               │  (API 端点)  │
└─────────────────────────────┘               └──────────────────────┘               └─────────────┘
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │ 本地文件系统   │
                                                │ (图片/视频)    │
                                                └──────────────┘
```

### 分层设计

| 层 | 文件 | 职责 |
|---|---|---|
| **入口层** | `index.ts` | MCP server 初始化、工具注册、错误处理（`wrapTool` 统一包装） |
| **工具层** | `tools/*.ts` | 每个工具一个文件，定义 Zod schema + 处理逻辑 |
| **客户端层** | `utils/api-client.ts` | OpenAI 兼容 API 的 HTTP 客户端（超时 + 安全重试） |
| **文件处理层** | `utils/file-handler.ts` | 本地文件 → base64 data URI 转换、类型/尺寸校验 |
| **配置层** | `config.ts` | 环境变量 + 配置文件的多源加载、profile 预设 |

### 关键决策

**为什么用 Zod schema？**
MCP SDK 的 `server.tool()` 方法直接接受 Zod schema 的 `.shape` 作为参数定义，同时 Zod 提供运行时类型验证。一个 schema 同时解决类型安全和参数校验。

**为什么不用 SDK 内置的文件处理？**
MCP 协议本身支持资源（Resource）概念，但工具调用的参数是纯 JSON。Vision API 需要 base64 或 URL 格式的图片输入，所以我们在服务器侧完成本地文件到 data URI 的转换，对 MCP client 透明。

**为什么用 `fetch` 而不是 OpenAI SDK？**
减少依赖。OpenAI 兼容 API 的 chat completions 端点格式简单且稳定，直接用 Node.js 内置的 `fetch` 即可，无需引入 `openai` 包。

**为什么对 429/5xx 重试，对 4xx/超时不重试？**
429（限流）和 5xx（服务端临时故障）重试是安全的——上一次请求未成功，不会重复计费。4xx 是请求本身有问题（格式错、鉴权失败），重试无意义；超时则请求状态未知，重试有重复计费风险，故不重试。

## 3. 工具设计模式

每个工具遵循相同模式，注册时统一用 `wrapTool` 高阶函数收敛错误处理：

```typescript
// 1. 工具文件：Zod schema 定义参数 + 处理函数
export const toolSchema = z.object({
  image: z.string().describe("..."),
  prompt: z.string().default("...").describe("..."),
});

export async function toolHandler(
  client: VisionApiClient,
  input: z.infer<typeof toolSchema>
): Promise<string> {
  // 解析文件 → 构造 messages → 调用 API → 返回文本
}

// 2. index.ts：用 wrapTool 注册，无需手写 try/catch
server.tool("tool_name", "description", schema.shape,
  wrapTool((input) => toolHandler(client, input as never))
);
```

## 4. 文件处理策略

| 输入类型 | 处理方式 |
|---|---|
| `http://` / `https://` URL | 直接传递给 Vision API（由供应商拉取） |
| 绝对路径 `/path/to/file` | 读取 → base64 → `data:mime;base64,...` |
| 相对路径 `./file` | resolve(cwd, path) → 同绝对路径 |

安全限制：
- 图片上限 20 MB（base64 后约 27 MB，覆盖主流云端 API 请求体限制）
- 视频上限 100 MB（但云端 API 实际多数会拒，建议本地视频改用 URL）
- 仅接受已知的图片/视频 MIME 类型（图片和视频分别校验）
- 路径必须指向实际存在的文件

## 5. 配置优先级

```
环境变量 > config.json / vision-mcp.config.json > VISION_PROFILE 预设 > 兜底(opencode)
```

这允许：
- 开发时用 `.env` 文件
- MCP 集成时用 `env` 字段直接传入
- 共享部署时用 `config.json`
- 只填 profile + key 的最简启动

## 6. 添加新工具

1. 在 `src/tools/` 下创建新文件（如 `describe-ui.ts`）
2. 定义 Zod schema 和处理函数
3. 在 `index.ts` 中 import 并用 `wrapTool` 注册
4. `npm run build` 重新编译

## 7. 局限性

- **无流式输出**：MCP 工具返回完整文本，不支持流式（适合短回答，长视频分析可能较慢）
- **无本地模型**：服务器不内置推理能力，必须有外部 API 端点
- **视频支持有限**：大多数 Vision LLM 不支持视频输入，目前只有 Qwen3-VL 等少数模型支持
- **base64 开销**：本地文件转 base64 会增加约 33% 的数据量和内存占用，URL 输入则无此开销
- **URL 输入依赖供应商拉取**：云模型能访问的 URL 才有效，私有/内网 URL 对云端模型不可达
