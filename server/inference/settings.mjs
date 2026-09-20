import { hash } from "../store.mjs";

export const INFERENCE_DEFAULTS = Object.freeze({
  autoTagEnabled: false,
  autoThreadEnabled: false,
  tagThreshold: null,
  threadThreshold: null,
});

export function inferenceStatus(store, box) {
  const settings = { ...INFERENCE_DEFAULTS, ...store.inferenceSettings() };
  return {
    ...settings,
    credential: {
      configured: store.hasInferenceCredential("jev"),
      encryptionAvailable: Boolean(box),
    },
  };
}

export function updateInferenceSettings(store, input) {
  const next = { ...INFERENCE_DEFAULTS, ...store.inferenceSettings() };
  for (const key of ["autoTagEnabled", "autoThreadEnabled"])
    if (key in input) {
      if (typeof input[key] !== "boolean")
        throw new TypeError("Invalid inference settings");
      next[key] = input[key];
    }
  for (const key of ["tagThreshold", "threadThreshold"])
    if (key in input) {
      if (input[key] !== null)
        throw new TypeError("Uncalibrated confidence is not configurable");
      next[key] = null;
    }
  return store.saveInferenceSettings(next);
}

export function saveJevCredential(store, box, apiKey) {
  if (!box) throw new TypeError("Inference encryption key is unavailable");
  if (typeof apiKey !== "string" || apiKey.length < 8 || apiKey.length > 4096)
    throw new TypeError("Invalid API key");
  store.saveInferenceCredential("jev", box.encrypt(apiKey), {
    keyFingerprint: hash(apiKey).slice(0, 16),
  });
}

export function loadJevCredential(store, box) {
  if (!box) return null;
  const credential = store.inferenceCredential("jev");
  return credential ? box.decrypt(credential.payload) : null;
}
