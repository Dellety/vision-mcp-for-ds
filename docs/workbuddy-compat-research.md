# WorkBuddy 兼容性研究

> 分支：`workbuddy-compat`
> 起始版本：v1.3.0（main 已剔除 WorkBuddy 支持）
> 目标：找到让 vision-mcp-for-ds 在 WorkBuddy 里稳定可用的方案

## 问题现象

WorkBuddy v5.3.8 + DeepSeek V4 Flash（OpenCode Go 套餐）组合下，vision MCP 工具无法稳定触发。

| 操作 | 结果 |
|---|---|
| 勾选「图片输入」+ 直接发图 | DS V4 报 `unknown variant image_url, expected text`（图被直接塞进 messages） |
| 取消「图片输入」+ 直接发图 | 前置拦截「当前模型暂不支持图片，请切换模型」 |
| 取消「图片输入」+ 纯文字+路径 | DS V4 不调工具，直接文字回复 |
| 勾选→发图报错→取消→说「继续」 | ✅ 偶然成功一次（副作用，不可复现） |

## 诊断证据（铁证）

### 1. vision server 从未被调用
在 `wrapTool` 加调试日志（写 `/tmp/vision-mcp-debug.log`）后，进行上述所有测试，**日志文件始终不存在**——证明 WorkBuddy 从未把请求发给我们的 stdio server。

### 2. 配置文件存在且正确
WorkBuddy 有**两份** MCP 配置文件（可能是冲突来源）：

**`~/.workbuddy/mcp.json`**（无点前缀，stdio 直连我们的 server）：
```json
{
  "mcpServers": {
    "vision": {
      "command": "node",
      "args": ["/Users/doni/vision-mcp-for-ds/dist/index.js"],
      "env": { "VISION_PROFILE": "opencode", "VISION_API_KEY": "..." },
      "disabled": false
    }
  }
}
```

**`~/.workbuddy/.mcp.json`**（有点前缀，HTTP connector-proxy）：
```json
{
  "mcpServers": {
    "connector-proxy": {
      "type": "http",
      "url": "http://127.0.0.1:58817/mcp",
      "description": "Aggregated proxy containing MCP servers: agent-mail, vision"
    }
  }
}
```

### 3. usage-log 显示 vision "被用过"
`~/.workbuddy/usage-log.json` 里 `vision.lastUsedDate = "2026-08-08"`，但我们的 server 日志为空。推测：WorkBuddy 统计的是 connector-proxy 层面的调用，而非我们的 stdio server。

### 4. models.json 的关键字段
```json
{
  "id": "deepseek-v4-flash",
  "supportsImages": false,        // ← WorkBuddy 据此前置拦截直接发图
  "supportsToolCall": true,        // ← 声称支持工具调用，但实际未触发
  "supportsReasoning": true,
  "reasoning": { "defaultEffort": "max" }
}
```

## 根因推测（待验证）

### 假设 A：两份配置文件冲突
WorkBuddy 可能优先加载 `.mcp.json`（connector-proxy），而 connector-proxy 里的 `vision` 并未真正转发到我们的 stdio server。`mcp.json`（直连）被忽略。

**验证方法**：备份并删除 `.mcp.json`，重启 WorkBuddy，看是否走 `mcp.json` 的 stdio 直连。

### 假设 B：WorkBuddy「图片输入」开关劫持了图片路由
勾选时，WorkBuddy 把图片直接塞进 message content（不走工具）；取消时，前置拦截。两种情况都不触发 function calling。仅当特定状态机切换（勾选→报错→取消→继续）时，工具路径才被激活。

**验证方法**：彻底不用图片输入功能，纯文字指令 + 确认 tools 声明是否注入请求。

### 假设 C：thinking mode 干扰工具调用
`reasoning.defaultEffort = "max"`。社区项目 arikusi/deepseek-mcp-server 文档暗示 thinking mode 开启时工具可能被忽略（未完全证实）。

**验证方法**：把 defaultEffort 改成 low 或 disabled，测纯文字调工具。

## 待研究方向

1. **搞清两份配置文件的关系**：`.mcp.json` vs `mcp.json`，哪个生效？connector-proxy 是什么？能否绕过？
2. **WorkBuddy 的 tools 注入机制**：抓 WorkBuddy 发给 OpenCode Go 的实际 HTTP 请求，看 `tools` 字段是否包含 analyze_image
3. **connector-proxy 的转发逻辑**：`127.0.0.1:58817` 是 WorkBuddy 内置的聚合代理，需鉴权（`{"error":"Unauthorized"}`）。搞清它如何注册/转发子 server
4. **向 WorkBuddy 提 issue**：整理本文件作为 bug report，请求 WorkBuddy 支持「主模型不支持图片时自动路由到 vision MCP 工具」

## 参考资源

- [WorkBuddy MCP 指南](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide)
- [arikusi/deepseek-mcp-server](https://github.com/arikusi/deepseek-mcp-server)（thinking mode 与工具调用的关系）
- [Capetlevrai/clipboard-vision-mcp](https://github.com/Capetlevrai/clipboard-vision-mcp)（专为 OpenCode+DSV4 设计，但锁 Groq）
