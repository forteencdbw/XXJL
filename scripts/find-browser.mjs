import { existsSync } from "node:fs";

// shortcut: 只覆盖 Windows 常见安装位置；如果以后要支持 Mac/Linux 开发机，在这里加对应路径候选
const CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);

/** 在本机常见安装位置里找一个可用的 Chromium 内核浏览器（Chrome 优先，没有就用 Edge）。 */
export function findBrowserPath() {
  const found = CANDIDATES.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      "没找到 Chrome/Edge，检查过的路径：\n" + CANDIDATES.join("\n") + "\n请安装 Chrome 或手动修改 scripts/find-browser.mjs 加入实际安装路径。",
    );
  }
  return found;
}
