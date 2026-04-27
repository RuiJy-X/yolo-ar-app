import type { SessionVideoEntry } from "./types";

const SESSION_MAX_ITEMS = 4;

export const getFilenameFromUrl = (
  url: string,
  fallback = "annotated_video.mp4",
) => {
  try {
    const parsed = new URL(url, window.location.origin);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.length > 0
      ? decodeURIComponent(parts[parts.length - 1])
      : fallback;
  } catch {
    return fallback;
  }
};

export const toAbsoluteUrl = (url: string, apiBaseUrl: string) => {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  const base = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${base}${path}`;
};

export const withCacheBust = (url: string) => {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${Date.now()}`;
};

export const pruneSessionEntries = (entries: SessionVideoEntry[]) => {
  const now = Date.now();
  return entries
    .filter((entry) => entry.expiresAt > now)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, SESSION_MAX_ITEMS);
};

export const loadSessionEntries = (storageKey: string): SessionVideoEntry[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const entries = parsed.filter((item): item is SessionVideoEntry => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.videoUrl === "string" &&
        typeof item.downloadUrl === "string" &&
        typeof item.summary === "string" &&
        typeof item.filename === "string" &&
        typeof item.createdAt === "number" &&
        typeof item.expiresAt === "number"
      );
    });

    return pruneSessionEntries(entries);
  } catch {
    return [];
  }
};
