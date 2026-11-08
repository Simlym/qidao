import React from "react";

export default function BrowserEngineVersionPicker({ options, value, busy, onChange }) {
  const name = React.useId();
  return <fieldset className="engine-browser-versions" disabled={busy}>
    <legend>下载版本</legend>
    <div className="engine-version-options">
      {options.map(({ spec, available }) => <label
        key={spec.id}
        className={`engine-version-option${value === spec.id ? " is-selected" : ""}${available ? "" : " is-unavailable"}`}
      >
        <input type="radio" name={name} value={spec.id} checked={value === spec.id}
          disabled={!available} onChange={() => onChange(spec.id)} />
        <span className="engine-version-copy">
          <strong>{spec.name}</strong>
          <span className="engine-version-number">{spec.version}</span>
          {!available && <span className="engine-version-unavailable">当前设备不可用</span>}
        </span>
        <span className="engine-version-badge">{spec.threads ? "多线程" : "单线程 · 推荐"}</span>
      </label>)}
      {options.length === 0 && <p className="engine-fine-print">暂无适配版本，可尝试手动导入兼容的引擎包。</p>}
    </div>
    <p className="engine-fine-print">选择下次下载使用的版本，不会更换当前引擎。</p>
  </fieldset>;
}
