# 揭棋传统评估单线程 WASM 候选

## 固定来源与评估方式

从 `https://github.com/official-pikafish/Pikafish.git` 固定提交
`23b9466c981f0f3a1133f92de1a6f86406c4eccc` 重新拉取并构建，
与此前 PC 用户验收的揭棋版本使用同一源码基线，不读取历史本地引擎文件。

上游 `src/types.h` 原本定义 `USE_NNUEEVAL=0`，使用传统评估。本候选保持该选择，
移除无效的 EvalFile 选项与 NNUE 初始化，不下载、不加载、不打包任何 NNUE。
这不等于通过了历史揭棋权重的许可审核，也不代表 NNUE 棋力；程序沿用 GPL-3.0。

构建入口 `scripts/build_jieqi_wasm.py`，适配位于 `scripts/wasm/jieqi_single.py`。
Emscripten 镜像与标准象棋固定到同一摘要，保留上游可移植位棋盘实现，
用单线程 Asyncify 协作处理停止和 UCI 输入，不需要 SharedArrayBuffer。
只在独立克隆目录修改源码，所有补丁、GPL、署名、上游完整源码与构建脚本随产物提供。

```bash
python scripts/build_jieqi_wasm.py --output dist-engines/jieqi-wasm-candidate
```

需要 Linux/Docker；也可手动触发 `wasm-engine-candidate.yml`，选择 `variant=jieqi`。

## 已验证的候选

[云端构建及 Chromium 验收](https://github.com/Simlym/qidao/actions/runs/42372289744)
基于棋岛提交 `080d2f0`。同一 ZIP 在本机 Windows/Chrome 复验通过：

- 无共享内存环境下，真实 ZIP 校验、缓存安装、UCI 握手与传统评估启用。
- 揭棋初始扩展 FEN，红方 `h2e2`、黑方 `h7e7`，MultiPV=3。
- 无限搜索停止、立即停止并重开新局面、离线销毁后重启、真实设置页 ZIP 文件导入。
- 红方吃暗子后，仅把黑方限知 FEN 送入搜索，不向其暴露被吃暗子的身份。
  连续六步结果与棋岛揭棋合法着法对照通过；翻子由权威局面处理，搜索结果不指定真实身份。

Android 17 / WebView 149 模拟器安装新版 APK 后，设置页揭棋 ZIP 导入、传统评估启用、
红黑试算与停止通过；同设备的标准象棋 NNUE 配置与缓存继续正常使用。
关闭模拟器 Wi-Fi 和移动数据并强制结束应用后，两套引擎均能再次从缓存启动并试算。
断网升级资源加载的修复也纳入新版安卓入口。模拟器验证不代替 ARM64 真机验收。

本地文件在 `dist-engines/jieqi-wasm-20261107-01/`：

- `jieqi-pikajieqi-23b9466-classical-wasm-single-v1.zip`，246,508 字节。
- ZIP SHA-256：`7a7f0ff5e5a22a9f7e509643a0df3d17452c863e1319e841c6d8e0ae8b28edf9`。
- 清单 SHA-256：`73a3d5f8a228e2fe2dffe1c3714217e268e8073d012b8614565d9c1b90458ead`。

清单预留 `engines-20261107.5`，`publicDownload=false`，不创建公开 Release。
需更新到包含该候选校验值的软件后，才能用 ZIP 文件入口导入；旧测试 APK 不认识此 ZIP。
真机重点验证揭棋翻子后的分析、切换局面、停止重开、后台恢复与断网冷启动。

手机测试包为 `src-tauri/target/test-releases/QiDao-android-jieqi-wasm-test-arm64-v3.apk`，
调试签名已核验，ARM64 / Android 7.0+；不捆绑任何引擎或权重。
覆盖安装 v2 后，在“设置 → 揭棋引擎”选择上述 ZIP 导入。
