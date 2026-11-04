// 程序生成贴图：光晕、纸纹、菜品、水墨标题/内景/打烊画。
import Phaser from "phaser";
import type { TavernScene } from "./TavernScene";

export class TextureMethods {
  /** 生成一张柔和的径向光晕，供月光、灯笼、灶火共用；比叠加同心圆干净。 */
  ensureGlowTexture(this: TavernScene) {
    if (this.textures.exists("soft-glow")) return;
    const tex = this.textures.createCanvas("soft-glow", 256, 256);
    if (!tex) return;
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,255,255,0.6)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.2)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    tex.refresh();
  }

  /** 纸纹与暗角：给纯矢量画面加一层很薄的质感，避免大色块像 UI 原型。 */
  ensurePaperTextures(this: TavernScene) {
    if (!this.textures.exists("paper-grain")) {
      const grain = this.textures.createCanvas("paper-grain", 256, 256);
      if (grain) {
        const ctx = grain.getContext();
        for (let i = 0; i < 1100; i++) {
          const light = Math.random() > 0.45;
          ctx.fillStyle = light
            ? `rgba(255,244,224,${0.02 + Math.random() * 0.04})`
            : `rgba(0,0,0,${0.02 + Math.random() * 0.04})`;
          ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
        }
        grain.refresh();
      }
    }
    if (!this.textures.exists("vignette")) {
      const vig = this.textures.createCanvas("vignette", 360, 640);
      if (vig) {
        const ctx = vig.getContext();
        const grad = ctx.createRadialGradient(180, 300, 80, 180, 320, 390);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(0.62, "rgba(0,0,0,0.06)");
        grad.addColorStop(1, "rgba(0,0,0,0.55)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 360, 640);
        vig.refresh();
      }
    }
  }

  /** 一张手绘感的灵膳大碗：菜单空桌时用它，比几何椭圆更像“菜”。 */
  ensureDishTexture(this: TavernScene) {
    if (this.textures.exists("dish-feast")) return;
    const tex = this.textures.createCanvas("dish-feast", 512, 512);
    if (!tex) return;
    const c = tex.getContext();
    c.clearRect(0, 0, 512, 512);
    // 桌面投影
    const shadow = c.createRadialGradient(256, 430, 20, 256, 430, 200);
    shadow.addColorStop(0, "rgba(0,0,0,0.42)");
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = shadow;
    c.beginPath();
    c.ellipse(256, 430, 205, 38, 0, 0, Math.PI * 2);
    c.fill();
    // 陶碗外壁
    const bowl = c.createLinearGradient(0, 285, 0, 445);
    bowl.addColorStop(0, "#d8ded2");
    bowl.addColorStop(0.45, "#9aa89a");
    bowl.addColorStop(1, "#4d5a50");
    c.fillStyle = bowl;
    c.beginPath();
    c.moveTo(78, 300);
    c.bezierCurveTo(102, 438, 410, 438, 434, 300);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(40,48,42,0.65)";
    c.lineWidth = 3;
    c.stroke();
    // 碗沿
    const rim = c.createLinearGradient(0, 255, 0, 350);
    rim.addColorStop(0, "#f3ead4");
    rim.addColorStop(0.5, "#d9c9a6");
    rim.addColorStop(1, "#a58a5f");
    c.fillStyle = rim;
    c.beginPath();
    c.ellipse(256, 300, 178, 44, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(255,230,170,0.55)";
    c.lineWidth = 2;
    c.stroke();
    // 汤
    const soup = c.createRadialGradient(220, 286, 12, 256, 310, 170);
    soup.addColorStop(0, "#e8b85f");
    soup.addColorStop(0.55, "#b8782f");
    soup.addColorStop(1, "#6d431c");
    c.fillStyle = soup;
    c.beginPath();
    c.ellipse(256, 305, 150, 33, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(80,40,10,0.35)";
    c.lineWidth = 2;
    c.stroke();
    // 面/汤面弧线
    c.lineCap = "round";
    c.strokeStyle = "rgba(255,229,166,0.9)";
    c.lineWidth = 6;
    for (const [sx, sy, dx, dy] of [
      [150, 302, 96, -8],
      [168, 314, 82, 4],
      [190, 296, 70, 6],
    ] as const) {
      c.beginPath();
      c.moveTo(sx, sy);
      c.bezierCurveTo(sx + dx * 0.4, sy + dy - 10, sx + dx * 0.75, sy + dy + 8, sx + dx, sy + dy);
      c.stroke();
    }
    // 青菜与配菜
    const leaf = (x: number, y: number, rot: number, color: string) => {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      const grd = c.createLinearGradient(0, -10, 0, 10);
      grd.addColorStop(0, color);
      grd.addColorStop(1, "rgba(40,80,40,0.85)");
      c.fillStyle = grd;
      c.beginPath();
      c.ellipse(0, 0, 26, 9, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "rgba(220,240,190,0.4)";
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(-18, 0);
      c.lineTo(18, 0);
      c.stroke();
      c.restore();
    };
    leaf(200, 290, -0.3, "#8fbf62");
    leaf(318, 300, 0.4, "#6fa64e");
    leaf(286, 282, 0.1, "#a8d878");
    // 菌片与胡萝卜
    c.fillStyle = "#e8d6b0";
    c.beginPath();
    c.ellipse(338, 290, 13, 7, -0.3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#d97a3a";
    c.beginPath();
    c.arc(230, 318, 7, 0, Math.PI * 2);
    c.fill();
    // 油光
    c.fillStyle = "rgba(255,244,210,0.35)";
    c.beginPath();
    c.ellipse(205, 294, 28, 5, -0.1, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(330, 316, 18, 4, 0.2, 0, Math.PI * 2);
    c.fill();
    // 筷子
    c.save();
    c.rotate(0.58);
    c.fillStyle = "#6d3f20";
    c.fillRect(360, 170, 7, 210);
    c.fillStyle = "#8a5a32";
    c.fillRect(378, 170, 7, 210);
    c.fillStyle = "#d9b45a";
    c.fillRect(360, 170, 7, 18);
    c.fillRect(378, 170, 7, 18);
    c.restore();
    // 热气：柔边曲线
    c.lineCap = "round";
    for (const [sx, sy, h] of [
      [206, 260, 120],
      [256, 246, 150],
      [308, 262, 110],
    ] as const) {
      const steam = c.createLinearGradient(0, sy, 0, sy - h);
      steam.addColorStop(0, "rgba(255,240,215,0.0)");
      steam.addColorStop(0.3, "rgba(255,240,215,0.32)");
      steam.addColorStop(1, "rgba(255,240,215,0)");
      c.strokeStyle = steam;
      c.lineWidth = 10;
      c.beginPath();
      c.moveTo(sx, sy);
      c.bezierCurveTo(sx - 22, sy - h * 0.35, sx + 24, sy - h * 0.6, sx - 6, sy - h);
      c.stroke();
    }
    tex.refresh();
  }

  /** 水墨像素风的标题底：360×640 硬边像素，最近邻放大。 */
  ensureInkTitleTexture(this: TavernScene) {
    if (this.textures.exists("ink-title")) return;
    const W = 360;
    const H = 640;
    const tex = this.textures.createCanvas("ink-title", W, H);
    if (!tex) return;
    const c = tex.getContext();
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    c.fillStyle = "#070b14";
    c.fillRect(0, 0, W, H);
    // 天空的稀疏像素与星
    for (let i = 0; i < 6800; i++) {
      const x = Math.random() * W;
      const y = Math.random() * 470;
      const a = Math.random();
      px(x, y, 1, 1, a > 0.9 ? "#2a3a50" : a > 0.64 ? "#122032" : "#0b1421");
    }
    for (let i = 0; i < 34; i++) {
      px(Math.random() * W, Math.random() * 300, 1, 1, Math.random() > 0.7 ? "#d8c8a0" : "#6a7a8a");
    }
    // 月亮与抖动光晕
    const moon = (cx: number, cy: number, r: number, col: string, chance = 1) => {
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          if (x * x + y * y <= r * r && Math.random() < chance) px(cx + x, cy + y, 1, 1, col);
        }
      }
    };
    moon(272, 106, 34, "#1e2b3e", 0.35);
    moon(272, 106, 26, "#3a4a5e", 0.55);
    moon(272, 106, 20, "#f2e6c2", 1);
    moon(266, 100, 6, "#fff6dc", 1);
    // 云带
    for (const [y0, len] of [
      [150, 150],
      [172, 110],
      [206, 180],
    ] as const) {
      for (let i = 0; i < len * 2.4; i++) {
        px(Math.random() * 360, y0 + Math.random() * 18, 1, 1, Math.random() > 0.55 ? "#1a2638" : "#131e2e");
      }
    }
    // 山的像素三角：逐行填，保留硬边
    const tri = (pts: [number, number][], col: string, edge?: string) => {
      const ys = pts.map((p) => p[1]);
      const minY = Math.floor(Math.min(...ys));
      const maxY = Math.floor(Math.max(...ys));
      for (let y = minY; y <= maxY; y++) {
        const xs: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const [x1, y1] = pts[i];
          const [x2, y2] = pts[(i + 1) % pts.length];
          if ((y1 <= y && y2 >= y) || (y2 <= y && y1 >= y)) {
            if (y1 === y2) {
              xs.push(x1, x2);
            } else {
              xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
            }
          }
        }
        if (xs.length < 2) continue;
        const x0 = Math.floor(Math.min(...xs));
        const x1 = Math.ceil(Math.max(...xs));
        px(x0, y, Math.max(1, x1 - x0), 1, col);
        if (edge && Math.random() > 0.55) {
          px(x0, y, 1, 1, edge);
          px(x1 - 1, y, 1, 1, edge);
        }
      }
    };
    tri(
      [
        [0, 430],
        [90, 330],
        [180, 430],
      ],
      "#101b2a",
      "#1c2b3e",
    );
    tri(
      [
        [140, 440],
        [255, 312],
        [380, 440],
      ],
      "#0d1724",
      "#182638",
    );
    tri(
      [
        [0, 470],
        [70, 390],
        [165, 470],
      ],
      "#0a1420",
      "#152234",
    );
    // 雾气
    for (let i = 0; i < 420; i++) {
      px(20 + Math.random() * 320, 420 + Math.random() * 30, 1, 1, Math.random() > 0.5 ? "#1a2838" : "#243448");
    }
    // 前景山坡与地面
    for (let i = 0; i < 520; i++) {
      px(Math.random() * W, 592 + Math.random() * 48, 1, 1, Math.random() > 0.5 ? "#0b1018" : "#070b12");
    }
    px(0, 618, W, 22, "#0c131b");
    // 左侧松影
    px(67, 512, 5, 108, "#0a1110");
    px(59, 520, 8, 3, "#0c1614");
    px(71, 548, 8, 3, "#0c1614");
    for (const [lx, ly] of [
      [56, 514],
      [64, 528],
      [52, 540],
      [68, 554],
    ] as const) {
      px(lx, ly, 12, 3, "#0c1714");
      px(lx - 3, ly - 2, 9, 2, "#0e1a16");
    }
    // 右侧竹影
    for (const [bx, top] of [
      [292, 520],
      [300, 548],
      [284, 566],
    ] as const) {
      px(bx, top, 2, 110, "#101a14");
      px(bx - 4, top + 14, 10, 2, "#16241a");
      px(bx - 6, top + 38, 12, 2, "#16241a");
      px(bx - 4, top + 62, 10, 2, "#16241a");
    }
    // 两层屋檐
    tri(
      [
        [180, 514],
        [74, 558],
        [286, 558],
      ],
      "#4a201a",
      "#9a3a2a",
    );
    px(68, 556, 26, 3, "#6a2a20");
    px(266, 556, 26, 3, "#6a2a20");
    tri(
      [
        [180, 508],
        [96, 544],
        [264, 544],
      ],
      "#2a1411",
      "#7a2f22",
    );
    for (let y = 518; y < 556; y += 5) {
      const half = Math.floor(((y - 508) / 36) * 84);
      px(180 - half, y, half * 2, 1, "#5a241a");
    }
    // 墙体与柱
    px(112, 558, 136, 62, "#2a1c14");
    px(118, 564, 124, 56, "#3a2818");
    px(112, 558, 10, 62, "#20140d");
    px(238, 558, 10, 62, "#20140d");
    px(112, 558, 136, 3, "#5a3a22");
    // 匾额
    px(154, 558, 52, 14, "#1a120c");
    px(156, 560, 48, 10, "#3a2416");
    px(156, 560, 48, 1, "#d9b45a");
    px(156, 569, 48, 1, "#d9b45a");
    px(176, 563, 3, 4, "#e8c070");
    px(182, 563, 3, 4, "#e8c070");
    // 窗与暖光
    for (const wx of [128, 206]) {
      px(wx, 574, 28, 26, "#3a2a1a");
      px(wx + 2, 576, 24, 22, "#e0a050");
      px(wx + 2, 576, 24, 2, "#f4c878");
      px(wx + 13, 576, 2, 22, "#3a2a1a");
      px(wx + 2, 586, 24, 2, "#3a2a1a");
      for (let i = 0; i < 16; i++) {
        px(wx + 1 + Math.random() * 26, 573 - Math.random() * 10, 1, 1, Math.random() > 0.5 ? "#5a4a3a" : "#3a3028");
      }
      for (let i = 0; i < 10; i++) {
        px(wx + 3 + Math.random() * 22, 578 + Math.random() * 18, 1, 1, "#ffd08a");
      }
    }
    // 门与台阶
    px(172, 588, 16, 32, "#160f0a");
    px(174, 590, 12, 30, "#0b0806");
    px(170, 618, 20, 4, "#4a3420");
    px(166, 622, 28, 3, "#3a2818");
    // 灯笼
    for (const lx of [100, 260]) {
      px(lx - 1, 550, 2, 8, "#1a120a");
      px(lx - 4, 558, 9, 11, "#a02a20");
      px(lx - 3, 559, 7, 8, "#ff6a3a");
      px(lx - 2, 560, 3, 5, "#ffd08a");
      px(lx - 1, 569, 2, 5, "#d9b45a");
      for (let i = 0; i < 10; i++) {
        px(lx - 8 + Math.random() * 16, 556 + Math.random() * 16, 1, 1, "#6a3a2a");
      }
    }
    // 门前石径与草
    for (let i = 0; i < 40; i++) px(150 + Math.random() * 60, 622 + Math.random() * 16, 1, 1, "#3a3a30");
    for (let i = 0; i < 24; i++) px(80 + Math.random() * 200, 626 + Math.random() * 12, 1, 1, "#1a2418");
    // 鹤影
    for (const [cx, cy] of [
      [150, 190],
      [198, 166],
    ] as const) {
      px(cx - 5, cy + 1, 3, 1, "#0a1018");
      px(cx + 2, cy + 1, 3, 1, "#0a1018");
      px(cx - 2, cy, 1, 1, "#0a1018");
      px(cx + 1, cy, 1, 1, "#0a1018");
    }
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  /** 营业内景的像素底：墙、窗、挂画、后柜、灶台、门与地面。 */
  ensureInkInteriorTexture(this: TavernScene) {
    if (this.textures.exists("ink-interior")) return;
    const W = 395;
    const H = 640;
    const tex = this.textures.createCanvas("ink-interior", W, H);
    if (!tex) return;
    const c = tex.getContext();
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    const dab = (x: number, y: number, w: number, col: string) => {
      for (let i = 0; i < w; i++) px(x + Math.random() * w, y + Math.random() * 3, 1, 1, col);
    };
    // 墙
    px(0, 0, W, 505, "#3a2a20");
    px(0, 0, W, 9, "#5a4330");
    px(0, 496, W, 9, "#241a12");
    for (let y = 55; y < 496; y += 55) px(0, y, W, 1, "#2e2118");
    for (const x of [25, 90, 152, 208, 270, 335, 390]) px(x, 0, 3, 505, "#2a1c14");
    // 墙面墨点
    for (let i = 0; i < 900; i++) {
      px(Math.random() * W, Math.random() * 500, 1, 1, Math.random() > 0.5 ? "#302218" : "#422f22");
    }
    // 山水挂画
    px(101, 205, 158, 82, "#1a120c");
    px(105, 209, 150, 74, "#c8b89a");
    px(108, 212, 144, 68, "#d8c8a8");
    for (let i = 0; i < 5; i++) {
      const bx = 120 + i * 24;
      const bh = 18 + Math.random() * 20;
      for (let y = 0; y < bh; y++) px(bx + y * 0.4, 270 - y, 22 - y * 0.3, 1, i % 2 ? "#5a6a5a" : "#4a5a50");
    }
    px(236, 266, 7, 8, "#8a2a22");
    // 匾额
    px(127, 87, 106, 38, "#1a120c");
    px(131, 91, 98, 30, "#3a2416");
    px(131, 91, 98, 1, "#d9b45a");
    px(131, 120, 98, 1, "#d9b45a");
    px(220, 100, 8, 10, "#8a2a22");
    // 窗
    for (const wx of [102, 212]) {
      px(wx - 3, 134, 51, 61, "#2a1a10");
      px(wx, 137, 45, 55, "#1a2638");
      px(wx + 2, 139, 41, 51, "#d99a4a");
      px(wx + 2, 139, 41, 2, "#f4c878");
      px(wx + 22, 139, 2, 51, "#2a1a10");
      px(wx + 2, 162, 41, 2, "#2a1a10");
      // 窗中山与云
      for (let i = 0; i < 6; i++) px(wx + 6 + i * 5, 182 - i * 3, 8, 1, "#3a4a3a");
      dab(wx + 2, 176, 40, "#5a4a32");
      // 暖光
      for (let i = 0; i < 18; i++) px(wx + 4 + Math.random() * 37, 142 + Math.random() * 44, 1, 1, "#ffd08a");
      dab(wx - 2, 196, 48, "#5a3a24");
    }
    // 左侧货架酒坛
    px(15, 250, 65, 8, "#3a2a1a");
    px(15, 310, 65, 8, "#3a2a1a");
    px(15, 370, 65, 8, "#3a2a1a");
    px(17, 250, 3, 128, "#241810");
    px(76, 250, 3, 128, "#241810");
    for (const [row, y] of [232, 292, 352].entries()) {
      for (let j = 0; j < 3; j++) {
        const jx = 24 + j * 19;
        const col = ["#5a7a6a", "#b8742a", "#d8c8a8"][j];
        px(jx, y + 10, 11, 18, col);
        px(jx + 2, y + 6, 7, 5, col);
        px(jx + 4, y + 7, 3, 2, "#2a1a10");
        if (row === 1 && j === 0) px(jx + 4, y + 16, 3, 5, "#d9b45a");
      }
    }
    // 后柜
    px(80, 415, 200, 7, "#1a120c");
    px(80, 422, 200, 48, "#2a1c12");
    px(80, 422, 200, 2, "#5a3a22");
    for (let x = 100; x < 280; x += 30) px(x, 428, 1, 38, "#1a120c");
    for (const [jx, col] of [
      [90, "#5a7a6a"],
      [112, "#b8742a"],
      [134, "#d8c8a8"],
      [230, "#6a7a9a"],
      [252, "#b8742a"],
    ] as const) {
      px(jx, 397, 11, 18, col);
      px(jx + 2, 393, 7, 5, col);
      px(jx + 4, 394, 3, 2, "#2a1a10");
    }
    // 茶壶与算盘
    px(160, 400, 14, 14, "#6a4a2a");
    px(166, 396, 3, 6, "#6a4a2a");
    px(178, 414, 18, 4, "#8a5a32");
    for (let i = 0; i < 5; i++) px(180 + i * 3, 415, 1, 2, "#d9b45a");
    // 小黑猫
    px(246, 408, 10, 6, "#2a2a30");
    px(254, 401, 6, 6, "#2a2a30");
    px(254, 399, 2, 3, "#2a2a30");
    px(259, 399, 2, 3, "#2a2a30");
    px(256, 403, 1, 1, "#ffd98a");
    px(259, 403, 1, 1, "#ffd98a");
    // 挂着的木牌菜单
    for (const bx of [160, 200, 240]) {
      px(bx, 300, 1, 20, "#6a4a2a");
      px(bx - 12, 320, 25, 34, "#1a120c");
      px(bx - 10, 323, 21, 28, "#3a2818");
      px(bx - 10, 323, 21, 1, "#d9b45a");
      for (let i = 0; i < 3; i++) px(bx - 5, 330 + i * 6, 11, 1, "#c8b89a");
    }
    // 灶台
    px(7, 440, 75, 65, "#7a7268");
    px(7, 432, 75, 12, "#5f5850");
    px(20, 418, 38, 16, "#4a4a4a");
    px(22, 414, 34, 8, "#8a827a");
    for (let i = 0; i < 8; i++) {
      px(28 + Math.random() * 24, 414 + Math.random() * 8, 2, 2, i % 2 ? "#ff7a3a" : "#ffd06a");
    }
    for (let i = 0; i < 5; i++) px(8 + i * 14, 496, 11, 4, "#8a8276");
    // 门口与红帘
    px(296, 410, 88, 95, "#2a1a10");
    px(302, 416, 76, 89, "#1a120c");
    px(330, 416, 8, 89, "#5a3a22");
    for (let i = 0; i < 4; i++) px(305 + i * 17, 416, 13, 20, i % 2 ? "#8b2f22" : "#a03a2a");
    px(298, 505, 84, 6, "#4a3420");
    dab(310, 505, 60, "#ffb060");
    // 地面
    px(0, 505, W, 135, "#6a5238");
    for (let y = 512; y < 640; y += 14) px(0, y, W, 1, "#4a3826");
    for (let x = 8; x < W; x += 26) px(x, 505, 1, 135, "#5a442e");
    for (let i = 0; i < 700; i++) px(Math.random() * W, 505 + Math.random() * 135, 1, 1, "#57422c");
    // 灯笼
    for (const lx of [40, 320]) {
      px(lx - 1, 184, 2, 6, "#1a120a");
      px(lx - 4, 190, 9, 12, "#a02a20");
      px(lx - 2, 192, 5, 7, "#ff6a3a");
      px(lx - 1, 202, 2, 4, "#d9b45a");
      dab(lx - 8, 190, 18, "#6a3a24");
      dab(lx - 12, 198, 26, "#5a3424");
    }
    // 两束斜光，抖动像素
    for (let i = 0; i < 380; i++) {
      const y = 195 + Math.random() * 300;
      const x = 108 + (y - 195) * 0.45 + (Math.random() - 0.5) * 34;
      px(x, y, 1, 1, Math.random() > 0.5 ? "#7a5a3a" : "#8a6844");
    }
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  /** 夜修视图背景：酒楼后方的法坛。天空留空，透出随夜修推进变色的实时天空；酒楼只在右缘露出一条。 */
  ensureClosedInkTexture(this: TavernScene) {
    if (this.textures.exists("ink-closed")) return;
    const W = 360;
    const H = 640;
    const tex = this.textures.createCanvas("ink-closed", W, H);
    if (!tex) return;
    const c = tex.getContext();
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    const tri = (pts: [number, number][], col: string, edge?: string) => {
      const ys = pts.map((p) => p[1]);
      for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) {
        const xs: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const [x1, y1] = pts[i];
          const [x2, y2] = pts[(i + 1) % pts.length];
          if ((y1 <= y && y2 >= y) || (y2 <= y && y1 >= y)) {
            xs.push(y1 === y2 ? x1 : x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
          }
        }
        if (xs.length < 2) continue;
        const x0 = Math.floor(Math.min(...xs));
        const x1 = Math.ceil(Math.max(...xs));
        px(x0, y, Math.max(1, x1 - x0), 1, col);
        if (edge && Math.random() > 0.6) px(x0, y, 1, 1, edge);
      }
    };
    /** 实心椭圆，按行扫描。 */
    const ellipse = (cx: number, cy: number, rx: number, ry: number, col: string, top = -Infinity, bottom = Infinity) => {
      for (let y = Math.max(top, cy - ry); y <= Math.min(bottom, cy + ry); y++) {
        const half = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2));
        px(cx - half, y, half * 2, 1, col);
      }
    };
    c.clearRect(0, 0, W, H);
    // 远山（天空留空）
    tri([[-20, 330], [70, 262], [170, 330]], "#0f1a28", "#1a2a3c");
    tri([[110, 330], [230, 250], [380, 330]], "#0c1622", "#172536");
    // 庭院石地
    px(0, 318, W, H - 318, "#12171d");
    for (let y = 330; y < H; y += 14) px(0, y, W, 1, "#1a2028");
    for (let i = 0; i < 900; i++) px(Math.random() * W, 318 + Math.random() * (H - 318), 1, 1, Math.random() > 0.5 ? "#181e26" : "#0c1015");
    // 竹
    for (const [bx, top] of [[10, 150], [22, 196]] as const) {
      px(bx, top, 3, 330 - top, "#101a14");
      for (let i = 0; i < 5; i++) px(bx - 7, top + 18 + i * 32, 14, 2, "#16241a");
    }
    // 幡：两根旗杆挂长条法幡
    for (const [x, col] of [[52, "#5a2a3a"], [286, "#2a3a5a"]] as const) {
      px(x, 120, 3, 250, "#3a2a1a");
      px(x - 2, 116, 7, 4, "#d9b45a");
      px(x + 3, 128, 14, 118, col);
      px(x + 3, 128, 14, 2, "#d9b45a");
      px(x + 3, 244, 14, 2, "#d9b45a");
      for (let y = 140; y < 236; y += 14) px(x + 7, y, 6, 6, "#c8a860");
      for (let i = 0; i < 4; i++) px(x + 4 + i * 4, 246, 2, 10 + (i % 2) * 6, col);
    }
    // 后方香鼎：三足双耳，鼎口冒青烟
    const dx = 180;
    px(dx - 34, 296, 68, 4, "#8a7a4a");
    px(dx - 30, 300, 60, 34, "#5a4a2e");
    px(dx - 30, 300, 60, 3, "#a8925a");
    px(dx - 26, 312, 52, 2, "#3a3020");
    for (const gx of [dx - 18, dx - 4, dx + 10]) px(gx, 318, 8, 6, "#7a6a3e");
    px(dx - 40, 300, 8, 10, "#5a4a2e");
    px(dx + 32, 300, 8, 10, "#5a4a2e");
    for (const lx of [dx - 26, dx - 3, dx + 20]) px(lx, 334, 6, 16, "#4a3c24");
    for (let i = 0; i < 46; i++) px(dx - 10 + Math.random() * 20 + Math.sin(i) * 8, 220 + Math.random() * 74, 1, 1, "#4a6a6a");
    // 法坛：椭圆台面 + 前沿石壁 + 两级台阶
    const cy = 412;
    ellipse(180, cy + 22, 156, 50, "#1c2028");
    px(24, cy, 312, 22, "#1c2028");
    for (let x = 40; x < 330; x += 26) px(x, cy + 4, 1, 50, "#14171d");
    ellipse(180, cy, 156, 50, "#2c313a");
    ellipse(180, cy, 150, 46, "#353b46");
    ellipse(180, cy, 112, 32, "#2e333d");
    // 符文环：一圈青光点
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      px(180 + Math.cos(a) * 128, cy + Math.sin(a) * 39, 2, 1, k % 4 === 0 ? "#bff4ee" : "#4ab8b0");
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      px(180 + Math.cos(a) * 92 - 2, cy + Math.sin(a) * 26 - 1, 5, 3, "#5ad0c4");
    }
    ellipse(180, cy + 76, 120, 12, "#262a32", cy + 70);
    ellipse(180, cy + 92, 136, 12, "#20242b", cy + 86);
    // 石灯
    for (const lx of [44, 316]) {
      px(lx - 6, cy - 34, 12, 4, "#4a505a");
      px(lx - 4, cy - 30, 8, 8, "#2a2e36");
      px(lx - 2, cy - 28, 4, 4, "#ffd08a");
      px(lx - 7, cy - 22, 14, 3, "#4a505a");
      px(lx - 3, cy - 19, 6, 20, "#3a3e46");
    }
    // 右缘露出的酒楼后墙：一截屋檐、后窗暖光、一盏灯笼
    tri([[300, 136], [360, 104], [360, 148], [300, 148]], "#2a1411", "#7a2f22");
    px(296, 146, 64, 5, "#5a241a");
    px(318, 151, 42, 330, "#2a1c14");
    px(318, 151, 6, 330, "#20140d");
    px(334, 210, 26, 30, "#3a2a1a");
    px(337, 213, 23, 24, "#e0a050");
    px(337, 213, 23, 3, "#f4c878");
    px(347, 213, 2, 24, "#3a2a1a");
    px(330, 150, 2, 12, "#1a120a");
    px(325, 162, 11, 14, "#a02a20");
    px(326, 163, 9, 10, "#ff6a3a");
    px(328, 164, 4, 6, "#ffd08a");
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}
