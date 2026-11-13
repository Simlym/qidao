import React from "react";
import { adminGetVariantEngine, adminInstallVariantEngine } from "../../shared/api";
import EngineStatusCard from "../settings/EngineStatusCard";
import EngineInstallProgress from "../settings/EngineInstallProgress";
import EngineMessage from "../settings/EngineSetupFeedback";

const PHASES = { downloading: true, extracting: true, testing: true, activating: true };

export default function OfficialServerEngineDownload({ variant, configuredPath, onComplete }) {
  const [status, setStatus] = React.useState(null);
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState("");
  const mounted = React.useRef(false);
  const installation = status?.installation;
  const installing = Boolean(PHASES[installation?.phase]);
  const busy = starting || installing;

  React.useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    adminGetVariantEngine(variant, { signal: controller.signal }).then((next) => {
      if (!controller.signal.aborted) setStatus(next);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason.message); });
    return () => { mounted.current = false; controller.abort(); };
  }, [variant, configuredPath]);

  React.useEffect(() => {
    if (!installing) return;
    const controller = new AbortController();
    let timer;
    async function poll() {
      try {
        const next = await adminGetVariantEngine(variant, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setStatus(next);
        setError("");
        if (!PHASES[next.installation?.phase]) return;
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(`状态更新失败，将自动重试：${reason.message}`);
      }
      timer = setTimeout(poll, 1500);
    }
    timer = setTimeout(poll, 1000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [variant, installing]);

  React.useEffect(() => {
    if (installation?.phase === "completed") onComplete().catch(() => {});
  }, [installation?.phase, onComplete]);

  async function install() {
    if (busy) return;
    setStarting(true); setError("");
    try {
      const next = await adminInstallVariantEngine(variant);
      if (mounted.current) setStatus((current) => ({ ...current, installation: next }));
    } catch (reason) {
      if (mounted.current) setError(reason.message);
    } finally {
      if (mounted.current) setStarting(false);
    }
  }

  const online = status?.online_package;
  const ready = installation?.phase === "completed" && status?.available;
  const message = error || (installation?.phase === "failed" ? installation.error : "");
  return <EngineStatusCard label="官方服务器象棋引擎" title={ready ? "象棋引擎已就绪" : "让服务器帮你分析象棋棋局"}
    description="从官方发布页下载引擎与权重，校验并试算通过后自动启用。失败时保留当前配置。" busy={busy} ready={ready}>
    {busy ? <><EngineInstallProgress progress={{ ...installation, phase: starting ? "preparing" : installation.phase, downloaded: installation?.received || 0 }} />
      <p className="engine-fine-print">可离开页面，服务器会继续安装。重新打开即可查看进度。</p></>
      : <div className="engine-main-actions"><button type="button" className="native-install-primary" disabled={!online?.supported} onClick={install}>
        {installation?.phase === "failed" ? "重试下载安装" : status?.available ? "重新下载并安装" : "下载并安装"}
      </button></div>}
    <p className="engine-fine-print">{!online ? "正在读取官方安装信息…" : online.supported
      ? `${online.name} · ${online.version} · 约 ${(online.size / 1048576).toFixed(1)} MB`
      : online.reason}</p>
    {online?.supported && <p className="engine-fine-print"><a href={online.source_url} target="_blank" rel="noreferrer">官方版本与许可说明</a></p>}
    {message && <EngineMessage message={{ error: true, summary: message }} />}
  </EngineStatusCard>;
}
