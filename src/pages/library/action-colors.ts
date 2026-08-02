export const ACTION_COLORS: Record<string, string> = {
  Waving: "#7F77DD",
  Sitting: "#1D9E75",
  Walking: "#F59E0B",
  Standing: "#378ADD",
  waving: "#7F77DD",
  sitting: "#1D9E75",
  walking: "#F59E0B",
  standing: "#378ADD",
};

export const ACTION_BG: Record<string, string> = {
  Waving: "#EEEDFE",
  Sitting: "#E1F5EE",
  Walking: "#FEF3C7",
  Standing: "#E6F1FB",
  waving: "#EEEDFE",
  sitting: "#E1F5EE",
  walking: "#FEF3C7",
  standing: "#E6F1FB",
};

export const ACTION_TEXT: Record<string, string> = {
  Waving: "#3C3489",
  Sitting: "#085041",
  Walking: "#78350F",
  Standing: "#0C447C",
  waving: "#3C3489",
  sitting: "#085041",
  walking: "#78350F",
  standing: "#0C447C",
};

export const FALLBACK_COLORS = [
  "#B91C1C",
  "#7F77DD",
  "#1D9E75",
  "#F59E0B",
  "#378ADD",
  "#D85A30",
  "#9333EA",
  "#0E7490",
];

export const getActionColor = (action: string): string => {
  if (!action) return "#94A3B8";
  const exact = ACTION_COLORS[action];
  if (exact) return exact;
  const normalized =
    action.charAt(0).toUpperCase() + action.slice(1).toLowerCase();
  return (
    ACTION_COLORS[normalized] ??
    FALLBACK_COLORS[
      Math.abs([...action].reduce((a, c) => a + c.charCodeAt(0), 0)) %
        FALLBACK_COLORS.length
    ]
  );
};

export const getActionBg = (action: string): string => {
  if (!action) return "#F1EFE8";
  const exact = ACTION_BG[action];
  if (exact) return exact;
  const normalized =
    action.charAt(0).toUpperCase() + action.slice(1).toLowerCase();
  return ACTION_BG[normalized] ?? "#F1EFE8";
};

export const getActionText = (action: string): string => {
  if (!action) return "#2C2C2A";
  const exact = ACTION_TEXT[action];
  if (exact) return exact;
  const normalized =
    action.charAt(0).toUpperCase() + action.slice(1).toLowerCase();
  return ACTION_TEXT[normalized] ?? "#2C2C2A";
};
