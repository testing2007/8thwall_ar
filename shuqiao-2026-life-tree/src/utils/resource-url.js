const ABSOLUTE_URL = /^(?:https?:|blob:|data:)/i;
const PRODUCTION_ASSET_BASE = "https://qphong.cn/shuqiao-2026-life-tree/";

const injectedBase =
  typeof __ASSET_BASE_URL__ !== "undefined"
    ? String(__ASSET_BASE_URL__ || "").trim()
    : "";
const buildMode =
  typeof __BUILD_MODE__ !== "undefined" ? String(__BUILD_MODE__) : "production";
const developmentSessionKey = Date.now().toString(36);

const withTrailingSlash = (value) =>
  value.endsWith("/") ? value : `${value}/`;

export const getAssetBaseUrl = () => {
  if (injectedBase) return withTrailingSlash(injectedBase);
  if (buildMode === "development" && typeof window !== "undefined") {
    return withTrailingSlash(window.location.origin);
  }
  return PRODUCTION_ASSET_BASE;
};

export const resolveResourceUrl = (source) => {
  const value = String(source || "").trim();
  if (!value || ABSOLUTE_URL.test(value)) return value;
  const resolved = new URL(value.replace(/^\/+/, ""), getAssetBaseUrl());
  // Replacing an MP3/GLB under the same filename can leave an already-created
  // HTMLMediaElement bound to stale bytes. A per-page development key keeps
  // localhost/ngrok editing deterministic without changing production URLs.
  if (buildMode === "development") {
    resolved.searchParams.set("__lt_dev", developmentSessionKey);
  }
  return resolved.href;
};

export const RESOURCE_ENVIRONMENT = Object.freeze({
  buildMode,
  injectedBase,
  productionDefault: PRODUCTION_ASSET_BASE,
});
