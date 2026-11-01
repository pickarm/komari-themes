import { describe, expect, it } from "vitest";
import { farmSceneOf, farmSeasonOf, msUntilNextFarmBoundary } from "../farmCalendar";

describe("visitor local calendar", () => {
  it("uses all twelve visitor-local months, including seasonal boundaries", () => {
    const seasons = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"];
    seasons.forEach((season, month) => expect(farmSeasonOf(new Date(2026, month, 1, 0, 0))).toBe(season));
    expect(farmSeasonOf(new Date(2026, 1, 28, 23, 59))).toBe("winter");
    expect(farmSeasonOf(new Date(2026, 2, 1, 0, 0))).toBe("spring");
  });
  it("refreshes at midnight even though dusk continues across the season boundary", () => {
    const now = new Date(2026, 10, 30, 23, 59, 0);
    const next = new Date(now.getTime() + msUntilNextFarmBoundary(now));
    expect(next.getMonth()).toBe(11);
    expect(next.getHours()).toBe(0);
    expect(next.getSeconds()).toBe(1);
    expect(farmSeasonOf(now)).toBe("autumn");
    expect(farmSeasonOf(next)).toBe("winter");
    expect(farmSceneOf(now)).toBe(farmSceneOf(next));
  });
  it("keeps day/dusk changes and calendar-year rollover", () => {
    for (const [hour, expectedHour] of [[5, 6], [17, 18], [23, 0]]) {
      const date = new Date(2026, 11, 31, hour, 30);
      const next = new Date(date.getTime() + msUntilNextFarmBoundary(date));
      expect(next.getHours()).toBe(expectedHour);
      expect(next.getMinutes()).toBe(0);
      if (hour === 23) expect(next.getFullYear()).toBe(2027);
    }
    expect(farmSceneOf(new Date(2026, 0, 1, 6))).toBe("day");
    expect(farmSceneOf(new Date(2026, 0, 1, 18))).toBe("dusk");
  });
});
