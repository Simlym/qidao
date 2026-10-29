# 象棋道文档

项目介绍和各端可用状态见[首页](../README.md)。日常操作请先看[使用指南](USER_GUIDE.md)。

## 部署与维护

- [后端部署与维护](deployment/backend.md)：Docker Compose、HTTPS、管理员初始化、引擎与 AI 服务配置、备份和升级。
- [会员与 AI 额度](deployment/ai-usage.md)：额度策略、管理员操作、调用记录、成本统计与当前限制。
- [引擎安装与导入](engines/README.md)：各端安装方式、GitHub 下载来源、版本管理和许可。

## 构建与开发

- [客户端配置、构建与本地开发](development/build-clients.md)：各端默认服务地址、运行时切换、打包与验证。
- [多端架构](ARCHITECTURE.md)：技术栈、代码分层、引擎选择、账号隔离和额度账本。
- [题库维护](development/puzzles.md)：种子题库、导入、生成、审计和数据来源。
- [浏览器引擎包规范](engines/package-spec.md)：兼容引擎包的文件与协议要求。

## 进度与声明

- [实施与验收状态](IMPLEMENTATION_STATUS.md)：已完成的四批工作、开发验证和发布前待办。
- [第三方声明](../THIRD_PARTY_NOTICES.md)：所用第三方资源与许可说明。
