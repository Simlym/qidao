import { request } from "../client.js";

// 教练、积分与外观
export const getCoachPlan = () => request("/coach/plan");
export const refreshCoachPlan = () => request("/coach/plan", { method: "POST", body: {} });
export const getCredits = () => request("/credits/me");
export const checkinCredits = () => request("/credits/checkin", { method: "POST", body: {} });
export const getCosmetics = () => request("/cosmetics/catalog");
export const purchaseCosmetic = (assetKey) => request("/cosmetics/purchase", { method: "POST", body: { asset_key: assetKey } });
