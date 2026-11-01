import { describe, expect, it } from "vitest";
import {
  buildLoadTimeRangeOptions,
  buildPingTimeRangeOptions,
} from "@/components/instance/chartShared";

describe("detail chart time ranges", () => {
  it("offers 30-day Ping history when retention permits it", () => {
    expect(buildPingTimeRangeOptions(90 * 24)).toEqual([
      { label: "1 小时", value: 1 },
      { label: "4 小时", value: 4 },
      { label: "1 天", value: 24 },
      { label: "7 天", value: 168 },
      { label: "30 天", value: 720 },
    ]);
  });

  it("does not offer Ping ranges beyond retention and includes a nonstandard boundary", () => {
    expect(buildPingTimeRangeOptions(48)).toEqual([
      { label: "1 小时", value: 1 }, { label: "4 小时", value: 4 },
      { label: "1 天", value: 24 }, { label: "2 天", value: 48 },
    ]);
    expect(buildPingTimeRangeOptions(12).every((range) => range.value <= 12)).toBe(true);
  });

  it("keeps load history capped at 30 days even with 90 days retained", () => {
    expect(buildLoadTimeRangeOptions(90 * 24)).toEqual([
      { label: "实时", value: 0 },
      { label: "1 小时", value: 1 },
      { label: "4 小时", value: 4 },
      { label: "1 天", value: 24 },
      { label: "7 天", value: 168 },
      { label: "30 天", value: 720 },
    ]);
  });
});
