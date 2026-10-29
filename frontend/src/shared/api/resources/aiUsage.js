import { request } from "../client.js";

// AI 额度与训练积分独立；没有在线支付入口。
export const getAiUsage = () => request("/account/ai-usage");
export const adminAiPolicy = () => request("/admin/ai-usage/policy");
export const adminSaveAiPolicy = (payload) => request("/admin/ai-usage/policy", { method: "PUT", body: payload });
export const adminAiUsage = (username) => request(`/admin/ai-usage/users/${encodeURIComponent(username)}`);
export const adminAdjustAiQuota = (username, payload, idempotencyKey) => request(`/admin/ai-usage/users/${encodeURIComponent(username)}/adjust`, { method: "POST", body: payload, idempotencyKey });
export const adminAiCosts = () => request("/admin/ai-usage/costs");
export const adminRecoverAiQuota = (username) => request(`/admin/ai-usage/users/${encodeURIComponent(username)}/recover`, { method: "POST" });
