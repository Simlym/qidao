# 题库维护

以下导入、生成和审计命令均在仓库的 `backend/` 目录执行；先完成后端依赖安装。

题库数据与代码分离，存放在 [`backend/seeds/`](../../backend/seeds/)：

- `seed_puzzles.json`：小型种子题库。
- `generated_puzzles.json`：内置生成器产出的杀法题。
- `wukong_puzzles.audited.json`：经过合法性、终局、多解与重复局面审计的较大题库。

应用启动时若公共题库为空，会自动导入 `seeds/` 目录下全部 JSON（目录可用 `SEEDS_DIR` 覆盖）；已有题库则跳过，因此扩容或更新题库需手动导入：

```bash
uv run python -m app.modules.puzzles.importer.load seeds/wukong_puzzles.audited.json
```

也可以生成新的一步杀题，产出直接放进种子目录：

```bash
uv run python -m app.modules.puzzles.importer.generate --count 100 --seed 1234 --out seeds/more.json
uv run python -m app.modules.puzzles.importer.load seeds/more.json
```

自有题库需转换为项目 JSON 格式，着法统一使用 UCI 坐标制，例如 `h2e2`。设置 `XIANGQI_ENGINE` 后可用 `--verify` 调用用户引擎校验，或先运行审计工具（默认读取 `backend/wukong_puzzles.json`，产出写入 `seeds/`）：

内置课程还包含由 [CCPD](https://github.com/Yvonne761/Chinese-Chess-Practical-Dataset)（CC BY 4.0）转换的开局、中局和残局实战谱。重新生成时，将 CCPD 的 `Dataset` 目录传给转换器；转换过程会解码 Big5 中文棋谱、转换为 UCI 并逐手检查合法性：

```bash
python -m app.modules.puzzles.importer.import_ccpd ../Chinese-Chess-Practical-Dataset/Dataset
python -m app.modules.puzzles.importer.load seeds/ccpd_curriculum.json
```

生成时可通过 `--engine <Pikafish路径>` 逐题核对第一手；与引擎首选一致的题会标记为已验证，其余题仍作为大师实战主线保留。已有数据库不会在启动时自动扩容，需手动执行导入命令；全新数据库会自动播种 `seeds/` 下全部 JSON。

```bash
uv run python -m app.modules.puzzles.importer.load path/to/puzzles.json --verify
uv run python -m app.modules.puzzles.importer.audit_puzzles
```

格式示例可参考 [`backend/seeds/seed_puzzles.json`](../../backend/seeds/seed_puzzles.json)，审计说明见 [`backend/seeds/puzzle_audit_report.md`](../../backend/seeds/puzzle_audit_report.md)。

