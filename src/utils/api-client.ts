import type {
  VisionConfig,
  ChatMessage,
  ChatCompletionResponse,
} from "../types.js";

/** 单次请求超时（ms）。联网视觉模型通常 5-20s 内返回，留足余量。 */
const REQUEST_TIMEOUT_MS = 30_000;
/** 对 429 / 5xx 重试次数（不含首次）。2xx/4xx/abort 不重试，避免重复计费。 */
const MAX_RETRIES = 2;
/** 退避基数（ms）：第 1 次重试等 500ms，第 2 次等 1000ms。 */
const BACKOFF_BASE_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 判断是否值得重试：仅限服务端临时错误（429 限流 / 5xx 故障）。 */
function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export class VisionApiClient {
  private config: VisionConfig;

  constructor(config: VisionConfig) {
    this.config = config;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const body = {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(this.config.baseUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        // 成功路径
        if (response.ok) {
          const data = (await response.json()) as ChatCompletionResponse;
          if (!data.choices || data.choices.length === 0) {
            throw new Error("Vision API returned no choices");
          }
          return data.choices[0].message.content;
        }

        // 可重试的服务端错误：读 body 后退避重试
        const text = await response.text();
        const error = new Error(
          `Vision API error (${response.status}): ${text}`
        );
        lastError = error;

        if (isRetryable(response.status) && attempt < MAX_RETRIES) {
          const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt);
          await sleep(backoff);
          continue;
        }
        throw error;
      } catch (err) {
        // 超时（abort）不重试 —— 30s 都没回来，再等也大概率没用，且可能重复计费
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new Error(
            `Vision API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
          );
        }
        // 其它错误（网络中断、JSON 解析失败等）按原样抛出，不重试
        throw err;
      }
    }

    // 理论上不会走到（循环内总会有 return 或 throw），TS 收窄需要
    throw lastError ?? new Error("Vision API request failed");
  }
}
