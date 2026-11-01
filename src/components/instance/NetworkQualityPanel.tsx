import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, RefreshCw, Sprout } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { InstancePanel } from "./InstancePanel";
import { CARRIERS, NetworkQualityError, NetworkUnavailable, formatLatency, formatLoss, getNetworkQuality, packetLabel, provinceName, reportAge, reportTime, routeFor, routeHealth, routeSummary, visibleProvinces, type NetworkReport, type RouteSort } from "@/services/networkQuality";

const REPORT_LABELS = { succeeded: "检测完成", partial: "部分完成", failed: "检测失败" };
const ROUTE_LABELS = { ok: "正常", "no-response": "无响应", failed: "检测失败", unsupported: "不支持" };
const UNLOCK_LABELS = { available: "已解锁", restricted: "受限", unknown: "未确定", unsupported: "不支持" };

function EmptyArchive({ children, loading = false }: { children: React.ReactNode; loading?: boolean }) {
  return <div className="nq-empty" role="status"><Sprout size={28} aria-hidden="true" className={loading ? "nq-leaf-loading" : undefined} /><p>{children}</p></div>;
}


export function NetworkQualityErrorState({ error }: { error: unknown }) {
  const unavailable = error instanceof NetworkUnavailable;
  return <EmptyArchive>
    <strong className="nq-empty-title">{unavailable ? "暂未配置网络检测" : "暂时无法读取检测记录"}</strong>
    <span>{error instanceof NetworkQualityError ? error.message : "请稍后刷新；若持续无法读取，请联系管理员检查网络检测插件。"}</span>
  </EmptyArchive>;
}

export function RouteChangeNotice({ report }: { report: NetworkReport }) {
  if (!report.routes.length) return null;
  const comparison = report.routeComparison;
  if (!comparison) return <p className="nq-comparison-note">此历史报告没有线路对比信息；使用新版网络检测插件完成检测后可查看变化。</p>;
  if (!comparison.changes.length) return <p className="nq-comparison-note">{comparison.compared ? `已对比 ${comparison.compared} 个有效目标，线路名称未变化。未检测或不可比的目标不作判断。` : "暂无可比的上次有效线路；首次检测、包型或引擎改变后，需要先建立对比基线。"}</p>;
  return <section className="nq-change-notice" aria-label="线路变化提醒">
    <strong>发现 {comparison.changes.length} 项线路变化</strong>
    <p>已对比 {comparison.compared} 个有效目标。以下线路名称与同节点上一次可比的成功采样不同。</p>
    <details><summary>查看原线路与本次线路</summary><ul>{comparison.changes.map((change, index) => <li key={index}>
      <strong>{provinceName(change.province)} · {change.carrier} · IPv{change.family}</strong>
      <div><del>{change.before}</del><span aria-hidden="true"> → </span><span className="sr-only">变更为 </span><b>{change.after}</b></div>
      <small>对比记录：{reportTime(change.previousCompletedAt)}</small>
    </li>)}</ul></details>
  </section>;
}

export function RouteTable({ report, family }: { report: NetworkReport; family: number }) {
  const [carrier, setCarrier] = useState<string>("电信");
  const [onlyAbnormal, setOnlyAbnormal] = useState(false);
  const [sort, setSort] = useState<RouteSort>("province");
  const [showSamples, setShowSamples] = useState(false);
  const mobile = useMediaQuery("(max-width: 640px)");
  const scope = mobile ? carrier : undefined;
  const provinces = visibleProvinces(report.routes, family, scope, onlyAbnormal, sort);
  const summary = routeSummary(report.routes, family, scope);
  if (!report.routes.some((route) => route.family === family)) return <EmptyArchive>本次没有 IPv{family} 线路检测结果。</EmptyArchive>;
  return <>
    <div className="nq-route-heading"><p className="nq-packet-label">{packetLabel(report, family)}</p><span className="nq-muted">{mobile ? carrier : "全国三网"}{sort !== "province" ? " · 按最差目标排序" : " · 31 省"}</span></div>
    <div className="nq-mobile-carriers" role="group" aria-label="选择运营商">
      {CARRIERS.map((name) => <button key={name} type="button" aria-pressed={carrier === name} onClick={() => setCarrier(name)}>{name}</button>)}
    </div>
    <dl className="nq-summary" aria-label="线路统计">
      <div><dt>已采样目标</dt><dd>{summary.measured}<small> / {summary.total}</small></dd></div>
      <div><dt>异常目标</dt><dd className={summary.critical ? "nq-critical" : undefined}>{summary.critical}</dd></div>
      <div><dt>缺测／未确定</dt><dd>{summary.unknown}</dd></div>
    </dl>
    <div className="nq-table-controls">
      <label className="nq-check"><input type="checkbox" checked={onlyAbnormal} onChange={(event) => setOnlyAbnormal(event.target.checked)} />只看异常</label>
      <label className="nq-sort">排序<select aria-label="排序" value={sort} onChange={(event) => setSort(event.target.value as RouteSort)}><option value="province">省份顺序</option><option value="loss">丢包率从高到低</option><option value="latency">延迟从高到低</option></select></label>
      <label className="nq-check"><input type="checkbox" checked={showSamples} onChange={(event) => setShowSamples(event.target.checked)} />采样详情</label>
    </div>
    <p className="nq-legend"><span>● 正常：零丢包且 ≤150 ms</span><span>● 一般：≤20% 且 ≤240 ms</span><span>● 异常：超出上述范围／失败</span></p>
    <div className="nq-table-wrap" tabIndex={0} role="region" aria-label="三网三十一省线路、延迟与丢包率">
      <table className="nq-route-table">
        <caption className="sr-only">IPv{family} 三网三十一省检测结果。未检测和缺失数据以横线显示。</caption>
        <thead><tr><th scope="col">省份</th>{CARRIERS.map((name) => <th scope="col" key={name} className={carrier !== name ? "nq-carrier-hidden" : undefined}>{name}<small>线路 · 延迟 · 丢包</small></th>)}</tr></thead>
        <tbody>{provinces.map((province) => <tr key={province}>
          <th scope="row">{province}</th>
          {CARRIERS.map((name) => {
            const route = routeFor(report.routes, province, name, family);
            const health = routeHealth(route);
            const change = report.routeComparison?.changes.find((item) => provinceName(item.province) === province && item.carrier === name && item.family === family && item.packetType === route?.packetType);
            return <td key={name} className={[carrier !== name ? "nq-carrier-hidden" : "", change ? "nq-route-changed" : ""].join(" ")}>
              <span className="nq-route-line">{route?.line || (route ? ROUTE_LABELS[route.status] : "未检测")}</span>
              {change && <div className="nq-route-change"><strong>线路变化</strong><span>原线路：{change.before}</span><small>对比 {reportTime(change.previousCompletedAt)}</small></div>}
              <span className={`nq-route-metrics is-${health}`}><span><span className="sr-only">延迟 </span>{formatLatency(route?.latency)}</span><span><span className="sr-only">丢包 </span>{formatLoss(route?.loss)}</span></span>
              {route && route.status !== "ok" && <small className={`nq-route-state is-${health}`}>{ROUTE_LABELS[route.status]}</small>}
              {showSamples && <small className="nq-muted nq-samples">{route?.sent != null && route.received != null ? `有效收包 ${route.received} / 发包 ${route.sent}` : "采样数未知"}{route?.packetType ? ` · ${route.packetType === "large" ? "大包" : "标准包"}` : ""}</small>}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
      {provinces.length === 0 && <EmptyArchive>当前范围没有异常目标。一般、缺测与不支持的目标不计入异常。</EmptyArchive>}
    </div>
    <p className="nq-footnote">异常筛选包含失败、无响应、丢包率 &gt;20% 或延迟 &gt;240 ms；缺测不等于正常。无响应可能由目标限速或屏蔽探测造成，结果仅反映检测当时的状态。</p>
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
  const age = report ? reportAge(report.completedAt) : null;
  return <InstancePanel className="network-quality-panel" title="网络检测档案" kicker={<><Sprout size={14} /> 庄园观测站</>}
    description="把每一次线路与解锁检测，收进庄园的观测手册。"
    aside={<button type="button" className="nq-refresh" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="刷新检测历史"><RefreshCw size={14} aria-hidden="true" />{query.isFetching ? "读取中" : "刷新档案"}</button>}>
    {query.isLoading && <EmptyArchive loading>正在翻阅检测档案…</EmptyArchive>}
    {query.isError && <NetworkQualityErrorState error={query.error} />}
    {query.data?.enabled === false && <EmptyArchive><strong className="nq-empty-title">网络检测暂未开放</strong><span>请管理员启用“网络检测与历史报告”插件，并开启公开展示。</span></EmptyArchive>}
    {data && <>
      <div className="nq-toolbar">
        <label className="nq-history"><span><Archive size={14} aria-hidden="true" />检测记录</span><select aria-label="检测记录" value={reportId} onChange={(event) => setReportId(event.target.value)}>
          <option value="">最近一次</option>
          {data.reports.map((item) => <option key={item.id} value={item.id}>{reportTime(item.completedAt)} · {REPORT_LABELS[item.status]}</option>)}
        </select></label>
        {report && <span className={`nq-status is-${report.status}`}>{REPORT_LABELS[report.status]}</span>}
      </div>
      {!report && <EmptyArchive><strong className="nq-empty-title">暂无检测记录</strong><span>网络检测插件已连接；管理员完成首次检测后，这里会显示结果。</span></EmptyArchive>}
      {report && <>
        <div className="nq-report-meta"><span>检测完成于 <time dateTime={report.completedAt}>{reportTime(report.completedAt)}</time></span><span>{reportId ? "历史报告 · " : ""}{age?.label}</span></div>
        {age?.stale && <p className="nq-notice">这份报告已超过 24 小时，仅供历史参考，不代表当前网络状态。</p>}
        <RouteChangeNotice report={report} />
        <div className="nq-tabs">
          <div role="group" aria-label="检测项目"><button type="button" aria-pressed={tab === "routes"} onClick={() => setTab("routes")}>三网线路</button><button type="button" aria-pressed={tab === "unlocks"} onClick={() => setTab("unlocks")}>解锁检测</button></div>
          <div role="group" aria-label="IP 协议"><button type="button" disabled={report.ipv === "6"} aria-pressed={effectiveFamily === 4} onClick={() => setFamily(4)}>IPv4</button><button type="button" disabled={report.ipv === "4"} aria-pressed={effectiveFamily === 6} onClick={() => setFamily(6)}>IPv6</button></div>
        </div>
        {tab === "routes" ? <RouteTable report={report} family={effectiveFamily} /> : <div className="nq-unlock-grid">
          {report.unlocks.filter((item) => item.family === effectiveFamily).map((item, index) => <article className={`nq-unlock-card is-${item.status}`} key={`${item.service}-${index}`}>
            <div><strong>{item.service}</strong><span className={`nq-unlock-status is-${item.status}`}>{UNLOCK_LABELS[item.status]}</span></div>
            <p className="nq-unlock-region">{item.region ? `地区：${item.region}` : "地区未确定"}</p>{item.detail && <p className="nq-muted">{item.detail}</p>}
            <time dateTime={report.completedAt}>IPv{item.family} · {reportTime(report.completedAt)}</time>
          </article>)}
          {!report.unlocks.some((item) => item.family === effectiveFamily) && <EmptyArchive>本次没有 IPv{effectiveFamily} 解锁检测结果。</EmptyArchive>}
        </div>}
        {report.errors.length > 0 && <details className="nq-errors"><summary>部分检测未完成（{report.errors.length}）</summary><ul>{report.errors.map((error, index) => <li key={index}>{error}</li>)}</ul></details>}
      </>}
      <p className="nq-footnote">此页只读取历史结果；打开或刷新页面不会在服务器执行检测。时间按浏览器所在时区显示。</p>
    </>}
  </InstancePanel>;
}
