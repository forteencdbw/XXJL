import { describe, expect, it } from "vitest";
import { decodeSaveCode, encodeSaveCode } from "./savecode";

describe("导出码", () => {
  it("中文/符号存档可以完整往返", () => {
    const data = { v: 2, coins: -12, 名字: "灵膳楼", note: "✓ 飞升", list: [1, 2, 3] };
    const code = encodeSaveCode(data);
    expect(code.startsWith("LS2.")).toBe(true);
    expect(decodeSaveCode(code)).toEqual(data);
  });

  it("容忍首尾空白与换行", () => {
    const code = encodeSaveCode({ v: 2, coins: 20 });
    expect(decodeSaveCode(`\n  ${code}  \n`)).toEqual({ v: 2, coins: 20 });
  });

  it("前缀、Base64、JSON 任一损坏都返回 null", () => {
    expect(decodeSaveCode("")).toBeNull();
    expect(decodeSaveCode("LS1.abc")).toBeNull();
    expect(decodeSaveCode("LS2.%%%")).toBeNull();
    expect(decodeSaveCode(`LS2.${btoa("not json")}`)).toBeNull();
  });
});
