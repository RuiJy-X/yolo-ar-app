import type { HistoryEntry, SessionVideoEntry } from "./types";

const SESSION_MAX_ITEMS = 4;
const HISTORY_MAX_ITEMS = 50;

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

export const stripCacheBust = (url: string) => {
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.delete("t");
    return parsed.toString();
  } catch {
    return url;
  }
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

export const pruneHistoryEntries = (entries: HistoryEntry[]) => {
  return entries
    .filter(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.id === "string",
    )
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, HISTORY_MAX_ITEMS);
};

export const loadHistoryEntries = (storageKey: string): HistoryEntry[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const entries = parsed.filter((item): item is HistoryEntry => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.videoUrl === "string" &&
        typeof item.downloadUrl === "string" &&
        typeof item.summary === "string" &&
        typeof item.filename === "string" &&
        typeof item.createdAt === "number" &&
        typeof (item as HistoryEntry).analysis === "object"
      );
    });

    return pruneHistoryEntries(entries);
  } catch {
    return [];
  }
};

export const persistHistoryEntries = (
  storageKey: string,
  entries: HistoryEntry[],
) => {
  if (typeof window === "undefined") {
    return;
  }

  if (entries.length === 0) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(entries));
};
