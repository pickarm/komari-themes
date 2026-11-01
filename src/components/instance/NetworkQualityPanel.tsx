import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Sprout } from "lucide-react";
import { InstancePanel } from "./InstancePanel";
import { CARRIERS, PROVINCES, NetworkUnavailable, formatLatency, formatLoss, getNetworkQuality, packetLabel, reportTime, routeFor, type NetworkReport } from "@/services/networkQuality";

const REPORT_LABELS = { succeeded: "检测完成", partial: "部分完成", failed: "检测失败" };
const ROUTE_LABELS = { ok: "正常", "no-response": "无响应", failed: "检测失败", unsupported: "不支持" };
const UNLOCK_LABELS = { available: "已解锁", restricted: "受限", unknown: "未确定", unsupported: "不支持" };

function RouteTable({ report, family }: { report: NetworkReport; family: number }) {
  const [carrier, setCarrier] = useState<string>("电信");
  return <>
    <p className="nq-footnote">{packetLabel(report, family)}</p>
    <div className="nq-mobile-carriers" role="group" aria-label="选择运营商">
      {CARRIERS.map((name) => <button key={name} type="button" aria-pressed={carrier === name} onClick={() => setCarrier(name)}>{name}</button>)}
    </div>
    <div className="nq-table-wrap" tabIndex={0} role="region" aria-label="三网三十一省线路、延迟与丢包率">
      <table className="nq-route-table">
        <caption className="sr-only">IPv{family} 三网三十一省检测结果。未检测和缺失数据以横线显示。</caption>
        <thead><tr><th scope="col">省份</th>{CARRIERS.map((name) => <th scope="col" key={name} className={carrier !== name ? "nq-carrier-hidden" : undefined}>{name}<small>线路 · 延迟 · 丢包</small></th>)}</tr></thead>
        <tbody>{PROVINCES.map((province) => <tr key={province}>
          <th scope="row">{province}</th>
          {CARRIERS.map((name) => {
            const route = routeFor(report.routes, province, name, family);
            return <td key={name} className={carrier !== name ? "nq-carrier-hidden" : undefined}>
              <span className="nq-route-line">{route?.line || (route ? ROUTE_LABELS[route.status] : "未检测")}</span>
              <span className="nq-route-metrics"><span>{formatLatency(route?.latency)}</span><span className={(route?.loss ?? 0) > 5 ? "nq-warning" : undefined}>{formatLoss(route?.loss)}</span></span>
              {route && route.status !== "ok" && route.line && <small className="nq-muted">{ROUTE_LABELS[route.status]}</small>}
              {route?.sent != null && route.received != null && <small className="nq-muted">收包 {route.received} / 发包 {route.sent}</small>}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="nq-footnote">表格展示检测时的线路与采样结果，不代表持续连通性；无响应可能由目标限速或屏蔽探测造成。</p>
  </>;
}

export function NetworkQualityPanel({ uuid }: { uuid: string }) {
  const [reportId, setReportId] = useState("");
  const [tab, setTab] = useState<"routes" | "unlocks">("routes");
  const [family, setFamily] = useState<4 | 6>(4);
  const query = useQuery({
    queryKey: ["network-quality", uuid, reportId],
    queryFn: ({ signal }) => getNetworkQuality(uuid, reportId, signal),
    staleTime: 30_000, refetchInterval: 60_000,
    retry: (count, error) => !(error instanceof NetworkUnavailable) && count < 1,
  });
  const data = query.data?.enabled ? query.data : null;
  const report = data?.latest;
  const effectiveFamily = report?.ipv === "6" ? 6 : report?.ipv === "4" ? 4 : family;
  return <InstancePanel className="network-quality-panel" title="网络检测档案" kicker={<><Sprout size={14} /> 庄园观测站</>}
    description="三网线路与解锁检测 · 定时检测结果归档"
    aside={<button type="button" className="nq-refresh" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="刷新检测历史"><RefreshCw size={14} />{query.isFetching ? "读取中" : "刷新"}</button>}>
    {query.isLoading && <p className="nq-empty" role="status">正在翻阅检测档案…</p>}
    {query.isError && <p className="nq-empty" role="status">{query.error.message}</p>}
    {query.data?.enabled === false && <p className="nq-empty">网络检测已关闭。开启后，检测结果会保存在这里。</p>}
    {data && <>
      <div className="nq-toolbar">
        <label className="nq-history">检测记录<select aria-label="检测记录" value={reportId} onChange={(event) => setReportId(event.target.value)}>
          <option value="">最近一次</option>
          {data.reports.map((item) => <option key={item.id} value={item.id}>{reportTime(item.completedAt)} · {REPORT_LABELS[item.status]}</option>)}
        </select></label>
        {report && <span className={`nq-status is-${report.status}`}>{REPORT_LABELS[report.status]}</span>}
      </div>
      {!report && <p className="nq-empty">还没有检测记录。管理员完成首次检测后，这里会展示结果。</p>}
      {report && <>
        <div className="nq-report-meta"><span>完成于 {reportTime(report.completedAt)}</span><span>开始于 {reportTime(report.startedAt)}</span></div>
        <div className="nq-tabs">
          <div role="group" aria-label="检测项目"><button type="button" aria-pressed={tab === "routes"} onClick={() => setTab("routes")}>三网线路</button><button type="button" aria-pressed={tab === "unlocks"} onClick={() => setTab("unlocks")}>解锁检测</button></div>
          <div role="group" aria-label="IP 协议"><button type="button" disabled={report.ipv === "6"} aria-pressed={effectiveFamily === 4} onClick={() => setFamily(4)}>IPv4</button><button type="button" disabled={report.ipv === "4"} aria-pressed={effectiveFamily === 6} onClick={() => setFamily(6)}>IPv6</button></div>
        </div>
        {tab === "routes" ? <RouteTable report={report} family={effectiveFamily} /> : <div className="nq-unlock-grid">
          {report.unlocks.filter((item) => item.family === effectiveFamily).map((item, index) => <article className="nq-unlock-card" key={`${item.service}-${index}`}>
            <div><strong>{item.service}</strong><span className={`nq-unlock-status is-${item.status}`}>{UNLOCK_LABELS[item.status]}</span></div>
            {item.region && <p>地区：{item.region}</p>}{item.detail && <p className="nq-muted">{item.detail}</p>}
          </article>)}
          {!report.unlocks.some((item) => item.family === effectiveFamily) && <p className="nq-empty">本次没有 IPv{effectiveFamily} 解锁检测结果。</p>}
        </div>}
        {report.errors.length > 0 && <details className="nq-errors"><summary>部分检测未完成（{report.errors.length}）</summary><ul>{report.errors.map((error, index) => <li key={index}>{error}</li>)}</ul></details>}
      </>}
      <p className="nq-footnote">此页只读取历史结果；打开或刷新页面不会在服务器执行检测。时间按浏览器所在时区显示。</p>
    </>}
  </InstancePanel>;
}
