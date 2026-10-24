// 导出码：把存档 JSON 编码成可复制的纯文本，换设备/重装时手动恢复。
// 前缀带版本，未来格式变化时旧码可以被明确拒绝而不是误解。

const CODE_PREFIX = "LS1.";

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(code: string): string | null {
  try {
    const binary = atob(code);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeSaveCode(data: unknown): string {
  return CODE_PREFIX + toBase64(JSON.stringify(data));
}

/** 解码失败（前缀/Base64/JSON 任一不合法）一律返回 null，调用方按无效码处理。 */
export function decodeSaveCode(code: string): unknown | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith(CODE_PREFIX)) return null;
  const json = fromBase64(trimmed.slice(CODE_PREFIX.length));
  if (json === null) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
