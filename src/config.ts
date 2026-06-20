import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { VisionConfig } from "./types.js";

/**
 * 预设 profile：每个 profile 提供默认 baseUrl 和 model。
 * 部署时只需 `VISION_PROFILE=zhipu` + `VISION_API_KEY` 即可启动，
 * 无需手填冗长的端点 URL。
 *
 * 显式 env / config.json 字段永远覆盖 profile 预设。
 */
const PROFILES: Record<string, { baseUrl: string; model: string }> = {
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

/** 默认 profile：不显式指定时使用，保留项目原有的本地模型语义。 */
const DEFAULT_PROFILE = "local";

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

export function loadConfig(): VisionConfig {
  const file = loadConfigFile();

  const profileName =
    process.env.VISION_PROFILE || (file.profile as string) || DEFAULT_PROFILE;

  const profile = PROFILES[profileName];
  if (!profile) {
    throw new Error(
      `Unknown profile "${profileName}". Available: ${Object.keys(PROFILES).join(
        ", "
      )}`
    );
  }

  // 优先级：显式 env > config.json > profile 预设
  const baseUrl =
    process.env.VISION_BASE_URL || (file.baseUrl as string) || profile.baseUrl;
  const model =
    process.env.VISION_MODEL || (file.model as string) || profile.model;
  const apiKey =
    process.env.VISION_API_KEY || (file.apiKey as string) || "";
  const maxTokens = Number(
    process.env.VISION_MAX_TOKENS || file.maxTokens || 4096
  );
  const temperature = Number(
    process.env.VISION_TEMPERATURE || file.temperature || 0.7
  );

  return { baseUrl, model, apiKey, maxTokens, temperature, profile: profileName };
}
