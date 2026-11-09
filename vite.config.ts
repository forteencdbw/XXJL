import { execSync } from "node:child_process";
import { defineConfig } from "vite";

/** 版本号 = 0.1.<提交次数>.<短 hash>；本地有未提交改动时加 -dev。上线时把前两位改成 1.0。 */
function appVersion(): string {
  const git = (cmd: string) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
  try {
    const dirty = git("status --porcelain") !== "";
    return `0.1.${git("rev-list --count HEAD")}.${git("rev-parse --short=7 HEAD")}${dirty ? "-dev" : ""}`;
  } catch {
    return "0.1.0.unknown";
  }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
});
