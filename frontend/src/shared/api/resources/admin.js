import { request } from "../client.js";

// 后台
export const adminOverview = () => request("/admin/overview");
export const adminUsers = () => request("/admin/users");
export const adminDeleteUser = (id) => request(`/admin/users/${id}`, { method: "DELETE" });
export const adminUpdateMembership = (id, days) => request(`/admin/users/${id}/membership`, { method: "PUT", body: { days } });
export const adminAdjustCredits = (username, delta, reason = "") => request(`/admin/credits/${encodeURIComponent(username)}/adjust`, { method: "POST", body: { delta, reason } });
export const adminPuzzles = (filters = {}) => request(`/admin/puzzles?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== "" && value != null))}`);
export const adminPuzzleSources = () => request("/admin/puzzle-library/sources");
export const adminPuzzleBatches = (offset = 0) => request(`/admin/puzzle-library/batches?limit=20&offset=${offset}`);
export const adminPreviewPuzzles = (body) => request("/admin/puzzle-library/preview", { method: "POST", body });
export const adminConfirmPuzzles = (id) => request(`/admin/puzzle-library/batches/${id}/confirm`, { method: "POST" });
export const adminSetPuzzleStatus = (body) => request("/admin/puzzle-library/status", { method: "POST", body });
export const adminEditPuzzle = (id, body) => request(`/admin/puzzle-library/puzzles/${id}`, { method: "PUT", body });
export const adminExportPuzzles = (filters) => request(`/admin/puzzle-library/export?${new URLSearchParams(filters)}`);
export const adminCreatePuzzle = (payload) => request("/admin/puzzles", { method: "POST", body: payload });
export const adminDeletePuzzle = (id) => request(`/admin/puzzles/${id}`, { method: "DELETE" });
export const adminGetVariantEngine = (variant) => request(`/admin/engine/${variant}`);
export const adminUpdateVariantEngine = (variant, path) => request(`/admin/engine/${variant}`, { method: "PUT", body: { path } });
export const adminGetLlmSettings = () => request("/admin/settings/llm");
export const adminUpdateLlmSettings = (payload) => request("/admin/settings/llm", { method: "PUT", body: payload });
export const adminTestLlmSettings = () => request("/admin/settings/llm/test", { method: "POST", body: {} });
export const adminLogs = (limit = 100, offset = 0, event = "") => request(`/admin/logs?limit=${limit}&offset=${offset}${event ? `&event=${encodeURIComponent(event)}` : ""}`);
