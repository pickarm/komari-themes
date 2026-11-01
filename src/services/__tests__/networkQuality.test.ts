import { afterEach, describe, expect, it, vi } from "vitest";
import { NetworkPublicSchema, NetworkQualityError, NetworkUnavailable, formatLatency, formatLoss, getNetworkQuality, packetLabel, reportAge, routeFor, routeHealth, routeSummary, visibleProvinces, type NetworkRoute } from "../networkQuality";

const report = {
  id: "run-1", uuid: "node-a", startedAt: "2026-11-01T00:00:00Z", completedAt: "2026-11-01T00:02:00Z",
  status: "partial", ipv: "both", routes: [{ province: "广西壮族自治区", carrier: "电信", family: 4, line: "CN2 → 163",
    latency: null, loss: 100, sent: 20, received: 0, status: "no-response" }],
  unlocks: [{ service: "Netflix", family: 4, status: "unknown", region: null, detail: "请求超时" }], errors: ["部分探测点不可用"],
};
const payload = { version: 1, enabled: true, node: { uuid: "node-a", name: "测试节点" }, reports: [{ id: "run-1", completedAt: report.completedAt, status: report.status }], latest: report };
afterEach(() => vi.unstubAllGlobals());
describe("network report public contract", () => {
  it("distinguishes large and standard packets while preserving older unmarked reports", () => {
    expect(packetLabel({}, 4)).toBe("IPv4 · 未标注包类型");
    expect(packetLabel({ packetType: "large" }, 4)).toBe("IPv4 TCP 大包探测");
    expect(packetLabel({ packetType: "standard" }, 4)).toBe("IPv4 标准 TCP 探测");
    expect(packetLabel({ packetType: "large" }, 6)).toBe("IPv6 标准 TCP 探测");
    const data = NetworkPublicSchema.parse({ ...payload, latest: { ...report, packetType: "large" } });
    expect(data.enabled && data.latest?.packetType).toBe("large");
  });
  it("preserves absent latency and a measured 100% loss without inventing a successful probe", () => {
    const data = NetworkPublicSchema.parse(payload);
    if (!data.enabled || !data.latest) throw new Error("missing fixture");
    const route = routeFor(data.latest.routes, "广西", "电信", 4);
    expect(route?.status).toBe("no-response");
    expect(formatLatency(route?.latency)).toBe("—");
    expect(formatLoss(route?.loss)).toBe("100.0%");
    expect(routeFor(data.latest.routes, "北京", "电信", 4)).toBeUndefined();
    expect(formatLoss(undefined)).toBe("—");
    expect(formatLatency(0)).toBe("0.0 ms");
    expect(formatLoss(0)).toBe("0.0%");
  });
  it("accepts disabled and empty history responses", () => {
    expect(NetworkPublicSchema.parse({ version: 1, enabled: false }).enabled).toBe(false);
    expect(NetworkPublicSchema.parse({ ...payload, reports: [], latest: null })).toMatchObject({ latest: null });
    expect(NetworkPublicSchema.safeParse({ ...payload, version: 2 }).success).toBe(false);
  });
  it("only reads the public endpoint and encodes node and report identifiers", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", mock);
    await getNetworkQuality("node-a", "history&other=1");
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe("/api/plugins/network-quality/v1/public?uuid=node-a&report_id=history%26other%3D1");
    expect(init.method).toBe("GET");
  });
  it("treats hidden/unavailable nodes as unavailable, and rejects cross-node history", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    await expect(getNetworkQuality("node-a", "")).rejects.toBeInstanceOf(NetworkUnavailable);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...payload, latest: { ...report, uuid: "node-b" } }))));
    await expect(getNetworkQuality("node-a", "")).rejects.toThrow("当前节点不匹配");
  });
});

const normal: NetworkRoute = { province: "北京", carrier: "电信", family: 4, line: "CN2 GIA", latency: 100, loss: 0, sent: 30, received: 30, status: "ok", packetType: "large" };
describe("network archive presentation", () => {
  it("reads packet type on actual route records and distinguishes mixed packet samples", () => {
    const parsed = NetworkPublicSchema.parse({ ...payload, latest: { ...report, routes: [normal] } });
    if (!parsed.enabled || !parsed.latest) throw new Error("missing fixture");
    expect(parsed.latest.routes[0].packetType).toBe("large");
    expect(packetLabel(parsed.latest, 4)).toBe("IPv4 TCP 大包探测");
    expect(packetLabel({ routes: [normal, { ...normal, province: "天津", packetType: "standard" }] }, 4)).toContain("混合包型");
    expect(packetLabel({ routes: [{ ...normal, family: 6, packetType: "standard" }] }, 6)).toBe("IPv6 标准 TCP 探测");
    expect(routeFor([{ ...normal, packetType: "standard" }, normal], "北京", "电信", 4)?.packetType).toBe("large");
  });
  it("does not classify missing/unsupported/invalid samples as healthy, including legitimate zeroes", () => {
    expect(routeHealth(undefined)).toBe("unknown");
    expect(routeHealth({ ...normal, status: "unsupported" })).toBe("unknown");
    expect(routeHealth({ ...normal, latency: null, loss: null })).toBe("unknown");
    expect(routeHealth({ ...normal, latency: -1, loss: 101 })).toBe("unknown");
    expect(routeHealth({ ...normal, latency: 0, loss: 0 })).toBe("normal");
    expect(routeHealth({ ...normal, latency: 150, loss: 0 })).toBe("normal");
    expect(routeHealth({ ...normal, latency: 240, loss: 20 })).toBe("caution");
    expect(routeHealth({ ...normal, latency: 241 })).toBe("critical");
    expect(routeHealth({ ...normal, latency: null, loss: 100, status: "no-response" })).toBe("critical");
  });
  it("filters only abnormal provinces within selected family and mobile carrier scope", () => {
    const routes: NetworkRoute[] = [normal, { ...normal, province: "天津", carrier: "移动", loss: 30 }, { ...normal, province: "上海", family: 6, status: "failed" }, { ...normal, province: "广东", loss: 5 }, { ...normal, province: "广西", status: "unsupported" }];
    expect(visibleProvinces(routes, 4, undefined, true, "province")).toEqual(["天津"]);
    expect(visibleProvinces(routes, 4, "电信", true, "province")).toEqual([]);
    expect(visibleProvinces(routes, 4, "移动", true, "province")).toEqual(["天津"]);
    expect(visibleProvinces(routes, 6, undefined, true, "province")).toEqual(["上海"]);
    expect(visibleProvinces(routes, 4, undefined, false, "province")).toHaveLength(31);
  });
  it("sorts by worst valid metric with stable ties; missing values stay last", () => {
    const routes: NetworkRoute[] = [normal, { ...normal, province: "天津", loss: 30, latency: 270 }, { ...normal, province: "河北", loss: 30, latency: 90 }, { ...normal, province: "广东", carrier: "移动", loss: null, latency: 400 }];
    expect(visibleProvinces(routes, 4, undefined, false, "loss").slice(0, 3)).toEqual(["天津", "河北", "北京"]);
    expect(visibleProvinces(routes, 4, undefined, false, "latency").slice(0, 3)).toEqual(["广东", "天津", "北京"]);
    expect(visibleProvinces(routes, 4, "电信", false, "latency").slice(0, 3)).toEqual(["天津", "北京", "河北"]);
  });
  it("counts canonical 93 targets once and keeps missing targets visible in coverage", () => {
    const routes: NetworkRoute[] = [normal, normal, { ...normal, carrier: "移动", status: "no-response", loss: 100, received: 0 }, { ...normal, family: 6, status: "failed" }];
    expect(routeSummary(routes, 4)).toEqual({ total: 93, measured: 2, critical: 1, unknown: 91 });
    expect(routeSummary(routes, 4, "电信")).toEqual({ total: 31, measured: 1, critical: 0, unknown: 30 });
  });
  it("labels stale archives without pretending to know the current network state", () => {
    const now = Date.parse("2026-11-02T03:00:00Z");
    expect(reportAge("2026-11-01T03:00:00Z", now)).toEqual({ label: "1 天前检测", stale: true });
    expect(reportAge("2026-11-02T02:59:40Z", now)).toEqual({ label: "刚刚归档", stale: false });
    expect(reportAge("not-a-date", now).label).toBe("检测时间待核实");
    expect(reportAge("2026-12-01T00:00:00Z", now).label).toBe("检测时间待核实");
  });
});

describe("unconfigured and unreadable plugin responses", () => {
  it.each([
    ["<!DOCTYPE html><html><body>Komari</body></html>", "text/html"],
    ["  <HTML lang='zh-CN'>Komari</HTML>", "application/json"],
    ["<div>Plugin not found</div>", "text/html; charset=utf-8"],
    ["", "application/json"],
  ])("treats successful HTML/empty fallback as unconfigured (%s)", async (body, type) => {
    const fetch = vi.fn().mockResolvedValue(new Response(body, { headers: { "content-type": type } }));
    vi.stubGlobal("fetch", fetch);
    await expect(getNetworkQuality("node-a", "")).rejects.toBeInstanceOf(NetworkUnavailable);
    expect(fetch.mock.calls[0][1].method).toBe("GET");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps malformed JSON and server failure distinct from missing integration", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"version":')));
    await expect(getNetworkQuality("node-a", "")).rejects.toThrow("检测数据暂时无法读取");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>proxy failure</html>", { status: 502, headers: { "content-type": "text/html" } })));
    await expect(getNetworkQuality("node-a", "")).rejects.toThrow("检测记录暂时无法读取");
  });
  it("converts transport failures into controlled Chinese messages without exposing raw errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch SECRET_PROXY_DIAGNOSTIC")));
    await expect(getNetworkQuality("node-a", "")).rejects.toThrow("暂时无法连接网络检测服务");
    await expect(getNetworkQuality("node-a", "")).rejects.toBeInstanceOf(NetworkQualityError);
  });
  it("preserves parent cancellation", async () => {
    const signal = AbortSignal.abort();
    const error = new DOMException("cancelled", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    await expect(getNetworkQuality("node-a", "", signal)).rejects.toBe(error);
  });
});
