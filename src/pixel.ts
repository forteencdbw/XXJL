import Phaser from "phaser";

/** 代码绘制的 48×64 像素小人，世界内以最近邻放大。 */
export interface PixelStyle {
  body: number;
  hair: number;
  longHair: boolean;
  look: string;
  seated: boolean;
  dining: boolean;
  blink: boolean;
}

const W = 48;
const H = 64;

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const shade = (color: string, f: number) => {
  const n = parseInt(color.slice(1), 16);
  return `rgb(${Math.floor(((n >> 16) & 255) * f)},${Math.floor(((n >> 8) & 255) * f)},${Math.floor(
    (n & 255) * f,
  )})`;
};

export function pixelKey(s: PixelStyle): string {
  return `px-${s.look}-${s.body}-${s.hair}-${s.longHair ? 1 : 0}-${s.seated ? 1 : 0}-${s.dining ? 1 : 0}-${
    s.blink ? 1 : 0
  }`;
}

export function drawPixelCharacter(ctx: CanvasRenderingContext2D, s: PixelStyle) {
  const body = hex(s.body);
  const hair = hex(s.hair);
  const dark = shade(body, 0.66);
  const deep = shade(body, 0.44);
  const skin = s.look === "demon" || s.look === "demonlord" ? "#e8c8a8" : "#f4d3a8";
  const skinSh = "#d9a878";
  const trim = "#d9b45a";
  const f = (x: number, y: number, w = 1, h = 1, col = body) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  };
  ctx.clearRect(0, 0, W, H);
  // 影子
  for (let i = 0; i < 3; i++) f(12 - i, 60 + i, 24 + i * 2, 1, `rgba(0,0,0,${0.2 - i * 0.05})`);
  // 脚
  if (!s.seated) {
    f(18, 56, 5, 6, "#1a1410");
    f(27, 56, 5, 6, "#1a1410");
  }
  // 剑
  if (s.look === "sword" || s.look === "player") {
    for (let i = 0; i < 22; i++) f(41 - Math.floor(i * 0.22), 20 + i, 1, 1, i % 3 === 0 ? "#e8eef4" : "#b8c4d0");
    f(38, 18, 4, 2, "#7a4a2a");
    f(39, 16, 2, 3, "#d9b45a");
  }
  // 长杖
  if (s.look === "elder") {
    f(43, 14, 2, 46, "#6a4528");
    f(42, 12, 4, 3, "#d9b45a");
  }
  // 葫芦
  if (s.look === "alchemist" || s.look === "demon") {
    f(40, 42, 6, 7, "#c8a04a");
    f(41, 39, 4, 4, "#8a6a2a");
    f(41, 49, 4, 5, "#c8a04a");
  }
  // 长发
  if (s.longHair) {
    f(13, 10, 4, 28, hair);
    f(33, 10, 4, 28, hair);
    f(14, 28, 2, 12, shade(hair, 0.8));
    f(34, 28, 2, 12, shade(hair, 0.8));
  }
  // 袍身
  const spans: [number, number, number][] = [
    [24, 16, 32],
    [28, 14, 34],
    [34, 13, 35],
    [42, 12, 36],
    [50, 11, 37],
    [56, 11, 37],
  ];
  for (let i = 0; i < spans.length - 1; i++) {
    const [y0, x0, x1] = spans[i];
    f(x0, y0, x1 - x0 + 1, spans[i + 1][0] - y0, body);
  }
  f(13, 32, 2, 23, dark);
  f(34, 32, 2, 23, deep);
  f(23, 34, 1, 16, dark);
  f(11, 56, 26, 2, trim);
  f(10, 58, 28, 2, dark);
  // 领口、腰带
  f(21, 22, 6, 5, skin);
  f(19, 24, 5, 6, "#3a2a20");
  f(25, 24, 5, 6, "#3a2a20");
  f(19, 24, 4, 2, trim);
  f(26, 24, 4, 2, trim);
  f(13, 43, 22, 2, "#8a2a22");
  f(13, 44, 22, 1, trim);
  // 宽袖与手
  f(9, 29, 8, 18, body);
  f(32, 29, 8, 18, body);
  f(9, 44, 8, 3, dark);
  f(32, 44, 8, 3, deep);
  f(10, 47, 5, 5, skin);
  f(34, 47, 5, 5, skin);
  // 头与发
  f(14, 5, 20, 9, hair);
  f(12, 8, 4, 19, hair);
  f(33, 8, 4, 19, hair);
  f(15, 2, 5, 3, hair);
  f(21, 1, 6, 4, hair);
  f(28, 2, 5, 3, hair);
  f(16, 10, 18, 14, skin);
  f(15, 8, 20, 3, hair);
  f(16, 11, 4, 3, hair);
  f(23, 10, 2, 2, hair);
  f(31, 10, 3, 3, hair);
  f(16, 12, 2, 2, skinSh);
  f(32, 12, 1, 2, skinSh);
  // 眉眼
  f(18, 14, 5, 1, shade(hair, 0.8));
  f(27, 14, 5, 1, shade(hair, 0.8));
  if (s.blink || s.dining) {
    f(19, 17, 4, 1, "#1a1210");
    f(28, 17, 4, 1, "#1a1210");
  } else {
    f(19, 16, 4, 3, "#fff6e8");
    f(28, 16, 4, 3, "#fff6e8");
    f(21, 17, 1, 2, "#1a1210");
    f(29, 17, 1, 2, "#1a1210");
    f(20, 16, 1, 1, "#ffffff");
    f(28, 16, 1, 1, "#ffffff");
  }
  f(24, 20, 2, 1, skinSh);
  f(24, 22, 2, 1, s.dining ? "#b05a48" : "#8a4a3a");
  f(16, 20, 3, 1, "rgba(210,110,100,.3)");
  f(31, 20, 3, 1, "rgba(210,110,100,.3)");
  // 草帽
  if (s.look === "mortal") {
    f(8, 7, 32, 3, "#c8a060");
    f(12, 4, 24, 3, "#b89050");
    f(15, 2, 18, 2, "#a88048");
    f(10, 9, 28, 1, "#8a6a3a");
  }
  // 妖角
  if (s.look === "demon" || s.look === "demonlord") {
    f(13, 2, 2, 5, "#8a2a22");
    f(34, 2, 2, 5, "#8a2a22");
    f(11, 0, 3, 3, "#c84a3a");
    f(35, 0, 3, 3, "#c84a3a");
  }
  // 跑堂托盘
  if (s.look === "server") {
    f(36, 45, 8, 1, "#8a6a4a");
    f(38, 44, 1, 2, "#d9b45a");
    f(41, 44, 1, 2, "#d9b45a");
    f(40, 42, 3, 3, "#e8dcc0");
  }
  // 灶上锅勺
  if (s.look === "cook") {
    f(39, 46, 1, 14, "#8a5a32");
    f(36, 59, 7, 2, "#b8c4d0");
  }
  // 迎客酒旗
  if (s.look === "hawker") {
    f(44, 22, 1, 38, "#6a4528");
    f(45, 22, 9, 11, "#8a2a22");
    f(46, 24, 7, 7, "#d9b45a");
  }
  // 坐姿
  if (s.seated) {
    f(8, 56, 32, 7, body);
    f(9, 60, 30, 3, dark);
    f(10, 58, 28, 2, trim);
  }
}

export function getPixelTexture(scene: Phaser.Scene, s: PixelStyle): string {
  const key = pixelKey(s);
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, W, H);
  if (!tex) return key;
  drawPixelCharacter(tex.getContext(), s);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}
