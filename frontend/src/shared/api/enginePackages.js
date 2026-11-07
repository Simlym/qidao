// 引擎发行文件匿名下载，与业务服务器、账号会话和会员状态无关。
export async function downloadEngineBytes(url, size, { signal, onProgress } = {}) {
  let response;
  try {
    response = await fetch(url, { signal, mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("引擎下载失败，请检查网络及下载源的跨域设置；也可手动导入引擎目录");
  }
  if (!response.ok || !response.body) throw new Error(`引擎下载失败（HTTP ${response.status}）`);
  const reader = response.body.getReader();
  const bytes = new Uint8Array(size);
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      signal?.throwIfAborted();
      if (received + value.length > size) throw new Error("引擎下载大小超过固定清单");
      bytes.set(value, received);
      received += value.length;
      onProgress?.({ phase: "downloading", downloaded: received, total: size });
    }
    if (received !== size) throw new Error("引擎下载不完整");
    return bytes;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
