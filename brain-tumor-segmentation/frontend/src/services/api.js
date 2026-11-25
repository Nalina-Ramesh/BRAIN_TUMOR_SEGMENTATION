import axios from "axios";

export const API_ROOT = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
export const api = axios.create({ baseURL: `${API_ROOT}/api` });

export function errorMessage(err) {
  if (err?.response) {
    const d = err.response.data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x) => x.msg).join("; ");
    return `The server returned an error (${err.response.status}).`;
  }
  if (err?.code === "ERR_NETWORK" || err?.request)
    return "Cannot reach the NeuroSeg backend. Make sure it is running on " + API_ROOT + ".";
  return err?.message || "Something went wrong.";
}

export const getHealth = () => api.get("/health").then((r) => r.data);
export const getModelInfo = () => api.get("/model-info").then((r) => r.data);
export const getTrainingInfo = () => api.get("/training-info").then((r) => r.data);
export const getSession = () => api.get("/session").then((r) => r.data);
export const listResults = () => api.get("/results").then((r) => r.data);
export const getResult = (id) => api.get(`/results/${id}`).then((r) => r.data);
export const deleteResult = (id) => api.delete(`/results/${id}`);

export function startSegmentation(files, tta, onUploadProgress) {
  const form = new FormData();
  form.append("flair", files.flair);
  form.append("t1", files.t1);
  form.append("t1c", files.t1c);
  form.append("t2", files.t2);
  form.append("tta", tta ? "true" : "false");
  return api.post("/segment", form, { onUploadProgress }).then((r) => r.data);
}

export const downloadUrl = (id, kind) => `${API_ROOT}/api/results/${id}/${kind}`; // mask | overlay | summary

export function sliceUrl(id, { plane, index, view, modality = 0, labels = [1, 2, 3], style = "region", opacity = 0.5 }) {
  const q = new URLSearchParams({ plane, index, view, modality, labels: labels.join(","), style, opacity });
  return `${API_ROOT}/api/results/${id}/slice?${q}`;
}
