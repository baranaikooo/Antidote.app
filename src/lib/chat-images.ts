export const CHAT_IMAGE_BUCKET = "chat-images";
export const CHAT_IMAGE_LIMIT = 8 * 1024 * 1024;

const extensions = new Map([
  ["image/gif", "gif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export const CHAT_IMAGE_ACCEPT = [...extensions.keys()].join(",");

export function getChatImageExtension(file: File) {
  const extension = extensions.get(file.type);
  return extension && file.size > 0 && file.size <= CHAT_IMAGE_LIMIT ? extension : undefined;
}

export function privateChatImagePath(url?: string | null) {
  const prefix = CHAT_IMAGE_BUCKET + "/";
  return url?.startsWith(prefix) ? url.slice(prefix.length) : undefined;
}

export function chatImageKind(path: string): "gif" | "image" {
  return path.endsWith(".gif") ? "gif" : "image";
}
