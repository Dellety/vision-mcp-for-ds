import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { VisionConfig } from "./types.js";

/**
 * 预设 profile：每个 profile 提供默认 baseUrl 和 model。
 * 部署时只需 `VISION_PROFILE=opencode` + `VISION_API_KEY` 即可启动，
 * 无需手填冗长的端点 URL。
 *
 * 显式 env / config.json 字段永远覆盖 profile 预设。
 */
const PROFILES: Record<string, { baseUrl: string; model: string }> = {
  // OpenCode Go 套餐：一个 key 接入 GLM/Kimi/Qwen/MiMo 等多家视觉模型
  opencode: {
    baseUrl: "https://opencode.ai/zen/go/v1/chat/completions",
    model: "mimo-v2.5",
  },
  zhipu: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    model: "glm-4.6v-flashx",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o",
  },
  qwen: {
    baseUrl:
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-vl-max",
  },
  local: {
    baseUrl: "http://localhost:8000/v1/chat/completions",
    model: "Qwen3-VL-32B",
  },
};

/** 默认 profile：不显式指定时使用。面向联网 API 的视觉桥定位。 */
const DEFAULT_PROFILE = "opencode";

function loadConfigFile(): Partial<VisionConfig> {
  const candidates = [
    resolve(process.cwd(), "config.json"),
    resolve(process.cwd(), "vision-mcp.config.json"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        return JSON.parse(readFileSync(path, "utf-8"));
      } catch {
        // ignore malformed config files
      }
    }
  }
  return {};
}

/**
 * 安全解析数字：env 优先，其次文件，最后 default。
 * 显式设为非法值（空串/NaN）时回退到 default，避免把 NaN 发给 API。
 */
function resolveNumber(
  envVal: string | undefined,
  fileVal: number | undefined,
  fallback: number
): number {
  const raw = envVal ?? fileVal ?? fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(): VisionConfig {
  const file = loadConfigFile();

  const profileName =
    process.env.VISION_PROFILE || file.profile || DEFAULT_PROFILE;

  const profile = PROFILES[profileName];
  if (!profile) {
    throw new Error(
      `Unknown profile "${profileName}". Available: ${Object.keys(PROFILES).join(
        ", "
      )}`
    );
  }

  // 优先级：显式 env > config.json > profile 预设
  const baseUrl = process.env.VISION_BASE_URL || file.baseUrl || profile.baseUrl;
  const model = process.env.VISION_MODEL || file.model || profile.model;
  const apiKey = process.env.VISION_API_KEY || file.apiKey || "";
  const maxTokens = resolveNumber(
    process.env.VISION_MAX_TOKENS,
    file.maxTokens,
    4096
  );
  const temperature = resolveNumber(
    process.env.VISION_TEMPERATURE,
    file.temperature,
    0.7
  );

  return { baseUrl, model, apiKey, maxTokens, temperature, profile: profileName };
}
