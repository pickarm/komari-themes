import { afterEach, describe, expect, it, vi } from "vitest";
import { NetworkPublicSchema, NetworkUnavailable, formatLatency, formatLoss, getNetworkQuality, packetLabel, routeFor } from "../networkQuality";

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
