import { request } from "../client.js";

// 训练
export const getNext = (category, kind) => {
  const query = new URLSearchParams();
  if (category) query.set("category", category);
  if (kind) query.set("kind", kind);
  const suffix = query.toString();
  return request(`/training/next${suffix ? `?${suffix}` : ""}`);
};
export const getTrainingPuzzle = (id, context = "training") => request(`/training/puzzle/${id}?context=${encodeURIComponent(context)}`);
export const checkMove = (payload) => request("/training/check_move", { method: "POST", body: payload });
export const submitRating = (payload) => request("/training/submit", { method: "POST", body: payload });
export const explainPuzzle = (puzzleId) => request("/training/explain", { method: "POST", body: { puzzle_id: puzzleId } });
