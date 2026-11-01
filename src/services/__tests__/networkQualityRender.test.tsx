import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NetworkQualityErrorState, RouteChangeNotice, RouteTable } from "@/components/instance/NetworkQualityPanel";
import { PROVINCES, CARRIERS, NetworkUnavailable, type NetworkReport } from "../networkQuality";
const report: NetworkReport = { id: "test", uuid: "test", startedAt: "", completedAt: "", status: "succeeded", ipv: "both", unlocks: [], errors: [], routes: PROVINCES.flatMap((province) => CARRIERS.map((carrier) => ({ province, carrier, family: 4, packetType: "large", line: "<script>alert(1)</script>", latency: 0, loss: 0, sent: 30, received: 30, status: "ok" }))) };
describe("route table rendering", () => {
  it("renders all 93 cells with zeroes and treats upstream output as text", () => {
    const html = renderToStaticMarkup(<RouteTable report={report} family={4} />);
    expect((html.match(/<td/g) ?? []).length).toBe(93);
    expect((html.match(/<th scope="row"/g) ?? []).length).toBe(31);
    expect(html).toContain("0.0 ms");
    expect(html).toContain("0.0%");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("只看异常");
  });
  it("shows an empty module state instead of inventing IPv6 samples", () => {
    const html = renderToStaticMarkup(<RouteTable report={report} family={6} />);
    expect(html).toContain("本次没有 IPv6 线路检测结果");
    expect(html).not.toContain("<td");
  });
});

describe("route change notice", () => {
  it("emphasizes changes with before/after and time; unknown text stays escaped", () => {
    const changed: NetworkReport = { ...report, routeComparison: { compared: 93, changes: [{ province: "北京", carrier: "电信", family: 4, packetType: "large", before: "163", after: "<img onerror=alert(1)>", previousReportId: "old", previousCompletedAt: "2026-11-01T00:00:00Z" }] } };
    const html = renderToStaticMarkup(<RouteChangeNotice report={changed} />);
    expect(html).toContain("线路变化提醒");
    expect(html).toContain("发现 1 项线路变化");
    expect(html).toContain("<del>163</del>");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    expect(renderToStaticMarkup(<RouteTable report={changed} family={4} />)).toContain("nq-route-changed");
  });
  it("distinguishes no baseline from unchanged measured targets and old plugin reports", () => {
    expect(renderToStaticMarkup(<RouteChangeNotice report={report} />)).toContain("没有线路对比信息");
    expect(renderToStaticMarkup(<RouteChangeNotice report={{ ...report, routeComparison: { compared: 0, changes: [] } }} />)).toContain("先建立对比基线");
    expect(renderToStaticMarkup(<RouteChangeNotice report={{ ...report, routeComparison: { compared: 5, changes: [] } }} />)).toContain("已对比 5 个有效目标");
    expect(renderToStaticMarkup(<RouteChangeNotice report={{ ...report, routes: [] }} />)).toBe("");
  });
});

describe("visitor empty state", () => {
  it("names the plugin and configuration action when the integration is unavailable", () => {
    const html = renderToStaticMarkup(<NetworkQualityErrorState error={new NetworkUnavailable()} />);
    expect(html).toContain("暂未配置网络检测");
    expect(html).toContain("网络检测与历史报告");
    expect(html).toContain("公开展示设置");
  });
  it("never displays raw parser/transport errors, even when an unknown exception reaches the view", () => {
    const html = renderToStaticMarkup(<NetworkQualityErrorState error={new SyntaxError(`Unexpected token '<', '<!DOCTYPE' is not valid JSON`)} />);
    expect(html).toContain("暂时无法读取检测记录");
    expect(html).not.toContain("Unexpected");
    expect(html).not.toContain("DOCTYPE");
  });
});
