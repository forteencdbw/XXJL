import { describe, expect, it } from "vitest";
import { GAME, validateConfig } from "./config";

describe("validateConfig", () => {
  it("默认配置合法", () => {
    expect(validateConfig(GAME)).toEqual([]);
  });

  it("指出填错的具体项", () => {
    const bad = structuredClone(GAME);
    bad.start.coins = -1;
    bad.reputation.levels[2].threshold = 10;
    bad.patronKinds[0].favorites = ["nope"];
    bad.dishes = [];
    bad.staff.workLines.cook = [];
    const errors = validateConfig(bad).join("\n");
    expect(errors).toContain("start.coins");
    expect(errors).toContain("reputation.levels[2].threshold");
    expect(errors).toContain("「nope」");
    expect(errors).toContain("dishes 不能为空");
    expect(errors).toContain("staff.workLines.cook 不能为空");
  });
});
