# Third-party notices

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

Windows 客户端提供从 [Fairy-Stockfish 上游发布](https://github.com/fairy-stockfish/Fairy-Stockfish/releases/tag/fairy_sf_14)下载程序的入口；第三方程序与权重不包含在棋岛安装包中。默认安装项为 largeboard 构建，使用传统评估，不下载 NNUE。

Fairy-Stockfish is Copyright (C) the Fairy-Stockfish and Stockfish contributors, licensed under GNU GPL version 3. 对应版本源码：[fairy_sf_14](https://github.com/fairy-stockfish/Fairy-Stockfish/tree/fairy_sf_14)。许可正文随安装记录保存为 `COPYING.txt`，仓库副本位于 `src-tauri/engine-installer/licenses/Fairy-Stockfish-GPL-3.0.txt`。

## Wukong Xiangqi 题库来源

内置 Wukong 衍生杀法题来自 [maksimKorzh/wukong-xiangqi](https://github.com/maksimKorzh/wukong-xiangqi)，上游仓库采用 MIT License，Copyright (c) 2021 Maksym Korzh。保留的许可正文见 [Wukong MIT](docs/licenses/Wukong-MIT.txt)。

棋岛对原始 FEN 与杀棋步数进行了连将杀求解、逐手合法性审计、去重、分类与难度调整；转换说明见[题库导入与管理](docs/development/puzzles.md)。

## CCPD 实战棋谱来源

内置 CCPD 衍生课程来自 [Chinese Chess Practical Dataset](https://github.com/Yvonne761/Chinese-Chess-Practical-Dataset)。来源署名：Yu-Han Tseng and Bo-Nian Chen (2026), Chinese Chess Practical Dataset (CCPD)。上游采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)，Copyright (c) 2026 Yu-Han Tseng；上游许可声明副本见 [CCPD LICENSE](docs/licenses/CCPD-CC-BY-4.0.txt)。

棋岛进行了中文记谱解码、UCI 着法转换、逐手合法性检查与课程片段截取。课程主线不宣称为唯一最优解；原始来源与许可不因转换而改变。
