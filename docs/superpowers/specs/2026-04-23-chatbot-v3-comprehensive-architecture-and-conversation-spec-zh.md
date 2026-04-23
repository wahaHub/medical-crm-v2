# Chatbot V3 综合架构与对话规范

日期：2026-04-23
状态：综合总览
读者：任何需要理解 Medora `chatbot-v3`、但之前没有项目背景的人

## 1. 为什么要写这份文档

`chatbot-v3` 之前已经有多份分主题的设计文档，分别讨论了：

- supervisor-led control plane
- post-intake conversation contract
- post-intake triage refinement
- control-plane repair
- FAQ recognition and detour behavior

这些文档仍然有价值，但它们默认读者已经知道一些背景，而且每份文档只讲系统的一部分。

这份文档的目标不一样。

它要把 `chatbot-v3` 的整体设计一次讲清楚，包括：
- 这个系统整体想解决什么问题
- 一轮对话在运行时是怎么流转的
- 每个核心组件分别负责什么
- 哪些状态会被持久化，以及为什么
- 医疗旅游主流程是怎么走的
- FAQ、人工转接、流程说明、材料上传分别怎么嵌入到主流程里

如果一个新工程师、新 reviewer、产品同学，或者未来的 AI agent 只想先读一份文档建立完整心智，这份文档就应该是入口。

## 2. 用最直白的话说，这个产品要做什么

Medora 的患者进入 `chatbot-v3` 时，并不是一个完全陌生、什么都没填过的用户。

在开始聊天之前，前端已经先收过一份基础 intake 表单。
也就是说，聊天的起点不是“冷启动问诊”，而是“基于已知基础信息继续推进”。

这个 chatbot 的职责，是把患者一步步带过一个结构化的医疗旅游流程：

1. 先确认系统已经收到了基础 intake
2. 再追问 3 个补充医学问题，同时允许患者跳过
3. 生成医院推荐
4. 让患者选择医院，或者先跳过不选
5. 解释 Medora 的整体流程
6. 收集支持性医学材料
7. 进入在线咨询
8. 需要时转人工

整个系统应该给用户一种“被引导着往前走”的感觉，而不是一个随意闲聊、没有主线的聊天机器人。

## 3. 最重要的核心心智模型

理解 `chatbot-v3` 最简单的方式，就是把它看成：

- 有一条**主流程**
- 也允许一些**绕行 detour**
- 主流程的当前位置会被持久化保存
- detour 只回答当前问题，不改写主流程当前位置

所谓主流程，就是患者当前真正所在的工作流步骤。
所谓 detour，就是插进来的旁路问题，比如：
- FAQ 问题
- 流程解释类问题
- 人工转接请求

用户完全可以在主流程中途插一句问题，系统先接住这句 side question，回答完以后，再从原来保存的主流程位置继续往下走。

## 4. 主流程阶段有哪些

当前的 canonical primary journey 顺序是：

1. `COLLECT_MINIMAL_MEDICAL_FACTS`
2. `RECOMMENDATION`
3. `EXPLAIN_PROCESS`
4. `COLLECT_MEDICAL_INPUTS`
5. `ONLINE_CONSULT`
6. `HUMAN_HANDOFF`

这些阶段分别是什么意思：

### `COLLECT_MINIMAL_MEDICAL_FACTS`
这是 post-intake follow-up 阶段。
系统先承认“我们已经收到了你的基础 intake”，然后再追问 3 个短的医学补充问题。
用户可以回答，也可以显式跳过。

### `RECOMMENDATION`
这是医院推荐阶段。
系统要展示真实的推荐结果。
用户可以比较、回看、重新选择、正式选一个医院，或者先跳过不选。

### `EXPLAIN_PROCESS`
这是流程说明阶段。
系统要解释 Medora 医疗旅游流程，包括推荐、材料、咨询和后续操作步骤。
这个阶段是 system-rendered 的，不要求正常 agent dispatch。

### `COLLECT_MEDICAL_INPUTS`
这是 supporting-documents 阶段。
用户在这里上传诊断证明或其他支持性医学文件。
这个阶段可以反复进入，后面也仍然可以继续补传材料。

### `ONLINE_CONSULT`
这是在线咨询阶段。
当用户已经选了医院、看过流程说明，并且至少上传过 1 份 supporting document 后，就可以进入这一阶段。

### `HUMAN_HANDOFF`
这是人工转接阶段。
用户要求人工，或者系统决定转人工时，都会进入这里。

## 5. 一个真实的完整 happy path 例子

一个典型主线大概长这样：

```text
User: Hello
Assistant: 我们已经收到了你的基础 intake。我还需要 3 个简短的补充信息，如果你愿意也可以跳过。

User: Confirmed lung cancer. Diagnosed three months ago. PET-CT and pathology completed.
Assistant: 这次推荐会同时参考你已经提交的 intake 和你刚补充的医学信息。
Assistant: [医院推荐列表]

User: Select first hospital.
Assistant: 接下来是整体流程说明：先确认推荐，再上传支持性材料，然后进入在线咨询。

User: Okay, what is next?
Assistant: 请上传你的诊断证明或其他支持性医学文件。

User: uploads diagnosis-certificate.pdf
Assistant: [材料上传确认]

User: What is next now?
Assistant: [在线咨询阶段的响应]
```

这个例子体现的就是：
- post-intake follow-up
- recommendation
- process explanation
- supporting-document upload
- online consult

## 6. 第二个例子：skip branch

用户并不一定非要回答那 3 个补充问题。
跳过也是合法路径。

```text
User: Hello
Assistant: 我们已经收到了你的基础 intake。我这里还有 3 个简短补充问题，不过如果你愿意，也可以先跳过。

User: Skip for now.
Assistant: 这次推荐会基于你已经提交的 intake 信息来生成。
Assistant: [医院推荐列表]

User: Skip hospital selection.
Assistant: 下面我来解释一下 Medora 的整体流程和下一步。
```

也就是说，系统仍然应该能够：
- 正常生成推荐
- 正常进入流程说明
- 后续继续走到 supporting documents 和 online consult

同时，推荐文案也应该区分两个分支：
- 如果用户回答了 follow-up，文案要说推荐基于 intake + follow-up 细节
- 如果用户跳过了，文案要说推荐只基于已有 intake

## 7. 整体架构长什么样

从高层看，`chatbot-v3` 是一个 supervisor-led runtime，加上一个单一 authoritative control-plane writer。

最重要的几个部分是：

- `Supervisor`
- `JourneyRuntimeAuthority`
- runtime / orchestrator 层
- 各个 subagent
- session persistence
- response composer

翻译成人话：
- `Supervisor` 负责判断“看起来下一步应该做什么”
- `JourneyRuntimeAuthority` 负责判断“这件事到底允不允许，以及最终写成什么真相”
- runtime 负责把整轮 turn 串起来
- subagent 负责各自领域内的具体任务
- persistence 负责把主流程阶段跨 turn 保存下来
- response composer 负责把内部结果变成用户真正看到的文案和卡片

## 8. 一轮对话是怎么流转的

一轮 turn 大概会经历以下步骤：

1. API 收到用户消息、结构化 action、以及可选附件
2. runtime 读取当前 session snapshot
3. runtime 组装一个紧凑的 decision input
4. `Supervisor` 提议下一步该做什么
5. `JourneyRuntimeAuthority` 校验、允许、拒绝，或者修正这个提议
6. 如果这一轮真的需要 agent，就 dispatch 给对应 agent
7. runtime 持久化 authority 批准后的最终 journey state
8. response composer 生成用户看到的 assistant 文案、cards 和 payload

这个架构里有一个非常关键的点：

`Supervisor` 不是最终真相写入者。
真正的最终写入者是 `JourneyRuntimeAuthority`。

## 9. 各个组件分别负责什么

### `Supervisor`
`Supervisor` 是主 LLM control-plane 组件。
它的职责是：
- 理解最新一轮用户输入
- 判断这一轮更像 progression、FAQ、handoff 还是别的类型
- 提议下一步阶段
- 如果需要 agent，决定该由哪个 agent 处理

它最擅长的是回答这个问题：
- “用户现在这句话到底是什么意思？”

但它并不是最终的 progression authority。

### `JourneyRuntimeAuthority`
`JourneyRuntimeAuthority` 是最终 authority。
它的职责是：
- allow 或 deny `Supervisor` 的 proposal
- 保护 persisted primary-stage truth
- 执行 progression gate
- 写入最终 journey state

如果 `Supervisor` 提了一个虽然像那么回事、但实际上不合法或者不符合当前 saved journey 的 proposal，authority 层可以拒绝或者修正它。

这层的意义就是：
- 不让 prompt 漂移
- 不让 LLM 的偶发误判直接变成 persisted truth

### Runtime / Orchestrator 层
runtime 是接线层。
它负责：
- 读取 session state
- 给 `Supervisor` 传正确的输入
- 把 authority 批准后的 decision 交给对应 agent
- 维护 idempotency、summary、turn-level debug 数据
- 组装最终可见响应

### `RecordsAgent`
这个 agent 负责 records 和 medical-input 相关行为。
主要用于：
- post-intake follow-up 问题
- supporting-document 处理

### `RecommendationAgent`
这个 agent 负责推荐结果和推荐相关交互。
当用户需要真正的医院推荐，或者需要 recommendation-specific reasoning 时，会用到它。

### `FaqAgent`
这个 agent 负责 FAQ 和 resource detour。
它处理那些不是主流程推进、而是旁路知识问答的问题，比如：
- 营业时间
- 大概在中国待多久
- 高层流程问题
- 一些不该改写主流程的 practical question

如果它找不到可靠答案，系统必须老实说明。

### `ConsultAgent`
这是 deterministic agent，负责在线咨询阶段行为。

### `HandoffAgent`
这是 deterministic agent，负责人工转接。

## 10. 系统到底会持久化哪些关键状态

`chatbot-v3` 之所以后来稳定了很多，一个最重要的原因就是：
它不再每一轮都靠一堆粗糙布尔值重新推断当前阶段，而是直接持久化保存主流程阶段。

最重要的 persisted truths 包括：

### Journey snapshot
```ts
journeyCurrentStage
journeyCurrentPhase
```

这是用户当前主流程位置的保存值。
它是“用户现在到底在哪一步”的主真相。

### Minimal triage state
```ts
minimalTriageStatus: 'pending' | 'skipped'
minimalTriageAnswersSummary: string | null
```

这里有一个重要解释：
- `pending + answersSummary != null` 表示用户已经回答了 follow-up
- `skipped + null` 表示用户显式跳过了

在修正后的设计里，不再单独维护一个 canonical `answered` enum。

### Recommendation selection state
```ts
recommendationSelectionStatus: 'pending' | 'selected' | 'skipped' | null
recommendationSelectedHospitalIds: string[] | null
```

这里保存的是：
- 用户是否已经选了医院
- 是否跳过了选择
- 现在是否还处在待选择状态

### Supporting documents
```ts
supportingDocuments: Array<{ path: string; name: string }>
```

这个结构故意保持很小。
系统只需要知道：
- 当前 session 有哪些 supporting documents
- 文件名和文件路径是什么

v1 不做文档分类。

### 少量仍然合理的布尔 truth
还有少量布尔值依然是有意义的 native truth：
- `process.explained`
- `handoff.active`

这些保留下来是合理的，因为它们本来就是真正的 yes/no 状态，而不是把 richer state 压扁后的 alias。

## 11. 为什么 persisted stage 这么重要

这是 `chatbot-v3` 最重要的经验之一。

如果系统每一轮都试图从一些不完整的布尔值重新推断 stage，就很容易出这些问题：
- 上传文件把用户打回前面
- skip branch 死循环
- 选医院后跳得太快或太慢
- FAQ detour 把主流程覆盖掉

persisted journey snapshot 的作用，就是把这些问题压下去。

它意味着：
- 系统总能知道当前保存的 primary stage 是什么
- detour 发生时不会改写这个 primary stage
- 下一轮回来时仍然能从原来的位置继续

## 12. progression 和 detour 的区别

这是理解 `chatbot-v3` 的关键分界线。

### progression turn
progression turn 会推动用户沿主流程往下走。
比如：
- 提交 3 个补充问题答案
- 显式跳过 follow-up
- 选择医院
- 跳过医院选择
- 问 “what is next?”
- 上传 supporting documents

这类 turn 可能会改变 primary stage。

### detour turn
detour turn 只回答当前 side question，不推进主流程。
比如：
- “What are your hours?”
- “How long are people usually in China?”
- “Can someone just call me instead?”
- recommendation compare / process clarification 这类不该改写主 stage 的问题

这类 turn 应该保持 saved primary stage 不变。

也就是说：
- 如果用户当前在 `COLLECT_MINIMAL_MEDICAL_FACTS`，FAQ detour 后还在这里
- 如果当前在 `RECOMMENDATION`，FAQ detour 后还在这里
- 如果当前在 `EXPLAIN_PROCESS`，FAQ detour 后还在这里
- 后面的阶段同理

## 13. FAQ 的最终语义

现在最终 FAQ contract 是：

- 所有阶段都必须能接受 FAQ detour
- FAQ 不能改写 persisted primary stage
- FAQ 只有两类结果：
  - reliable answer
  - honest miss

### Reliable FAQ answer
如果系统找到了可靠 FAQ 答案，就正常回答，同时保持 stage 稳定。

### Honest FAQ miss
如果系统找不到可靠答案，就要实话实说。
不能假装自己知道，也不能偷偷掉回 workflow prompt。

这件事很重要，因为早期版本的问题正好是反过来的：
- early-stage casual FAQ 会被吞掉，继续回 triage 文案
- later-stage FAQ 有时会掉回 generic stage guidance

修正后的 contract 就是为了避免这两类错法。

## 14. `EXPLAIN_PROCESS` 为什么是特殊的

`EXPLAIN_PROCESS` 是一个真实的主流程阶段，但它不是普通意义上的 agent-owned stage。

这是一个刻意的设计。

正常 progression 到 `EXPLAIN_PROCESS` 时，应该：
- 把 primary stage 设为 `EXPLAIN_PROCESS`
- 用系统预定义的 process overview 来展示
- 不去 dispatch 一个正常 agent

也就是说：
- `EXPLAIN_PROCESS` 是一个 stage
- 但它通常是 **system-rendered**，而不是 **agent-driven**

这一点之所以重要，是因为更早的版本曾经错误地把：
- `EXPLAIN_PROCESS -> FaqAgent`

结果导致一些本来是正常主流程推进的 turn，比如：
- 选医院
- 问 “what is next?”

最后被渲染成 FAQ miss。

修正后的设计允许：
- 正常 progression 到 `EXPLAIN_PROCESS` 时 `dispatchAgent = null`

但这并不妨碍 FAQ detour 仍然可以发生在 `EXPLAIN_PROCESS` 阶段。
也就是说：
- `EXPLAIN_PROCESS` 本身不是 `FaqAgent` 的归属阶段
- 只是 FAQ 可以从这个阶段绕行出去，再回来

## 15. supporting documents 和 consult readiness

supporting-documents 阶段就是 `COLLECT_MEDICAL_INPUTS`。

这个阶段的含义比“泛泛收集 records”要窄。
它主要是用户上传诊断证明或其他支持性医学文件的步骤。

这里有几个重要规则：
- 用户可以上传 1 份或多份文件
- 至少 1 份 supporting document 就足以满足 consult readiness
- 后面仍然可以继续补传
- 附件本身没有全局路由权力
- attachment 只是输入，不是“把流程打回某一步”的全局命令

当前产品语义是：
- 已选医院
- 已看过流程说明
- 至少 1 份 supporting document

这些条件满足后，就可以进入 `ONLINE_CONSULT`。

这件事曾经是一个重要修复点，因为早期 live bug 证明过：
- supporting document 明明已经存进 session 了
- 但 authority 层运行时却没真正收到这个结构化状态
- 于是系统还以为 docs 是 0 份

后来的修复就是把 supporting-document structured state 真正接到 authority 输入里。

## 16. 为什么 attachment 不能成为全局路由真相

单独一个附件，不应该决定 stage。

这个规则存在，是因为早期确实出现过这种坏行为：
- 用户明明已经走到后面的阶段了
- 然后上传了一个 PDF
- 系统却把它当成 early triage upload
- 结果把用户错误打回前面

修正后的规则很简单：
- attachment 只是输入
- 当前 persisted stage 才是主真相
- 最终是否切 stage，要看 authority 批准后的 progression

## 17. 为什么我们尽量不引入太多 flags

`chatbot-v3` 的另一个重要经验是：
如果 compatibility flag 太多，系统很容易长出 dual truth，最后 control plane 越来越脏。

所以修正后的系统故意偏向：
- 少量 persisted journey snapshot
- 少量 structured domain truths
- 极少数真的有意义的 native booleans

这也是为什么 supporting-document state 只保留：
- `path`
- `name`

而不去做：
- 自动分类
- LLM 文档识别
- 用户逐份确认
- 复杂状态树

目标就是让 canonical truth 尽量小、尽量稳定。

## 18. 例子：early FAQ 不应该打断 triage

```text
User: Hello
Assistant: 我们已经收到了你的基础 intake。请回答这 3 个补充问题，或者你也可以选择跳过。

User: Do you guys even work on Sundays lol
Assistant: 我暂时没有找到可靠的 FAQ 答案，但你的当前主流程阶段仍然保持不变，我们可以随时继续。
```

这时内部应该发生的是：
- primary stage 仍然是 `COLLECT_MINIMAL_MEDICAL_FACTS`
- 这一轮是 FAQ detour
- 不发生 triage progression
- assistant 也不能假装 FAQ 是 triage answer

## 19. 例子：`EXPLAIN_PROCESS` 阶段插入 FAQ

```text
User: Select first hospital.
Assistant: 下面我来解释一下整体流程和下一步。

User: How long are people usually stuck in China for this, roughly?
Assistant: 我暂时没有找到可靠的 FAQ 答案，但你的当前阶段仍然被保留。

User: Okay, what is next?
Assistant: 请上传你的支持性诊断文件。
```

内部应该发生的是：
- 选医院后，primary stage 进入 `EXPLAIN_PROCESS`
- FAQ 这一轮只是 detour，不是 progression
- FAQ 不改写 primary stage
- 下一轮 progression 仍然从 `EXPLAIN_PROCESS` 恢复
- 然后再继续推进到 `COLLECT_MEDICAL_INPUTS`

## 20. 例子：在 medical inputs 阶段 FAQ，然后继续

```text
User: Okay, what is next?
Assistant: 请上传你的诊断证明。

User: If I already got scans done elsewhere is that okay?
Assistant: [FAQ answer 或 honest miss]

User: uploads diagnosis-certificate.pdf
Assistant: [材料上传确认]

User: What is next now?
Assistant: [在线咨询阶段响应]
```

内部应该发生的是：
- FAQ detour 不改写 `COLLECT_MEDICAL_INPUTS` 这个 saved primary stage
- upload 会 append 到 `supportingDocuments`
- 至少 1 份 supporting document 已满足 consult readiness
- 后面的 progression turn 可以进入 `ONLINE_CONSULT`

## 21. 这个系统当前刻意不做的事情

这个 v1 contract 明确**不做**这些事：
- 文档 OCR
- 自动文档类型分类
- 用 LLM 给材料打标签
- 把所有 stage/agent 全面彻底解耦成更大重构
- 为了兼容历史 session 引入太重的迁移逻辑

当前策略是：
把 control plane 维持得足够小、足够显式。

## 22. 如果只记住一页，应该记住什么

如果有人最后只记住一页内容，那应该是：

- 用户进入 chat 前已经做过基础 intake
- chat 的开头是 post-intake follow-up，不是 cold-start intake
- 整个 journey 是按 stage 推进，而且会被持久化
- `Supervisor` 负责提议，但 `JourneyRuntimeAuthority` 是最终 writer
- structured state 比 lossy boolean shortcut 更可信
- FAQ 在所有 stage 都应该能接住
- FAQ 是 detour，不是 progression
- FAQ miss 必须诚实
- `EXPLAIN_PROCESS` 是 system-rendered stage
- supporting documents 只保留最小 truth
- 至少 1 份 supporting document 就足够进入 consult
- attachment 是输入，不是全局路由真相
- persisted primary stage 必须跨 detour、retry、upload 保持稳定

## 23. 这份文档和旧 spec 的关系

这份文档是 integrated overview。
它不是要替代所有更细的设计文档。

最重要的细分参考仍然是：
- `/Users/haowang/Desktop/claws/medical-crm-v2/docs/superpowers/specs/2026-04-16-chatbot-v3-supervisor-led-contract-design.md`
- `/Users/haowang/Desktop/claws/medical-crm-v2/docs/superpowers/specs/2026-04-18-chatbot-v3-post-intake-conversation-contract-design.md`
- `/Users/haowang/Desktop/claws/medical-crm-v2/docs/superpowers/specs/2026-04-18-chatbot-v3-post-intake-follow-up-and-diagnosis-proof-refinement.md`
- `/Users/haowang/Desktop/claws/medical-crm-v2/docs/superpowers/specs/2026-04-19-chatbot-v3-control-plane-repair-design.md`
- `/Users/haowang/Desktop/claws/medical-crm-v2/docs/superpowers/specs/2026-04-22-chatbot-v3-faq-recognition-and-detour-boundary-design.md`

最佳阅读顺序应该是：
- 先读这份总览建立完整心智
- 然后按需要再跳去旧 spec 深挖实现细节

## 24. 什么叫这套设计真正成功了

如果下面这些事都成立，就可以认为这份 integrated `chatbot-v3` 设计是成功的：

- 一个完全没有背景的人也能用一份文档理解整体系统
- post-intake 行为不再像 cold-start intake
- answered 和 skipped 两条 follow-up 分支都能正常工作
- recommendation 和 process explanation 是清晰分开的两个步骤
- supporting documents 不会再把用户错误打回前面
- FAQ 在所有 stage 都能接住
- FAQ miss 都会诚实回答
- `EXPLAIN_PROCESS` 作为 system-rendered stage 行为稳定
- online consult progression 由真实 persisted truth 驱动
- persisted primary stage 能跨 retry、detour、upload 持续稳定
