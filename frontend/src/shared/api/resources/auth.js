import { request } from "../client.js";

// 鉴权与账户
export const register = (username, password) => request("/auth/register", { method: "POST", body: { username, password } });
export const login = (username, password) => request("/auth/login", { method: "POST", body: { username, password } });
export const fetchMe = () => request("/auth/me");
export const getEntitlements = () => request("/account/entitlements");
