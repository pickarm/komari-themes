import { z } from "zod";
import { fetchWithTimeout } from "@/utils/abort";

export const PROVINCES = ["北京", "天津", "河北", "山西", "内蒙古", "辽宁", "吉林", "黑龙江", "上海", "江苏", "浙江", "安徽", "福建", "江西", "山东", "河南", "湖北", "湖南", "广东", "广西", "海南", "重庆", "四川", "贵州", "云南", "西藏", "陕西", "甘肃", "青海", "宁夏", "新疆"] as const;
export const CARRIERS = ["电信", "联通", "移动"] as const;
const maybeNumber = z.number().finite().nullable();
const ReportStatus = z.enum(["succeeded", "partial", "failed"]);
export const NetworkRouteSchema = z.object({
  province: z.string(), carrier: z.enum(CARRIERS), family: z.union([z.literal(4), z.literal(6)]),
  line: z.string().nullable(), latency: maybeNumber, loss: maybeNumber,
  sent: maybeNumber, received: maybeNumber,
  packetType: z.enum(["large", "standard"]).optional(),
  status: z.enum(["ok", "no-response", "failed", "unsupported"]),
});
export const NetworkReportSchema = z.object({
  id: z.string(), uuid: z.string(), startedAt: z.string(), completedAt: z.string(),
  status: ReportStatus, ipv: z.enum(["4", "6", "both"]),
  packetType: z.enum(["large", "standard"]).optional(),
  routeComparison: z.object({
    compared: z.number().int().nonnegative(),
    changes: z.array(z.object({
      province: z.string(), carrier: z.enum(CARRIERS), family: z.union([z.literal(4), z.literal(6)]),
      packetType: z.enum(["large", "standard"]).optional(), before: z.string(), after: z.string(),
      previousReportId: z.string(), previousCompletedAt: z.string(),
    })),
  }).optional(),
  routes: z.array(NetworkRouteSchema),
  unlocks: z.array(z.object({
    service: z.string(), family: z.union([z.literal(4), z.literal(6)]),
    status: z.enum(["available", "restricted", "unknown", "unsupported"]),
    region: z.string().nullable(), detail: z.string().nullable(),
  })), errors: z.array(z.string()),
});
export const NetworkPublicSchema = z.discriminatedUnion("enabled", [
  z.object({ version: z.literal(1), enabled: z.literal(false) }),
  z.object({
    version: z.literal(1), enabled: z.literal(true), node: z.object({ uuid: z.string(), name: z.string() }),
    reports: z.array(z.object({ id: z.string(), completedAt: z.string(), status: ReportStatus })),
    latest: NetworkReportSchema.nullable(),
  }),
]);
export type NetworkReport = z.infer<typeof NetworkReportSchema>;
export type NetworkRoute = z.infer<typeof NetworkRouteSchema>;
export type NetworkPublic = z.infer<typeof NetworkPublicSchema>;
export class NetworkUnavailable extends Error {}

export async function getNetworkQuality(uuid: string, reportId: string, signal?: AbortSignal): Promise<NetworkPublic> {
  const query = new URLSearchParams({ uuid });
  if (reportId) query.set("report_id", reportId);
  const response = await fetchWithTimeout(`/api/plugins/network-quality/v1/public?${query}`, {
    method: "GET", credentials: "same-origin", headers: { Accept: "application/json" },
  }, 15_000, signal);
  if (response.status === 404) throw new NetworkUnavailable("暂无公开检测结果，请在后台检查网络检测插件与节点的公开设置。");
  if (!response.ok) throw new Error("检测历史暂时无法读取，请稍后重试。");
  const result = NetworkPublicSchema.safeParse(await response.json());
  if (!result.success) throw new Error("检测结果格式不兼容，请更新网络检测插件。");
  if (result.data.enabled && (result.data.node.uuid !== uuid || (result.data.latest && result.data.latest.uuid !== uuid))) {
    throw new Error("检测结果与当前节点不匹配。");
  }
  return result.data;
}

export function provinceName(value: string): string {
  return PROVINCES.find((province) => value.startsWith(province)) ?? value;
}
export function routeFor(routes: NetworkRoute[], province: string, carrier: string, family: number) {
  const matches = routes.filter((route) => provinceName(route.province) === province && route.carrier === carrier && route.family === family);
  return matches.find((route) => route.packetType === "large") ?? matches[0];
}
export function formatLatency(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value >= 0 ? `${value.toFixed(1)} ms` : "—";
}
export function formatLoss(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value >= 0 && value <= 100 ? `${value.toFixed(1)}%` : "—";
}
export function reportTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : date.toLocaleString("zh-CN", { hour12: false });
}
export function packetLabel(report: Pick<NetworkReport, "packetType"> & { routes?: NetworkRoute[] }, family: number) {
  const types = new Set(report.routes?.filter((route) => route.family === family).map((route) => route.packetType).filter(Boolean));
  if (types.size > 1) return `IPv${family} TCP 混合包型（各目标可能不同）`;
  const type = types.values().next().value ?? (family === 4 ? report.packetType : undefined);
  if (type === "large") return `IPv${family} TCP 大包探测`;
  if (type === "standard" || family === 6) return `IPv${family} 标准 TCP 探测`;
  return "IPv4 · 未标注包类型";
}

export type RouteHealth = "normal" | "caution" | "critical" | "unknown";
export function routeHealth(route?: NetworkRoute): RouteHealth {
  if (!route || route.status === "unsupported") return "unknown";
  if (route.status !== "ok") return "critical";
  const latency = route.latency != null && route.latency >= 0 ? route.latency : null;
  const loss = route.loss != null && route.loss >= 0 && route.loss <= 100 ? route.loss : null;
  if ((latency ?? 0) > 240 || (loss ?? 0) > 20) return "critical";
  if ((latency ?? 0) > 150 || (loss ?? 0) > 0) return "caution";
  return latency == null || loss == null ? "unknown" : "normal";
}
export type RouteSort = "province" | "loss" | "latency";
export function visibleProvinces(routes: NetworkRoute[], family: number, carrier: string | undefined, onlyAbnormal: boolean, sort: RouteSort) {
  const carriers = carrier ? [carrier] : CARRIERS;
  const rows = PROVINCES.map((province) => ({ province, routes: carriers.map((name) => routeFor(routes, province, name, family)) }));
  const filtered = onlyAbnormal ? rows.filter((row) => row.routes.some((route) => routeHealth(route) === "critical")) : rows;
  if (sort !== "province") {
    const worst = (row: typeof rows[number]) => Math.max(-1, ...row.routes.map((route) => {
      const value = route?.[sort];
      return value != null && value >= 0 && (sort !== "loss" || value <= 100) ? value : -1;
    }));
    filtered.sort((a, b) => worst(b) - worst(a));
  }
  return filtered.map((row) => row.province);
}
export function routeSummary(routes: NetworkRoute[], family: number, carrier?: string) {
  const carriers = carrier ? [carrier] : CARRIERS;
  const targets = PROVINCES.flatMap((province) => carriers.map((name) => routeFor(routes, province, name, family)));
  return {
    total: targets.length,
    measured: targets.filter((route) => route != null && route.sent != null && route.sent > 0 && route.received != null && route.received >= 0 && route.received <= route.sent).length,
    critical: targets.filter((route) => routeHealth(route) === "critical").length,
    unknown: targets.filter((route) => routeHealth(route) === "unknown").length,
  };
}
export function reportAge(value: string, now = Date.now()) {
  const elapsed = now - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < -300_000) return { label: "检测时间待核实", stale: false };
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  const label = minutes < 1 ? "刚刚归档" : minutes < 60 ? `${minutes} 分钟前检测` : minutes < 1440 ? `${Math.floor(minutes / 60)} 小时前检测` : `${Math.floor(minutes / 1440)} 天前检测`;
  return { label, stale: minutes >= 1440 };
}
