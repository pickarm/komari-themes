import type { FarmScene } from "./themeSettings";
const FARM_DAY_START_HOUR = 6;
const FARM_DAY_END_HOUR = 18;

export function farmSceneOf(date: Date = new Date()): FarmScene {
  const hour = date.getHours();
  return hour >= FARM_DAY_START_HOUR && hour < FARM_DAY_END_HOUR ? "day" : "dusk";
}

// 真实月份 → 农场四季：3–5 春 / 6–8 夏 / 9–11 秋 / 12–2 冬。只影响场景配色
//（天色 / 草地 / 栅栏 / 野花），卡片与其他外观不变。
export type FarmSeason = "spring" | "summer" | "autumn" | "winter";

export function farmSeasonOf(date: Date = new Date()): FarmSeason {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

/** 按访客本地时间，在午夜或昼夕边界重新计算，含 1 秒余量。 */
export function msUntilNextFarmBoundary(now: Date = new Date()): number {
  const hour = now.getHours();
  const nextHour =
    hour < FARM_DAY_START_HOUR
      ? FARM_DAY_START_HOUR
      : hour < FARM_DAY_END_HOUR
        ? FARM_DAY_END_HOUR
        : 24 + FARM_DAY_START_HOUR;
  const next = new Date(now);
  next.setHours(nextHour, 0, 1, 0); // setHours(30) 会自动进位到次日 6 点
  // A season can change at midnight while the day/dusk scene stays unchanged.
  const midnight = new Date(now);
  midnight.setHours(24, 0, 1, 0);
  return Math.min(next.getTime(), midnight.getTime()) - now.getTime();
}

