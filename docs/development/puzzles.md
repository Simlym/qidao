# 题库导入与管理

普通用户的训练操作见[使用指南](../USER_GUIDE.md)。本页面向管理员和题库维护者。

## 在管理后台导入

打开“后台 → 题库 → 导入与来源”，可选择：

- **本地 JSON 文件**：上传转换器输出的题目数组，或本项目导出的题库文件。
- **GitHub JSON 文件**：粘贴 `https://github.com/作者/仓库/blob/版本/文件.json` 或对应的 `raw.githubusercontent.com` 链接。支持公开仓库，不使用账号凭据；含斜杠的分支请改用完整提交 SHA。

填写批次名称、许可证或使用授权、作者与来源署名。GitHub 分支或标签会先解析为具体提交，再下载该版本；记录实际地址、提交 SHA 与文件 SHA-256。本地文件也记录指纹，可附原始来源链接。

1. 点击“检查并预览”，查看可导入、重复、不同题解冲突、无效题的数量和问题明细。
2. 确认后只把候选题导入**待审核**；确认使用服务器保存的快照，不重新读取 GitHub。重复确认同一批次不会重复入库。
3. 查看棋盘与题解，调整分类、难度和标签；没有学习记录的待审核题还可修改局面、题解和大类，保存时重新校验。
4. 勾选审核通过的题目，点击“批量发布”；也可在批次记录中发布整批。

每次最多 **500 题、2 MiB、题解合计 5000 手**。单题最多 8 个分支，每分支 1–31 手。大文件请用下方拆批工具处理。网络失败不会改动已有题库。

新批量导入与手动新增均先待审核。旧数据库的题目升级后保留为已发布，已知含三辆红车的旧生成题会自动下架并保留历史；原有首次播种与可信 CLI 导入仍直接发布，适用于维护者已审计的数据，不经过后台审核队列。

## 题源选择

GitHub 上的象棋数据格式不统一，公开可见也不代表可以直接作为商业题库使用。当前内置以下来源信息与转换器；后台不会执行上游 JavaScript 或自动把整盘棋当成战术题。

| 来源 | 上游格式与特点 | 已有接入方式 | 上游声明 |
| --- | --- | --- | --- |
| [Wukong Xiangqi](https://github.com/maksimKorzh/wukong-xiangqi) | 实战局面 FEN、赛事说明、杀棋步数；没有题解着法 | `import_wukong` 离线求连将杀，再审计、拆批、上传 | 仓库 MIT，保留版权及许可 |
| [CCPD](https://github.com/Yvonne761/Chinese-Chess-Practical-Dataset) | Big5 中文记谱 PGN，含开局、中局、残局和完整对局 | `import_ccpd` 逐手解析并检查，输出课程主线，再拆批、上传 | CC BY 4.0，保留作者、来源、许可与修改说明 |
| 其他 GitHub 题库 | 本项目标准 JSON 可直接读取；其他格式需新增转换器 | JSON 文件导入入口，或先离线转换 | 按具体数据授权填写，不推定沿用代码许可证 |

本次核对版本：Wukong `9ef8db735e78ec640a64d50240698087b44c5294`，CCPD `368a47a947773dd8692c026e286dd19b6277b993`。Wukong 默认下载已固定到该版本；更新上游版本需先核对内容及许可。没有明确数据授权的新来源，先记录为候选，不自动合入公共题库。

CCPD 所称 58,528 个实例包含大量完整对局，不等于 58,528 道可直接训练的题目。大师实战着法适合主线学习，也不能仅因出自实战就标成唯一最优解。

## 校验与去重规则

后台导入会检查标准象棋 FEN、棋子数量、帅将位置、走子方、着法格式及每个分支逐手合法性；拒绝初始非走子方已被将军或吃掉帅将代替将死的题解。兼容马 / 象的 `h/e` 字母记法并规范为 `n/b`；半回合等字段不参与题目身份。

- 同一规范局面、同一题解：跳过重复，包括文件内部重复。
- 同一局面、不同题解：报告冲突，不自动覆盖或拼接变着。
- 私人错题不会阻止相同局面的公共题导入，也不出现在公共题库管理列表中。
- 确认时重新检查数据库，处理预览后其他批次已经导入的题；指纹唯一约束防止并发写入重复局面。
- 杀法主线必须以出题方将死对手结束；一步杀可由规则确认。**多步主线合法、终点将死不能证明所有对手应手必败，也不能证明唯一解**，需另做引擎或求解审计。
- 不相信外部 JSON 自带的 `verified=true`；后台只按实际检查结果设置。历史维护者审计过的种子题保留原标记。

## 筛选、编辑、下架与导出

题库页可按大类、分类、难度、发布状态、校验状态筛选，搜索编号、分类、标签、来源和 FEN；批次记录中可筛选对应题目。

下架后不再进入新题、到期复习、题库目录、闯关和新测评，直接按编号训练也会拒绝。作答、复习、会话和棋局引用保留，可重新发布。旧删除 API 同样改为下架，避免外键断裂与学习历史丢失。

已发布或已有学习记录的题目不能直接改写局面和题解；发现答案错误时先下架。未使用的待审核题可直接纠错；已使用题可创建新版本，审核发布时下架旧版并保留历史，不自动迁移旧学习进度。详见[反馈、人工审核与版本修订](puzzle-quality.md)。分类、难度与标签仍可编辑。

勾选题目或选择批次即可导出 JSON，文件包含题目及来源许可证、署名、原始提交和文件指纹，不包含用户作答或内部操作员信息。导出文件再次导入会保留其原始来源记录；文件指纹指向原始下载内容，题目可能在审核时经过编辑。历史种子题未补齐批次来源，可结合本页和[第三方声明](../../THIRD_PARTY_NOTICES.md)核对。

## 离线转换与拆批

以下命令均在仓库的 `backend/` 目录执行，先按[构建文档](build-clients.md#本地启动后端与-web)安装依赖。转换输出暂放 `/tmp`，不要把待审核文件放入自动播种目录。

### Wukong：先求解，再审计

```bash
uv run python -m app.modules.puzzles.importer.import_wukong --limit 100 --out /tmp/wukong-raw.json
uv run python -m app.modules.puzzles.importer.audit_puzzles --input /tmp/wukong-raw.json --output /tmp/wukong-audited.json --report /tmp/wukong-audit.md
uv run python -m app.modules.puzzles.importer.prepare /tmp/wukong-audited.json --out /tmp/wukong-batches --license MIT --attribution "Maksym Korzh / wukong-xiangqi (2021)；棋岛求解与审计转换" --source-url https://github.com/maksimKorzh/wukong-xiangqi --source-revision 9ef8db735e78ec640a64d50240698087b44c5294
```

求解与多解审计可能耗时较长，放在离线维护流程中，避免占用在线请求。`--limit` 控制成功输出题数，不是扫描题数；不设置时会尝试全部局面。

### CCPD：实战主线课程

取得上游仓库并固定版本后，将其 `Dataset` 目录传给转换器：

```bash
git clone https://github.com/Yvonne761/Chinese-Chess-Practical-Dataset.git /tmp/CCPD
git -C /tmp/CCPD checkout 368a47a947773dd8692c026e286dd19b6277b993
uv run python -m app.modules.puzzles.importer.import_ccpd /tmp/CCPD/Dataset --out /tmp/ccpd-curriculum.json
uv run python -m app.modules.puzzles.importer.prepare /tmp/ccpd-curriculum.json --out /tmp/ccpd-batches --license CC-BY-4.0 --attribution "Yu-Han Tseng and Bo-Nian Chen (2026), CCPD；棋岛记谱转换与课程截取" --source-url https://github.com/Yvonne761/Chinese-Chess-Practical-Dataset --source-revision 368a47a947773dd8692c026e286dd19b6277b993
```

转换时可加 `--engine <Pikafish路径>` 核对第一手；没有通过引擎首选的实战主线也可能有教学价值，不能自动等同为错误或唯一正确答案。后台导入仍重新执行基础校验，不直接采信文件中的校验标记。

把拆好的 `batch-*.json` 逐个上传后台，填写来源信息，预览后导入审核。也可将这些 JSON 放到有相应数据分发授权的公开 GitHub 仓库，再用文件链接导入。拆批工具不覆盖同名输出文件。

## 标准 JSON 示例

```json
[
  {
    "fen": "4k4/R7R/9/9/9/9/9/9/9/3K5 w",
    "solution": ["a8a9"],
    "side_to_move": "w",
    "kind": "杀法",
    "category": "双车错",
    "difficulty": 2,
    "source": "自编示例",
    "tags": "封锁逃路,子力配合"
  }
]
```

着法使用 UCI 坐标制；多步按双方交替排列。多个接受的分支可用文本 `a8a9|i8i9`，每分支内部用逗号分隔。支持大类为杀法、开局、中局、残局；本轮批量导入不支持揭棋题库。

## 原有播种与 CLI 维护

内置文件在 [`backend/seeds/`](../../backend/seeds/)：`seed_puzzles.json`、`generated_puzzles.json`、`wukong_puzzles.audited.json`、`ccpd_curriculum.json` 等。公共题库为空时启动自动导入，目录可用 `SEEDS_DIR` 覆盖；已有题库不自动扩容。

维护者直接导入已审计文件，仍可使用以下命令；这一路径直接发布，不替代后台审核：

```bash
uv run python -m app.modules.puzzles.importer.load seeds/wukong_puzzles.audited.json
uv run python -m app.modules.puzzles.importer.load path/to/puzzles.json --verify
uv run python -m app.modules.puzzles.importer.generate --count 100 --seed 1234 --out /tmp/more.json
```

`--verify` 使用 `XIANGQI_ENGINE` 核对第一手，不证明完整强制杀或唯一解。现有种子审计报告见 [`puzzle_audit_report.md`](../../backend/seeds/puzzle_audit_report.md)。

## 现有题库质量

本轮还检查了现有种子题，修复生成器可能摆出三辆红车的问题，移除 5 道非法种子题；旧库对应题目升级后下架而不删除历史。CCPD 的 42 个重复局面保留待人工核对。完整数量与边界见[质量基线](puzzle-quality-baseline.md)。

## 后续增强范围

已完成导入审核、来源追踪、批量管理，并补齐用户反馈队列、分支逐步核对、人工审核证据及题解版本修订。上游定时同步、后台求解、自动多解证明、反馈推送与镜像下载源仍待后续实现。
