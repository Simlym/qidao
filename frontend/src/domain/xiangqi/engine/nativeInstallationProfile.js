// 下载和 ZIP 导入使用同一配置转换，匹配权重随程序一起启用。
export function nativeInstallationProfile(result, variant, { threads, hashMb }) {
  const receipt = result.package || result.receipt;
  if (!receipt || !result.enginePath) throw new Error("引擎安装结果不完整");
  const actualVariant = receipt.variant || "xiangqi";
  if (actualVariant !== variant) throw new Error("安装结果与当前棋种不匹配");
  if (result.package?.networkPath && !result.nnuePath) throw new Error("引擎包缺少匹配权重");
  return {
    path: result.enginePath, nnuePath: result.nnuePath || null, args: [], threads, hashMb,
    uciVariant: receipt.uciVariant || null, uciProtocol: receipt.uciProtocol || null,
    useNnue: result.package ? Boolean(result.nnuePath) : receipt.useNnue,
  };
}
