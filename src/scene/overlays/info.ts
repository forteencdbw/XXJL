// 二级页面：玩法说明、账簿成就、存档导入导出。
import { REALMS, getAchievements } from "../../logic";
import { parseSave } from "../../save";
import { decodeSaveCode, encodeSaveCode } from "../../savecode";
import { SAVE_KEY } from "../constants";
import type { TavernScene } from "../TavernScene";

export class InfoOverlayMethods {
  /** 玩法说明：新档第一次进门自动弹出，也可随时从「玩法」按钮打开。 */
  showHelp(this: TavernScene) {
    const layer = this.openSubsystemPage("灵膳楼 · 掌柜须知", "知道了，去营生");
    layer.add(
      this.add.text(40, 142, "你是被逐出师门的散修，带着一口旧锅，在青云镇外支起「灵膳楼」。", {
        fontSize: "17px",
        color: "#c8b8a0",
        fontStyle: "italic",
        wordWrap: { width: 640 },
      }),
    );
    layer.add(
      this.add.text(40, 176, "白日营生，夜里修行；总有一天，要踏破虚空。", {
        fontSize: "17px",
        color: "#c8b8a0",
        fontStyle: "italic",
      }),
    );
    layer.add(this.add.rectangle(40, 218, 640, 2, 0x8a6a3a).setOrigin(0, 0));
    const lines = [
      "营业前：采购灵材、雇伙计并安排分工、营造升级、选菜单，然后「开始营业」。",
      "营业中：门口排队 → 跑堂领座 → 掌勺做菜 → 跑堂传菜 → 用膳结账。",
      "掌柜和伙计按「伙计」页的勾选与顺序自动干活；你负责排人、选菜单和备货。",
      "每人有灵根和五项属性：根骨管跑堂、神识管烹饪、机缘管采买；火、水、金灵根分别让烹饪、跑堂、采买多算几星。",
      "干活攒经验，升级得属性点，打烊或夜修时到「伙计」页点人物加点。",
      "营业中可左右拖动画面，查看门外排队与空地。",
      "营业从辰正到子初，按刻计时，不能提前打烊；本机每天第一次开店领「开市利是」，连续越久赏越多。",
      "打烊后入夜修：掌柜与伙计在法坛打坐，到辰正天亮才能开张；打开任何页面时时间暂停。",
      "客人想吃的菜在今日菜单上才端得对：端对 +50%，端错只付半价。",
      "「修为」子系统还在筹备，敬请期待。",
      "每天一个目标，达成有额外灵石；连亏 5 日破产。",
      "「账簿」看成绩、「存档」备份；缺灵石可去灵石商行借小借。",
    ];
    // 中文没有空格，要开 useAdvancedWrap 才会折行；折行后按实际高度往下排
    let y = 250;
    for (const line of lines) {
      const text = this.add.text(40, y, line, {
        fontSize: "17px",
        color: "#dddddd",
        wordWrap: { width: 640, useAdvancedWrap: true },
        lineSpacing: 6,
      });
      layer.add(text);
      y += text.height + 16;
    }
  }

  /** 二级页面：账簿。跨周目累计数据、本机最高记录与成就。 */
  buildRecordOverlay(this: TavernScene) {
    const layer = this.openSubsystemPage("账簿");
    const meta = this.meta;
    const realmName = REALMS[Math.min(Math.max(0, meta.maxRealm), REALMS.length - 1)].name;
    const stats = [
      `累计营业 ${meta.days} 日`,
      `累计食客 ${meta.served} 位`,
      `累计收益 ${meta.revenue} 灵石`,
      `单日最高 ${meta.bestRevenue} 灵石`,
      `单日最多 ${meta.bestServed} 位食客`,
      `每日目标达成 ${meta.goalsMet} 次`,
      `最高境界 ${realmName} · 当前仙缘 ${this.ascensions} 重`,
    ];
    stats.forEach((line, i) => {
      layer.add(this.add.text(40, 126 + i * 30, line, { fontSize: "18px", color: "#dddddd" }));
    });
    layer.add(this.add.text(400, 126, "本机单日榜", { fontSize: "18px", color: "#ffd98a" }));
    if (this.meta.topDays.length === 0) {
      layer.add(this.add.text(400, 160, "尚无记录", { fontSize: "14px", color: "#777777" }));
    } else {
      this.meta.topDays.forEach((record, i) => {
        layer.add(
          this.add.text(400, 158 + i * 26, `${i + 1}. 第${record.day}日 · Lv${record.level} · ${record.revenue} 灵石`, {
            fontSize: "14px",
            color: i === 0 ? "#ffd98a" : "#bbbbbb",
          }),
        );
      });
    }

    const achievements = getAchievements(meta, this.ascensions);
    const unlocked = achievements.filter((item) => item.unlocked).length;
    layer.add(
      this.add.text(40, 352, `成就 ${unlocked}/${achievements.length}`, { fontSize: "20px", color: "#ffd98a" }),
    );
    achievements.forEach((item, i) => {
      const y = 392 + i * 32;
      layer.add(
        this.add.text(48, y, `${item.unlocked ? "✓" : "○"} ${item.name}`, {
          fontSize: "16px",
          color: item.unlocked ? "#9fdf6a" : "#777777",
        }),
      );
      layer.add(
        this.add.text(236, y + 1, item.desc, {
          fontSize: "14px",
          color: item.unlocked ? "#bbbbbb" : "#666666",
        }),
      );
    });

  }

  /** 导出/导入存档。用浏览器原生输入框承载长文本（Phaser 没有文本输入控件）。 */
  openSaveDialog(this: TavernScene, mode: "export" | "import") {
    document.getElementById("save-dialog")?.remove();
    this.setWorldPaused(true);
    const overlay = document.createElement("div");
    const close = () => {
      overlay.remove();
      this.setWorldPaused(false);
    };
    overlay.id = "save-dialog";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-family:system-ui,sans-serif;";
    const panel = document.createElement("div");
    panel.style.cssText =
      "width:min(92vw,560px);background:#1b2440;border:2px solid #3f5a7a;border-radius:10px;padding:18px;color:#fff;box-sizing:border-box;";
    const title = document.createElement("div");
    title.textContent = mode === "export" ? "导出存档" : "导入存档";
    title.style.cssText = "font-size:22px;color:#ffd98a;margin-bottom:8px;";
    const hint = document.createElement("div");
    hint.textContent =
      mode === "export"
        ? "复制整段导出码保存。换设备或清空浏览器后，在这里选「导入存档」恢复。"
        : "粘贴 LS3. 开头的导出码。导入会覆盖本机当前进度。";
    hint.style.cssText = "font-size:14px;color:#bbbbbb;line-height:1.5;margin-bottom:10px;";
    const textarea = document.createElement("textarea");
    textarea.value = mode === "export" ? encodeSaveCode(this.buildSaveData()) : "";
    textarea.readOnly = mode === "export";
    textarea.placeholder = mode === "import" ? "在这里粘贴导出码" : "";
    textarea.style.cssText =
      "width:100%;height:170px;box-sizing:border-box;background:#0e1524;color:#cfe2ff;border:1px solid #3f5a7a;border-radius:6px;padding:10px;font-family:monospace;font-size:12px;resize:none;";
    const status = document.createElement("div");
    status.style.cssText = "min-height:20px;font-size:13px;color:#ff9a8a;margin:6px 0;";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;";

    const button = (label: string, primary: boolean, onClick: () => void) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.style.cssText = `flex:1;min-width:110px;padding:12px;border-radius:6px;border:0;font-size:16px;cursor:pointer;background:${
        primary ? "#3f6a3f" : "#3a3a3a"
      };color:#fff;`;
      btn.addEventListener("click", onClick);
      row.appendChild(btn);
    };

    if (mode === "export") {
      button("复制导出码", true, () => {
        textarea.focus();
        textarea.select();
        const done = () => {
          status.style.color = "#9fe870";
          status.textContent = "已复制到剪贴板";
        };
        const fallback = () => {
          try {
            document.execCommand("copy");
            done();
          } catch {
            status.style.color = "#ff9a8a";
            status.textContent = "复制失败，请手动全选复制";
          }
        };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(textarea.value).then(done, fallback);
        else fallback();
      });
    } else {
      button("确认导入", true, () => {
        // 与读档同一套校验：坏数据、旧版本都在这里挡住
        const data = parseSave(decodeSaveCode(textarea.value));
        if (!data) {
          status.textContent = "导出码无效或版本不匹配";
          return;
        }
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify(data));
          // 禁止 beforeunload 用当前内存状态覆盖刚导入的存档
          this.suppressSave = true;
          location.reload();
        } catch {
          status.textContent = "无法写入本地存档（浏览器存储不可用）";
        }
      });
    }
    button(mode === "export" ? "导入存档" : "导出存档", false, () =>
      this.openSaveDialog(mode === "export" ? "import" : "export"),
    );
    button("关闭", false, close);

    panel.append(title, hint, textarea, status, row);
    overlay.appendChild(panel);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    document.body.appendChild(overlay);
    if (mode === "export") {
      textarea.focus();
      textarea.select();
    }
  }
}
