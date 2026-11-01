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
  status: z.enum(["ok", "no-response", "failed", "unsupported"]),
});
export const NetworkReportSchema = z.object({
  id: z.string(), uuid: z.string(), startedAt: z.string(), completedAt: z.string(),
  status: ReportStatus, ipv: z.enum(["4", "6", "both"]),
  packetType: z.enum(["large", "standard"]).optional(),
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
  return routes.find((route) => provinceName(route.province) === province && route.carrier === carrier && route.family === family);
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
export function packetLabel(report: Pick<NetworkReport, "packetType">, family: number) {
  if (family === 6) return "IPv6 标准 TCP 探测";
  if (report.packetType === "large") return "IPv4 TCP 大包探测";
  if (report.packetType === "standard") return "IPv4 标准 TCP 探测";
  return "IPv4 · 未标注包类型";
}
