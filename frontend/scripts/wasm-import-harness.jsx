// 仅由 Vite 浏览器验收脚本加载，不进入应用入口或发行产物。
import React from "react";
import { createRoot } from "react-dom/client";
import BrowserEngineSettings from "../src/features/settings/BrowserEngineSettings.jsx";

createRoot(document.getElementById("root")).render(
  <BrowserEngineSettings manager={{ dispose: async () => {} }} variant={window.__WASM_IMPORT_VARIANT__ || "xiangqi"} />,
);
