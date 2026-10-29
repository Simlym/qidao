import { request } from "../client.js";

// 题目反馈、人工审核与题解版本；重试沿用请求标识。
export const reportPuzzle = (id, body, idempotencyKey) => request(`/puzzles/${id}/reports`, { method:"POST", body, idempotencyKey });
export const myPuzzleReports = (filters = {}) => request(`/puzzles/reports/mine?${new URLSearchParams(filters)}`);
export const adminPuzzleReports = (filters = {}) => request(`/admin/puzzle-library/reports?${new URLSearchParams(filters)}`);
export const adminResolvePuzzleReport = (id, body) => request(`/admin/puzzle-library/reports/${id}/resolve`, { method:"POST", body });
export const adminPuzzleDetail = (id) => request(`/admin/puzzle-library/puzzles/${id}`);
export const adminPuzzleVersions = (id) => request(`/admin/puzzle-library/puzzles/${id}/versions`);
export const adminPuzzleReviews = (id) => request(`/admin/puzzle-library/puzzles/${id}/reviews`);
export const adminReviewPuzzle = (id, body, idempotencyKey) => request(`/admin/puzzle-library/puzzles/${id}/reviews`, { method:"POST", body, idempotencyKey });
export const adminRevisePuzzle = (id, body) => request(`/admin/puzzle-library/puzzles/${id}/revisions`, { method:"POST", body });
