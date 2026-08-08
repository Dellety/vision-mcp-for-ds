#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { VisionApiClient } from "./utils/api-client.js";
import {
  analyzeImageSchema,
  analyzeImage,
} from "./tools/analyze-image.js";
import { ocrImageSchema, ocrImage } from "./tools/ocr-image.js";
import {
  compareImagesSchema,
  compareImages,
} from "./tools/compare-images.js";
import {
  analyzeVideoSchema,
  analyzeVideo,
} from "./tools/analyze-video.js";

const config = loadConfig();
const client = new VisionApiClient(config);

const server = new McpServer({
  name: "vision-mcp-for-ds",
  version: "1.3.0",
});

/** 工具调用的统一错误包装：成功返回文本，失败返回 isError 标记的文本。 */
function wrapTool(
  fn: (input: Record<string, unknown>) => Promise<string>
): (input: Record<string, unknown>) => Promise<{
  content: { type: "text"; text: string }[];
  isError?: boolean;
}> {
  return async (input) => {
    try {
      const result = await fn(input);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${msg}` }],
        isError: true,
      };
    }
  };
}

// Tool: analyze_image
server.tool(
  "analyze_image",
  "Analyze an image using a vision language model. Supports local file paths and URLs.",
  analyzeImageSchema.shape,
  wrapTool((input) => analyzeImage(client, input as never))
);

// Tool: ocr_image
server.tool(
  "ocr_image",
  "Extract text from an image using OCR. Supports plain text, Markdown, and JSON output formats.",
  ocrImageSchema.shape,
  wrapTool((input) => ocrImage(client, input as never))
);

// Tool: compare_images
server.tool(
  "compare_images",
  "Compare 2-4 images and describe differences/similarities. Supports local file paths and URLs.",
  compareImagesSchema.shape,
  wrapTool((input) => compareImages(client, input as never))
);

// Tool: analyze_video
server.tool(
  "analyze_video",
  "Analyze video content using a vision language model. Requires a model with video support (e.g., Qwen3-VL).",
  analyzeVideoSchema.shape,
  wrapTool((input) => analyzeVideo(client, input as never))
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Vision MCP for DS started (profile: ${config.profile}, model: ${config.model}, endpoint: ${config.baseUrl})`
  );
}

main().catch((err) => {
  console.error("Failed to start Vision MCP for DS:", err);
  process.exit(1);
});
