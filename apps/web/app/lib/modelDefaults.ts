const KEY = "ns-model-defaults";

export type ModelDefaults = { writer: string; controller: string };

export function loadModelDefaults(): ModelDefaults {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* localStorage unavailable */
  }
  return { writer: "qwen3.8:27b", controller: "qwen3:14b" };
}

export function saveModelDefaults(d: ModelDefaults) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* localStorage unavailable */
  }
}
