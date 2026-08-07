import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, resolve, isAbsolute } from "node:path";

/**
 * 图片上限：base64 内联后 +33%，20MB 二进制 ≈ 27MB 请求体，
 * 覆盖主流云端 API 的请求体限制。超限直接报错，提示改用 URL。
 */
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB
/**
 * 视频上限：base64 后体积更大，云端 API 实际多数会拒。
 * 保留较高上限主要服务 local profile（本地模型无请求体限制）。
 */
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
};

export function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/");
}

export function isUrl(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

function resolveAndValidatePath(input: string, maxSize: number): string {
  const resolved = isAbsolute(input) ? input : resolve(process.cwd(), input);
  if (!existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  const stat = statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${resolved}`);
  }
  if (stat.size > maxSize) {
    throw new Error(
      `File too large: ${(stat.size / 1024 / 1024).toFixed(1)} MB exceeds ${maxSize / 1024 / 1024} MB limit. Consider using a URL instead, or downscale the file first.`
    );
  }
  return resolved;
}

/**
 * Resolve an image source to a data URI (base64) or pass-through URL.
 */
export function resolveImageSource(input: string): string {
  if (isUrl(input)) {
    return input;
  }

  const filePath = resolveAndValidatePath(input, MAX_IMAGE_SIZE);
  const mime = getMimeType(filePath);
  if (!isImageMime(mime)) {
    throw new Error(`Not a recognized image format: ${filePath}`);
  }
  const data = readFileSync(filePath);
  const base64 = data.toString("base64");
  return `data:${mime};base64,${base64}`;
}

/**
 * Read a video file and return base64 data URI.
 */
export function resolveVideoSource(input: string): string {
  if (isUrl(input)) {
    return input;
  }

  const filePath = resolveAndValidatePath(input, MAX_VIDEO_SIZE);
  const mime = getMimeType(filePath);
  if (!isVideoMime(mime)) {
    throw new Error(`Not a recognized video format: ${filePath}`);
  }
  const data = readFileSync(filePath);
  const base64 = data.toString("base64");
  return `data:${mime};base64,${base64}`;
}
