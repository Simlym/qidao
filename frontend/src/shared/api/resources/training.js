import { request } from "../client.js";

// 训练
export const getNext = (category, kind, { signal } = {}) => {
  const query = new URLSearchParams();
  if (category) query.set("category", category);
  if (kind) query.set("kind", kind);
  const suffix = query.toString();
  return request(`/training/next${suffix ? `?${suffix}` : ""}`, { signal });
};
export const getTrainingPuzzle = (id, context = "training", { signal } = {}) => request(`/training/puzzle/${id}?context=${encodeURIComponent(context)}`, { signal });
export const checkMove = (payload, { signal } = {}) => request("/training/check_move", { method: "POST", body: payload, signal });
export const submitRating = (payload, { signal } = {}) => request("/training/submit", { method: "POST", body: payload, signal });
export const explainPuzzle = (puzzleId, { signal } = {}) => request("/training/explain", { method: "POST", body: { puzzle_id: puzzleId }, signal });
