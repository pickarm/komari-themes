# pickarm 的 Komari 主题合集

主题仓库由 `pickarm/junimo` 更名为 `pickarm/komari-themes`，保留原 Fork、历史提交与发布包。根目录 `v1.json` 为多主题市场目录，后续新主题可持续加入同一个源。

在 Komari 后台 → 主题市场 → 管理源中添加：

- 名称：`pickarm 自用主题`
- 地址：`https://raw.githubusercontent.com/pickarm/komari-themes/main/v1.json`

| 主题 | 最新版本 | 源码位置 |
| --- | --- | --- |
| Junimo 庄园 | 2.2.0 | 当前仓库根目录，保留与上游同步能力 |

新增主题可在 `themes/<short>/` 中独立维护源码和构建流程，将安装包地址、SHA-256 与预览图加入 `v1.json` 的 `themes` 数组。现有 Junimo 安装包保持原样，目录使用已下载核验的 GitHub 发布包校验值；源码中的仓库 URL 已更新为新名称。

## Junimo 庄园 · pickarm

基于 [Planck / Junimo v2.0.2](https://github.com/vaspike/junimo) 二次开发，Apache 2.0 许可和上游署名保留。新增网络检测档案、30 天 Ping 范围、访客本地四季自动切换和动效控制。此界面使用原创 CSS / SVG 与开放字体，没有打包游戏原版美术素材。

## 安装与回退

1. 在 Komari 1.6.1 或更新版本的主题管理中安装 release 的 `pickarm-junimo-v2.2.0.zip`。新主题 short 为 `pickarm-junimo`，与原 Junimo 并排安装。
2. 切换前备份原主题 ZIP 和完整 `theme_settings`。新 short 的配置独立存储，需要把原配置完整复制到新主题后保存，保留 Ping 任务绑定、隐藏节点、背景和布局等旧设置。不要只复制新增字段或覆盖站点其它配置。
3. 在前台主题管理中选择季节（默认按每位访客浏览器本地日期）、动效（默认开启，系统减弱动态效果优先）和网络检测展示（默认开启）。已有用户主动选择的浅色/深色等外观仍然保留。
4. 需要回退时，在 Komari 后台切回原 Junimo 即可。不要删除旧主题或其配置，直到确认新版本符合预期。

## 网络检测插件

检测由独立的 `network-quality` 插件负责；主题只读取已保存结果。需从 [pickarm/komari-plugins](https://github.com/pickarm/komari-plugins) 安装插件并在后台配置检测节点、定时任务与公开范围。访问或刷新前台不会执行远程命令。

- 面板位于节点详情的负载 / Ping 图表下方，支持 IPv4 / IPv6、三网三十一省线路与延迟丢包、解锁项目及历史选择。
- 手机端通过运营商按钮查看对应表格；桌面端可同时比较三网。支持只看异常、按最高丢包或最高延迟排序、展开采样详情。绿色表示零丢包且 ≤150 ms；一般为 ≤20% 且 ≤240 ms；超限、失败与无响应列为异常，缺测或不支持不计为健康。
- `—` 是缺测，0 毫秒或 0% 是真实数值；无响应与未检测分别显示。前台不会补造线路、延迟、丢包或解锁状态。
- 检测失败保留插件提供的历史记录，展示检测时间、部分完成及错误说明。检测数据反映当时结果，探测目标屏蔽/限速可能导致无响应。
- 主题访问同源只读接口 `GET /api/plugins/network-quality/v1/public?uuid=<节点UUID>&report_id=<可选历史ID>`，支持 `version: 1`；隐藏节点或未安装时的 404 统一显示暂无公开结果，关闭时显示已关闭。
- 没有安装插件时，其它节点功能正常使用；可在主题管理中关闭面板。
- 搭配 network-quality >=1.1.0，新报告会突出提示线路名称变化，在省份单元格标出原线路；上方明细可查看原线路 → 新线路及对比时间。插件按同节点、运营商、地址族、包型对比上一次有效成功采样，忽略失败/缺测及引擎变更，不将其误判为变线。旧报告没有对比数据时会明确说明。

## 四季与场景

默认 `farmSeason: "auto"`，使用观看页面的访客浏览器本地日期：3–5 月春、6–8 月夏、9–11 月秋、12–2 月冬，与 Komari 服务器时区无关。午夜、昼夕边界及页面重新获得焦点时重新计算，长时间打开页面也会切换。可手选固定季节；选择“自动”即可恢复。昼夕同样使用浏览器本地时间，6:00–18:00 为白昼，其余为夕照。

新增的远山、树木、花草与栅栏为原创轻量 SVG，不使用游戏素材、音乐或大型场景引擎。自定义背景优先，浅色/深色保持独立；动效开关和系统“减少动态效果”均可关闭叶片动画。

## Ping 历史

最多提供 30 天快捷范围，并根据后端保留时间过滤。长周期按后端指标桶粒度汇总，面板会提示精度；增加范围不会恢复已被删除或从未采集的记录。

## 开发与打包

使用 Node.js 22：`npm ci`，依次运行 `npm run lint`、`npm test`、`npm run typecheck`、`npm run package`。安装包包含 `komari-theme.json`、`preview.png`、`dist/`、Apache `LICENSE` 与 `NOTICE`。字体 OFL 许可随 `dist/fonts/` 分发。

---

以下保留原项目介绍：

# Junimo
Junimo是一款灵感来自`星露谷物语`的komari主题, 名称取自星露谷里那些住在农场上、默默帮你收菜(采集服务器数据)的小精灵。

> Junimo是站在前人的肩膀上进行的实现, 感谢: [Komari-Theme-LuminaPlus](https://github.com/shanyang242/Komari-Theme-LuminaPlus)
>
> 因此Junimo继承了上游主题的大部分能力

## 预览

<img width="1768" height="1113" alt="image" src="https://github.com/user-attachments/assets/4975ffe4-b3e7-4b19-91de-ecba5bd5656b" />

<img width="1771" height="1109" alt="image" src="https://github.com/user-attachments/assets/941af415-79c5-4d78-b320-3418a9b5855f" />

<img width="1572" height="1111" alt="image" src="https://github.com/user-attachments/assets/c926c0f3-a7f7-4dce-bde9-22d318888b81" />


## 未完成

点击主页的右上角小箭头可以找到主题配置的入口
其余的设置选项可自己挖掘(绝对不是因为暂时来不及写了)






