import { request } from "../client.js";

// 闯关与棋谱
export const getLevels = () => request("/challenge/levels");
export const getLevel = (index) => request(`/challenge/level/${index}`);
export const submitChallenge = (payload) => request("/challenge/submit", { method: "POST", body: payload });
export const getGames = (limit = 20, offset = 0) => request(`/games?limit=${limit}&offset=${offset}`);
export const importGame = (payload) => request("/games/import", { method: "POST", body: payload });
export const getGamePositions = (gameId) => request(`/games/${gameId}`);
export const deleteGame = (gameId) => request(`/games/${gameId}`, { method: "DELETE" });
export const analyzeGame = (gameId) => request(`/games/${gameId}/analyze`, { method: "POST", body: {} });
export const getAnalysis = (gameId) => request(`/games/${gameId}/analysis`);
