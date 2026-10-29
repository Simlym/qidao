# 不在此目录放置引擎

生产构建会排除整个 `public/engine` 目录。该目录不会随安装包分发引擎或权重。Windows x64 原生引导安装从 GitHub 下载到应用本地数据目录，不写入此目录。

PC 用户可在“设置 → 标准象棋引擎/揭棋引擎”中配置原生 UCI 程序；Windows 标准象棋另有引导安装入口，见[引擎说明](../../../docs/engines/README.md)。Web 和 Android 用户应在设置页导入符合
[`docs/engines/package-spec.md`](../../../docs/engines/package-spec.md) 的 WASM 引擎包；文件仅保存在设备本地。
