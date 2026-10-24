import { describe, expect, it } from "vitest";
import { BGM_BEAT_MS, BGM_PATTERN } from "./audio";

describe("BGM 乐句", () => {
  it("包含长短音、休止与低音层，节拍与频率合理", () => {
    expect(BGM_PATTERN.length).toBeGreaterThan(8);
    expect(BGM_BEAT_MS).toBeGreaterThan(0);
    expect(BGM_PATTERN.some((step) => step.note === null)).toBe(true);
    expect(BGM_PATTERN.some((step) => step.bass !== undefined)).toBe(true);
    expect(new Set(BGM_PATTERN.map((step) => step.beats)).size).toBeGreaterThan(1);
    for (const step of BGM_PATTERN) {
      expect(step.beats).toBeGreaterThan(0);
      if (step.note !== null) {
        expect(step.note).toBeGreaterThan(100);
        expect(step.note).toBeLessThan(1200);
      }
      if (step.bass !== undefined) expect(step.bass).toBeLessThan(step.note ?? 1200);
    }
  });
});
