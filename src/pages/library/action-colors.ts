export const ACTION_COLORS: Record<string, string> = {
  Waving: "#7F77DD",
  Sitting: "#1D9E75",
  Walking: "#BA7517",
  Standing: "#378ADD",
};

export const ACTION_BG: Record<string, string> = {
  Waving: "#EEEDFE",
  Sitting: "#E1F5EE",
  Walking: "#FAEEDA",
  Standing: "#E6F1FB",
};

export const ACTION_TEXT: Record<string, string> = {
  Waving: "#3C3489",
  Sitting: "#085041",
  Walking: "#633806",
  Standing: "#0C447C",
};

export const FALLBACK_COLORS = [
  "#7F77DD",
  "#1D9E75",
  "#BA7517",
  "#378ADD",
  "#D85A30",
  "#9333EA",
  "#0E7490",
  "#B91C1C",
];

export const getActionColor = (action: string): string =>
  ACTION_COLORS[action] ??
  FALLBACK_COLORS[
    Math.abs([...action].reduce((a, c) => a + c.charCodeAt(0), 0)) %
      FALLBACK_COLORS.length
  ];

export const getActionBg = (action: string): string =>
  ACTION_BG[action] ?? "#F1EFE8";

export const getActionText = (action: string): string =>
  ACTION_TEXT[action] ?? "#2C2C2A";
