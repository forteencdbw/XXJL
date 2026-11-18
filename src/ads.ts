// 广告入口：游戏只认「看没看完」，不认具体广告平台。
// 接真实 SDK 时只改这个函数体（并处理失败/无填充），调用方不用动。
import { GAME } from "./config";

/** 播放一次激励广告；返回是否完整看完。本期是模拟等待的桩。 */
export async function showRewardedAd(): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, GAME.ads.stubMs));
  return true;
}
