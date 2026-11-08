# Third-party notices

## 象棋候选试听音效

设置页提供三套原声对比：

- [XQWLight](https://github.com/xqbase/xqwlight)，固定提交 `6221733f1f79b3acb44cce6f83dc6100443cb2c9`，仓库采用 GPL-2.0。
- [GMChess](https://github.com/lerosua/gmchess)，固定提交 `a532daf5edfdc8cc0f5b5d5415a79d0dcdef3181`，仓库采用 GPL-2.0。
- [StevenBaby/chess](https://github.com/StevenBaby/chess)，固定提交 `4da2d408852fbfa75d7ac3c90119c6292b975621`，仓库采用 MIT。

原始 WAV 未修改；每套仓库许可正文保留于 `frontend/src/shared/audio/auditions/<套装>/LICENSE.txt`。
逐文件来源、哈希与体积见 [试听音效清单](frontend/src/shared/audio/auditions/sources.json)。
以上是仓库级许可声明，不另行宣称素材为原创或 CC0。

## Kenney 棋局音效

默认木质音色使用 Kenney 的 [Casino Audio](https://kenney.nl/assets/casino-audio) 和
[Interface Sounds](https://kenney.nl/assets/interface-sounds)，均采用 CC0 1.0。
采样随应用提供，来源与处理说明见 [音效说明](frontend/src/shared/audio/README.md)，
原包许可保留于该目录。本项目未使用天天象棋的音频文件。

## fflate

WASM 在线安装使用 [fflate](https://github.com/101arrowz/fflate) 0.8.3 解压 ZIP，采用 MIT License。
许可正文见 [fflate MIT](docs/licenses/fflate-MIT.txt)。该依赖不包含象棋引擎或权重。

## JieqiBox

Parts of the Jieqi rules, FEN conventions, interaction behavior, board and arrow styling,
and piece SVG artwork are adapted from
[JieqiBox](https://github.com/Velithia/JieqiBox).

Copyright (c) 2025 Velithia

Licensed under the MIT License. The full license text is available in the upstream
repository and permits use, modification, and distribution provided that the copyright
and permission notice are retained.

A bundled copy is stored at [JieqiBox LICENSE](frontend/src/domain/xiangqi/jieqi/assets/LICENSE).


## Fairy-Stockfish（可选下载）

第三方程序与权重不包含在棋岛安装包中。推荐下载固定到[棋岛引擎 Releases](https://github.com/Simlym/qidao/releases)，Web／安卓由同仓库 GitHub Pages 分发字节一致的 WASM 包。旧版 Fairy-Stockfish 上游安装入口仍可选择。

Fairy-Stockfish is Copyright (C) the Fairy-Stockfish and Stockfish contributors, licensed under GNU GPL version 3. PC NNUE 对应源码为 `84dd49a4bd00b9959b07e1b917d362c46e6f6d75`；WASM 对应 `fairy-stockfish.wasm` 提交 `d062eec1681dc8c805fed80dfa0528eeb554312b`，平台适配补丁及构建源码随发行附件提供。每个引擎包保留 GPL 正文、AUTHORS 和完整来源说明；对应完整源码在同一 Release 的 source 附件中。

标准象棋使用固定 CC0 网络 `xiangqi-c07e94a5c7cb.nnue`。完整来源与许可依据见 [Fairy 象棋网络说明](docs/licenses/Fairy-Xiangqi-NNUE.md)，CC0 正文见 [CC0-1.0.txt](docs/licenses/CC0-1.0.txt)。此许可说明不适用于 Pikafish 自身的 `pikafish.nnue`。

## PikaJieQi（可选下载）

揭棋使用 [official-pikafish/Pikafish](https://github.com/official-pikafish/Pikafish/tree/23b9466c981f0f3a1133f92de1a6f86406c4eccc) 的固定揭棋提交，Copyright (C) the Pikafish and Stockfish contributors，GPL-3.0。该固定版本 `USE_NNUEEVAL=0`，采用传统评估，公开 PC／WASM 包均不附带 NNUE 权重。

程序包保留 GPL 正文和 AUTHORS，对应完整源码、Windows 构建适配或 WASM 补丁及构建源码均随同一引擎 Release 提供。具体附件、SHA-256 和验收范围见[发布记录](docs/engines/release-20261107.md)。

## Wukong Xiangqi 题库来源

内置 Wukong 衍生杀法题来自 [maksimKorzh/wukong-xiangqi](https://github.com/maksimKorzh/wukong-xiangqi)，上游仓库采用 MIT License，Copyright (c) 2021 Maksym Korzh。保留的许可正文见 [Wukong MIT](docs/licenses/Wukong-MIT.txt)。

棋岛对原始 FEN 与杀棋步数进行了连将杀求解、逐手合法性审计、去重、分类与难度调整；转换说明见[题库导入与管理](docs/development/puzzles.md)。

## CCPD 实战棋谱来源

内置 CCPD 衍生课程来自 [Chinese Chess Practical Dataset](https://github.com/Yvonne761/Chinese-Chess-Practical-Dataset)。来源署名：Yu-Han Tseng and Bo-Nian Chen (2026), Chinese Chess Practical Dataset (CCPD)。上游采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，Copyright (c) 2026 Yu-Han Tseng；上游许可声明副本见 [CCPD LICENSE](docs/licenses/CCPD-CC-BY-4.0.txt)。

棋岛进行了中文记谱解码、UCI 着法转换、逐手合法性检查与课程片段截取。课程主线不宣称为唯一最优解；原始来源与许可不因转换而改变。
