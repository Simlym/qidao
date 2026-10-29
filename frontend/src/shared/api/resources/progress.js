import { request } from "../client.js";

// 统计、学习与今日计划
export const getOverview = () => request("/stats/overview");
export const getByCategory = () => request("/stats/by_category");
export const getCatalog = () => request("/stats/catalog");
export const getWeekly = () => request("/stats/weekly");
export const getForecast = (days = 14) => request(`/stats/forecast?days=${days}`);
export const getRating = () => request("/stats/rating");
export const getLeaderboard = (limit = 20) => request(`/stats/leaderboard?limit=${limit}`);
export const getToday = () => request("/today");
export const getCurriculum = () => request("/learning/curriculum");
export const getMastery = () => request("/learning/mastery");
export const getLearningProgress = (days = 28) => request(`/learning/progress?days=${days}`);
export const startAssessment = () => request("/learning/assessment/start", { method: "POST", body: {} });
export const completeLearningPack = (id) => request(`/learning/packs/${id}/complete`, { method: "POST", body: {} });
export const createGameTrainingPack = (gameId) => request(`/learning/games/${gameId}/pack`, { method: "POST", body: {} });
