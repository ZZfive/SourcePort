# Automotive Decision Capability Roadmap

Date: 2026-09-06

## Goal

将当前“有界车型资料研究”推进为能够持续关注市场变化、核对真实用户反馈、比较具体款型，并给出可审计购车建议的汽车决策系统。

目标输出不是替用户自动下单，而是回答：

- 当前市场有哪些值得纳入的车型和具体款型；
- 为什么某个款型适合用户的预算、补能条件和用车场景；
- 价格、配置和辅助驾驶信息有多新；
- 用户投诉和质量风险是否集中在当前年款或配置；
- 厂家是否回应、整改或召回；
- 买前还需要通过试驾、询价或人工确认什么。

## Current baseline

已完成：

- SourcePort core、路由、fallback、证据、缓存、freshness 和 doctor；
- 懂车帝、汽车之家、市场监管总局、Brave、36氪、小红书适配器；
- `car-research` 有界车型发现、跨来源匹配、条件判断和报告；
- `decision-context` 证据语料、assessment 校验和提示旗标；
- 171 个确定性测试、typecheck、build。

当前限制：

- 每个车系基本只检查一个最低价在售款型；
- 预算缺少示例城市成交价、税费、保险和上牌证据时只能是 unknown；
- “没有私人充电桩”尚未转化为补能和使用成本判断；
- 没有主动发现新车、改款和配置变化的时间线；
- 没有车质网等结构化投诉来源；
- 市场反馈还没有形成车型、年款、款型级别的聚类和复发判断；
- 最终输出仍是候选和待核实项，不是稳定的购车行动建议。

## Phase 0: Define the decision contract

### Deliverables

- 明确用户输入模型：城市、预算口径、购车时间、通勤、长途、家庭成员、补能条件、动力偏好、辅助驾驶需求和风险偏好；
- 将条件区分为 hard、preference、context；
- 明确价格口径：指导价、经销商参考价、成交价、估算落地价；
- 明确报告截止时间、数据有效期和覆盖边界；
- 为后续快照、反馈和建议定义稳定 ID。

### Acceptance

- 同一请求可以生成可复现的结构化 brief；
- 缺失信息不会被默认成乐观假设；
- 报告能明确指出哪些结论会因用户补充信息而改变。

## Phase 1: Select the right exact trim

### Problem

当前流程对每个车系选择最便宜款型，可能错过仍在预算内、但辅助驾驶或关键安全配置更合适的中配款型。

### Deliverables

- 同一车系获取多个在售款型；
- 为每个款型提取价格、动力、尺寸、安全和辅助驾驶字段；
- 按硬条件先过滤，再按偏好和证据完整度排序；
- 识别必要选装、软件订阅和地区限制；
- 输出“推荐款型”和“未选款型原因”。

### Acceptance

- 低配不满足辅助驾驶、中配满足且仍在预算内时，系统选择中配；
- 未取得精确配置时输出 needs-verification；
- 不把缺失配置当作不支持。

## Phase 2: Market freshness and vehicle timeline

### Proposed module

```text
packages/market-intelligence/
  contracts.ts
  snapshots.ts
  change-detection.ts
  timeline.ts
  freshness.ts
```

### Deliverables

- `VehicleSnapshot`：车型、年款、款型、价格、配置、辅助驾驶、来源和抓取时间；
- `MarketEvent`：上市、改款、新增款型、价格变化、配置变化、ADAS 更新、停产；
- 保存上一次快照并做字段级 diff；
- 标记 fresh、aging、stale、unverified；
- 研究报告显示 data-as-of、最近变化和可能遗漏的新车；
- 先实现手动两次快照比较，再增加按周/月增量扫描。

### Acceptance

- 能识别新增车型、下架车型、价格变化和辅助驾驶配置变化；
- 过期价格不能被展示为当前成交价；
- 数据源失败或结构漂移时保留 warning 和 recovery action。

## Phase 3: Add 车质网 and structure market feedback

### Source

车质网（12365auto）提供投诉列表、投诉详情、投诉排行、投诉销量比和厂家回复率等结构化线索。首批只做只读获取，不绕过验证码、登录或频率限制。

### Proposed package

```text
sources/12365auto/
  src/adapter.ts
  src/search-complaints.ts
  src/get-complaint.ts
  src/get-ranking.ts
  src/get-complaint-sales-ratio.ts
  src/manifest.ts
```

### Deliverables

- 统一投诉记录：投诉编号、品牌、车系、车型、年款、问题简述、问题分类、时间、状态、厂家回复和证据 URL；
- 支持按车型、时间、能源、价格和质量/服务问题筛选；
- 保存页面抓取时间和投诉发生时间；
- 在公共 HTTP 不可用时使用 OpenCLI/browser fallback；
- 增加 fixture、schema、contract test 和 doctor probe。

### Acceptance

- 可以查询某候选车系近 30 天、近 1 年投诉；
- 可以定位到具体年款或车型；
- 投诉来源不可用时不会静默返回空结果。

## Phase 4: Feedback clustering and risk interpretation

### Proposed module

```text
packages/market-feedback/
  contracts.ts
  normalize.ts
  classify.ts
  cluster.ts
  recurrence.ts
  resolution.ts
```

### Deliverables

- `FeedbackRecord`：原始投诉、评价、媒体线索和证据；
- `FeedbackCluster`：问题主题、涉及年款/款型、时间趋势和来源数量；
- `ResolutionRecord`：厂家回复、维修、OTA、召回、整改和复发；
- 区分单条反馈、重复反馈、多来源交叉和官方确认；
- 引入 `insufficient-evidence`、`watch`、`verify-before-buy`、`pause`、`resolved`；
- 投诉数量优先结合投诉销量比，禁止直接当作故障率。

### Acceptance

- 同一问题的不同表述可以归并；
- 车系投诉不会自动推断到所有年款和款型；
- 厂家“已回复”不会自动等于“问题已解决”；
- 每个风险旗标都能追溯到文档和 evidence ID。

## Phase 5: Integrate into decision-context and report

### Deliverables

- 只对最终非 rejected 候选收集市场反馈；
- 增加“最近市场变化”和“用户反馈”报告章节；
- 把投诉、召回、整改和时效性作为建议解释依据；
- 保留 eligibility 和原始证据排序，单独生成建议层；
- 输出买前行动清单：试驾、配置确认、成交价询问、售后和投诉核验。

### Acceptance

- 报告能解释留下、淘汰和暂缓每个候选的原因；
- 过期或来源不足会降低结论强度；
- 市场反馈可以触发 `verify-before-buy` 或 `pause`，但不会无证据自动淘汰。

## Phase 6: Continuous refresh and operationalization

### Deliverables

- 按周/月运行车型和投诉增量扫描；
- 保存快照和变更历史；
- 对重点候选提供变化提醒；
- 增加实时 doctor 和 live test 记录；
- 增加 CI 中的确定性回归测试和 schema compatibility 检查；
- 增加数据保留、去重、来源条款和失败恢复文档。

## Recommended execution order

1. Phase 0：冻结决策合同和报告口径；
2. Phase 1：修正精确款型选择，这是当前最直接的推荐质量问题；
3. Phase 2：建立快照和字段级变化检测；
4. Phase 3：接入车质网投诉列表和详情；
5. Phase 4：做反馈聚类、重复信号和整改状态；
6. Phase 5：接入 decision-context 和最终报告；
7. Phase 6：最后增加定时刷新和提醒。

每个阶段都先加入 contracts、fixture 和 deterministic tests，再接 live source。任何来源的登录、验证码、限流或结构漂移都必须通过 SourcePort 的 blocked/degraded/recovery 状态显式返回。

## Non-goals

- 不做全市场穷举数据库；
- 不把投诉数量直接转换为故障率；
- 不把单条用户评价当成车型定论；
- 不绕过登录、验证码、访问验证或限流；
- 不自动替用户完成交易或下最终订单。
