# 默认棋局音效

作者：Kenney（https://kenney.nl/）。授权：CC0 1.0。
下载日期：2026-11-08。原始许可见本目录的两个 `*-License.txt`。

| 文件 | 原始素材包 | 原始文件 |
| --- | --- | --- |
| move.wav | https://kenney.nl/assets/casino-audio | Audio/chip-lay-1.ogg |
| capture.wav | 同上 | Audio/chips-collide-1.ogg |
| check.wav | https://kenney.nl/assets/interface-sounds | Audio/bong_001.ogg |
| win.wav | 同上 | Audio/confirmation_002.ogg |
| lose.wav | 同上 | Audio/error_004.ogg |
| draw.wav | 同上 | Audio/question_001.ogg |

处理：移除开头低于 -50 dB 的静音、2 ms 淡入、峰值限制为 0.85，
转为 24 kHz 单声道 PCM WAV，兼顾浏览器与原生 WebView 解码。
资源通过 Vite 打包到本机，播放无需访问第三方服务；加载或解码失败时使用原有合成音。

这套音效是棋岛的默认木质音色，不是天天象棋原声，也不包含人声播报。

## 三套象棋音效主题

`xqwlight`（象棋巫师）、`gmchess`、`stevenbaby` 均可在设置中免费选择，
并加入对弈页音色轮换。对弈与自由分析共用同一份本机偏好。
音频使用 `auditions/` 中的原始 WAV，不改变试听时的音量与音色。

象棋巫师包含完整的六类事件；GMChess 缺少的和棋提示、StevenBaby 缺少的
胜利／失败／和棋提示均沿用象棋巫师。来源与原始许可保留在 `auditions/`。
采样按文件地址分别缓存，切换主题不会串用另一套的同名事件。
