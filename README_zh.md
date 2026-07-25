# SourcePort

[English](README.md) | 简体中文

为 AI Agent 提供稳定、可诊断、保留证据的指定网站信息获取能力。

SourcePort 将公共 HTTP、OpenCLI 适配器、已登录浏览器会话和人工恢复等
站点特定访问路径，统一封装为显式且带版本的 source operation，并输出结构化
结果、来源证据、健康诊断和恢复指引。

## SourcePort 是什么

SourcePort 是信息获取基础设施，负责：

- 发现来源能力并提供带版本的 operation schema；
- 校验统一的请求和结果信封；
- 按优先级路由后端，执行 fallback、超时、重试和 circuit breaker；
- 诊断登录、验证码、限流、网络、空结果和站点结构漂移；
- 返回结构化数据以及来源 URL/ID、获取时间、后端和 evidence；
- 提供显式 freshness 策略和保留证据的文件缓存；
- 提供 fixture、契约测试、受限实时探测和恢复动作。

SourcePort core 不负责领域决策。跨来源筛选、排序、推荐和决策属于消费者包或
Skill。第一个验证消费者是基于懂车帝和汽车之家的有界买车研究。

## 架构

~~~text
自然语言需求
      |
      v
research-cars Codex Skill
      |
      v
CarResearchBrief
      |
      v
@sourceport/car-research
      |
      v
@sourceport/core
  | 能力注册和带版本合同
  | 路由、fallback、circuit breaker
  | freshness 缓存和 doctor
  |
  +--> @sourceport/dongchedi
  |      +--> 公共 HTTP
  |      +--> 已登录 OpenCLI Browser Bridge
  |      +--> 人工恢复指引
  |
  +--> @sourceport/autohome
         +--> 公共 HTTP
         +--> 人工恢复指引
      |
      v
CarResearchReport：JSON 或 Markdown
~~~

仓库当前包含：

| 包或目录 | 职责 |
|---|---|
| <code>@sourceport/core</code> | 合同、证据、注册表、路由、缓存、失败分类和 doctor |
| <code>@sourceport/cli</code> | 来源发现、operation 执行、doctor 和买车研究 CLI |
| <code>@sourceport/car-research</code> | 有界跨来源买车研究和确定性报告 |
| <code>@sourceport/dongchedi</code> | 懂车帝搜索、车系、评价、款型和配置获取 |
| <code>@sourceport/autohome</code> | 汽车之家品牌目录、评分、可靠性和竞品获取 |
| <code>@sourceport/testing</code> | 测试 fixture 和辅助工具 |
| <code>skills/research-cars</code> | 将自然语言买车需求编排到 SourcePort 的薄层 Codex Skill |

## 当前 MVP 状态

买车研究功能 MVP 已经完成，相关实现已合入并推送到
<code>main</code>，仓库 Skill 已完成安装和前向验证。现在可以通过 CLI 或
Codex Skill 直接执行完整的有界买车研究。

本次文档收尾前在 2026-07-25 验证的功能基线：

- <code>main</code> 与 <code>origin/main</code> 的实现基线为
  <code>a2b1706</code>，当时不存在未提交的实现文件；
- 31 个测试文件、143 个测试全部通过；
- <code>npm run typecheck</code> 和 <code>npm run build</code> 通过；
- CLI 已链接到 <code>/opt/homebrew/bin/sourceport</code>；
- 已安装的 <code>research-cars</code> Skill 与仓库源码一致；
- OpenCLI 1.8.6 的 daemon 正常运行，Chrome Extension 已连接；
- 汽车之家为 <code>healthy, available=true</code>；
- 懂车帝为 <code>degraded, available=true</code>：部分公共入口要求登录，
  但已登录浏览器 fallback 保持五个 operation 全部可用。

这是一个特定时间点的验证结果，不是对外部网站永久可用性的保证。执行实时研究
前应先运行 <code>sourceport doctor</code>。

### 已支持的来源 operation

| 来源 | Operation | 用途 | 最近验证路径 |
|---|---|---|---|
| 汽车之家 | <code>list-brand-series</code> | 按品牌列出稳定车系 ID 和指导价 | 公共 HTTP，healthy |
| 汽车之家 | <code>get-series-score</code> | 获取车主评分、维度、可靠性和竞品 | 公共 HTTP，healthy |
| 懂车帝 | <code>search-series</code> | 按关键词搜索车系 | 已登录浏览器 fallback 可用 |
| 懂车帝 | <code>get-series</code> | 获取车系身份、价格、评分、排名和款型数量 | 已登录浏览器 fallback 可用 |
| 懂车帝 | <code>get-owner-reviews</code> | 获取受限数量的车主评价和证据 URL | 已登录浏览器 fallback 可用 |
| 懂车帝 | <code>list-trims</code> | 列出精确的在售或停售款型 | 已登录浏览器，healthy |
| 懂车帝 | <code>get-trim-configuration</code> | 获取完整精确款型配置和辅助驾驶证据 | 已登录浏览器，healthy |

精确款型辅助驾驶输出会分别保留：

- 宣称的自动化等级；
- 具体辅助驾驶能力；
- 城区、高速、泊车等运行域；
- 摄像头、毫米波雷达、超声波雷达、激光雷达等感知硬件；
- 系统和版本；
- 标配、选装、选装包；
- 订阅和 OTA 条件；
- 市场适用范围。

它不会使用通用的 <code>hasADAS</code> 布尔字段，也不会将通用 ADAS
概念等同于华为 ADS。

## 快速开始

### 环境要求

- Node.js 20 或更高版本；
- npm；
- 懂车帝浏览器后端需要 Chrome 和
  [OpenCLI Extension](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk)；
- 当懂车帝公共路径要求认证时，需要保持已登录的懂车帝浏览器会话。

当前各包是私有 workspace 包，尚未作为公共 npm 包发布。需要从本仓库构建并
链接 CLI：

~~~bash
npm install --ignore-scripts
npm run typecheck
npm test
npm run build
npm link --workspace @sourceport/cli
command -v sourceport
~~~

使用懂车帝前，保持对应 Chrome Profile 开启并检查 Browser Bridge：

~~~bash
node_modules/.bin/opencli doctor
sourceport doctor dongchedi
~~~

SourcePort 不会把 Cookie 复制进仓库，也不会绕过登录、验证码、访问验证或限流。
如果浏览器会话失效，应完成返回结果中的人工登录或验证动作，然后重新运行 doctor
或 operation。

## 发现和诊断能力

查看已注册来源：

~~~bash
sourceport sources
~~~

查看权威输入、输出 schema：

~~~bash
sourceport capabilities autohome
sourceport capabilities dongchedi
~~~

执行受限、只读的实时健康探测：

~~~bash
sourceport doctor
sourceport doctor autohome
sourceport doctor dongchedi
sourceport doctor dongchedi --json --timeout-ms 15000
~~~

默认输出适合人类阅读的文本；<code>--json</code> 输出稳定的
<code>DoctorReport</code>。

Doctor 状态：

| 状态 | 含义 |
|---|---|
| <code>healthy</code> | 第一优先级自动后端可用 |
| <code>degraded</code> | fallback 或 partial 路径仍然可用，或出现暂时性异常 |
| <code>blocked</code> | 登录、验证码或访问限制导致不存在可用自动路径 |
| <code>drifted</code> | 站点返回结构不再满足当前合同 |
| <code>unconfigured</code> | 必需的本地依赖、daemon 或浏览器扩展不可用 |

Doctor 退出码：

| 退出码 | 含义 |
|---:|---|
| 0 | 所选来源全部 healthy |
| 1 | 至少一个来源 degraded、drifted、unconfigured 或发生内部失败 |
| 2 | CLI 参数错误或未知来源 |
| 3 | 某个来源或 operation 被阻断，且不存在可用自动路径 |

如果首选后端被登录墙阻断，但 fallback 正常，聚合状态是
<code>degraded, available=true</code>，而不是来源不可用。

## 执行单个来源 operation

汽车之家：

~~~bash
sourceport run autohome list-brand-series \
  --input '{"brand":"宝马","limit":5}'

sourceport run autohome get-series-score \
  --input '{"seriesId":"6548"}'
~~~

懂车帝：

~~~bash
sourceport run dongchedi search-series \
  --input '{"keyword":"宝马X5","limit":5}'

sourceport run dongchedi get-series \
  --input '{"seriesId":"5273"}'

sourceport run dongchedi get-owner-reviews \
  --input '{"seriesId":"5273","limit":5}'

sourceport run dongchedi list-trims \
  --input '{"seriesId":"5273","status":"online"}'

sourceport run dongchedi get-trim-configuration \
  --input '{"trimId":"255925"}'
~~~

每个结果都会保留：

- source 和 operation；
- operation schema version；
- 实际 backend；
- status；
- retrievedAt；
- 结构化 data；
- evidence；
- warnings；
- failure；
- attempts；
- recoveryActions。

## Freshness 和缓存语义

默认执行实时请求。成功或 partial 的实时结果可以写入缓存，但如果调用方没有明确
允许，SourcePort 永远不会读取缓存。

只使用实时请求：

~~~bash
sourceport run autohome get-series-score \
  --input '{"seriesId":"6548"}'
~~~

先实时获取，仅在实时请求 blocked 或 failed 时回退到年龄合格的缓存：

~~~bash
sourceport run autohome get-series-score \
  --input '{"seriesId":"6548"}' \
  --freshness prefer-live \
  --max-age-ms 86400000
~~~

先读取年龄合格的缓存；缓存不存在、过期、损坏或合同失效时才执行实时请求：

~~~bash
sourceport run autohome get-series-score \
  --input '{"seriesId":"6548"}' \
  --freshness allow-stale \
  --max-age-ms 86400000
~~~

缓存结果始终标记为 <code>stale</code>，使用
<code>backend=cache</code>，保留原始获取时间和 evidence，也不会隐藏失败的
实时尝试。可以使用 <code>SOURCEPORT_CACHE_DIR</code> 修改平台用户缓存目录。

## 有界买车研究

### 最简单的方式：Codex Skill

安装或启用仓库中的 <code>research-cars</code> Skill 后，可以明确要求 Codex：

~~~text
使用 $research-cars。

我在武汉买第一辆车，落地价不能超过15万元，没有私人充电桩。
辅助驾驶比较重要，重点看ACC、车道居中、自动泊车和高速领航。
SUV优先，但轿车也可以。请给出不超过5个候选，并列出所有仍需核实的问题。
~~~

Skill 会：

1. 检查 CLI 和两个来源的 doctor；
2. 把自然语言转换为有界的 <code>CarResearchBrief</code>；
3. 区分 hard、preference 和 context；
4. 生成有限数量的待验证车型种子；
5. 选择一个主要 Markdown 或 JSON 输出并执行一次研究；
6. 按确定性报告解释结果；
7. 保留所有 unknown、conflict 和 unsupported；
8. 遇到登录或验证码时暂停并提供恢复动作。

### CLI 使用

创建 <code>brief.json</code>：

~~~json
{
  "query": "武汉购车，落地价不超过15万元，没有私人充电桩，辅助驾驶优先，SUV优先但轿车也可以",
  "market": {
    "country": "CN",
    "city": "武汉",
    "currency": "CNY"
  },
  "criteria": [
    {
      "key": "budget.onRoad.maxCny",
      "label": "武汉落地价不超过15万元",
      "kind": "hard",
      "priority": 100,
      "requirement": { "maxCny": 150000 }
    },
    {
      "key": "drivingAssistance.capabilities",
      "label": "辅助驾驶能力优先",
      "kind": "preference",
      "priority": 90,
      "requirement": ["自适应巡航", "车道居中", "自动泊车", "高速领航辅助"]
    },
    {
      "key": "bodyStyle.preferred",
      "label": "SUV优先",
      "kind": "preference",
      "priority": 80,
      "requirement": ["SUV"]
    },
    {
      "key": "ownership.privateCharger",
      "label": "没有私人充电桩",
      "kind": "context",
      "priority": 70,
      "requirement": false
    }
  ],
  "seeds": [
    { "kind": "series", "name": "星越L", "brand": "吉利汽车" },
    { "kind": "series", "name": "博越L", "brand": "吉利汽车" },
    { "kind": "series", "name": "星瑞", "brand": "吉利汽车" },
    { "kind": "series", "name": "风云T9", "brand": "奇瑞汽车" },
    { "kind": "series", "name": "长安启源Q05", "brand": "长安启源" }
  ],
  "limits": {
    "initialSeeds": 5,
    "expandedSeries": 8,
    "scannedSeries": 5,
    "exactConfigurations": 3,
    "finalCandidates": 5,
    "ownerReviewsPerSeries": 3
  }
}
~~~

选择一种主要输出格式执行：

~~~bash
sourceport research-cars --input-file brief.json --format md
sourceport research-cars --input-file brief.json --format json
~~~

也支持内联 JSON：

~~~bash
sourceport research-cars --input '<json>' --format md
~~~

<code>--input</code> 和 <code>--input-file</code> 必须且只能提供一个。
默认执行实时研究。Brief 可以明确指定：

~~~json
{
  "freshness": {
    "mode": "prefer-live",
    "maxAgeMs": 86400000
  }
}
~~~

### 条件和决策语义

Criterion 使用开放合同：

~~~text
key
label
kind: hard | preference | context
priority
requirement
~~~

当前 evaluator registry 已理解：

| Criterion key | 含义 |
|---|---|
| <code>budget.onRoad.maxCny</code> | 有证据支持的最大落地价 |
| <code>bodyStyle.preferred</code> | 车身形式偏好 |
| <code>drivingAssistance.capabilities</code> | 精确款型需要或偏好的辅助驾驶能力 |
| <code>drivingAssistance.claimedLevel.min</code> | 最低宣称辅助驾驶等级 |
| <code>ownership.privateCharger</code> | 私人充电桩使用环境 |

未知 key 会完整保留在 <code>unsupportedCriteria</code> 中，不会被静默忽略。

每项 criterion 返回：

~~~text
pass | fail | unknown | conflict | unsupported
~~~

候选资格：

| 资格 | 含义 |
|---|---|
| <code>eligible</code> | 所有硬条件都有证据确认通过 |
| <code>needs-verification</code> | 至少一个硬条件为 unknown、conflict 或 unsupported |
| <code>rejected</code> | 至少一个硬条件存在证据确认的失败 |

只有有证据支持的 hard fail 才会淘汰候选。缺失字段不会被解释为“不支持”，没有
私人充电桩也不会自动排除纯电、插混或增程车型。

### 有界覆盖

硬性上限：

| 限制 | 最大值 |
|---|---:|
| 初始种子 | 8 |
| 扩展后车系 | 12 |
| 扫描在售款型的车系 | 8 |
| 精确款型配置 | 6 |
| 最终候选 | 5 |
| 每车系车主评价 | 5 |

车型种子在经过 SourcePort 验证前只是待验证假设。同来源优先使用稳定 ID，跨来源
仅使用品牌和规范化车系名称的精确匹配。歧义实体会保留为
<code>unmatched</code> 或 <code>conflict</code>，不会通过不透明的模糊匹配
强行合并。

### 落地价

站点参考价不会被当成本地真实成交价。要得到已知落地价，需要提供有日期、有适用
条件的以下证据：

- 车辆成交价；
- 购置税；
- 保险；
- 上牌；
- 其他必要成本。

缺少其中任一必要项目时，预算结果保持 <code>unknown</code>，候选保持
<code>needs-verification</code>。这是预期行为，不是获取失败。

### 研究输出和退出码

<code>CarResearchReport</code> 包含：

- 有界覆盖和执行上限；
- 保留候选和被拒绝候选；
- 精确款型；
- 条件矩阵和辅助驾驶矩阵；
- 落地价状态和缺失成本项；
- 跨来源匹配状态；
- unsupported criteria；
- evidence、warnings、recoveryActions 和覆盖边界。

研究 CLI 退出码：

| 退出码 | 含义 |
|---:|---|
| 0 | 报告状态为 <code>success</code> |
| 1 | 报告状态为 <code>partial</code> 或 <code>failed</code> |
| 2 | CLI 参数或 <code>CarResearchBrief</code> 无效 |
| 3 | 必需的获取流程被登录或验证码阻断 |

## 已验证的武汉验收

2026-07-25 的武汉有界验收使用了以下决策边界：

> 落地价不高于15万元，没有私人充电桩，辅助驾驶优先，SUV优先但轿车也可以。

验收结果：

| 指标 | 结果 |
|---|---:|
| 请求种子验证 | 5/5 |
| 扩展车系 | 8 |
| 扫描车系 | 5 |
| 获取精确配置 | 3 |
| 最终候选 | 5 |
| 汽车之家精确匹配 | 4 |

所有武汉落地预算都正确保持为 <code>unknown</code>，因为没有提供适用的成交价、
购置税、保险和上牌证据。该结果证明了有界且可审计的研究流程，而不是武汉经销商
报价或全市场搜索。

## 产品边界

SourcePort 当前可以直接用于：

- 从明确的种子假设开始进行有界车系发现；
- 获取精确款型和配置；
- 比较辅助驾驶能力；
- 获取车主评价；
- 使用汽车之家交叉验证；
- 执行确定性条件判断并生成候选表；
- 输出保留 unknown 和恢复动作的证据报告。

它不是：

- 全市场车型数据库或穷举目录；
- 武汉实时经销商报价、库存或交付周期系统；
- 对某辆车必然可以在指定预算内落地的保证；
- 自动替用户做最终交易决策的引擎；
- 易车、58同城、小红书、贝壳、自如等尚未注册来源的适配器。

对于买车研究，下一项价值最高的能力是交易层证据：本地经销商成交价、税费规则、
保险、上牌、必要费用、库存和交付条件。

## 开发和验证

~~~bash
npm run typecheck
npm test
npm run build
~~~

实时检查：

~~~bash
sourceport doctor autohome --json
sourceport doctor dongchedi --json
~~~

不要提交缓存、Cookie、Token、浏览器 Profile、验证码产物或私有原始页面。

## 文档

- [Agent 公约](AGENTS.md)
- [稳定站点获取设计](docs/superpowers/specs/2026-07-18-sourceport-stable-site-acquisition-design.md)
- [MVP 实施计划](docs/superpowers/plans/2026-07-18-sourceport-mvp-implementation.md)
- [买车研究实施与验收](docs/superpowers/plans/2026-07-25-car-research-consumer-implementation.md)
- [research-cars Skill](skills/research-cars/SKILL.md)
- [English README](README.md)
