export const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const num = (v: unknown, fallback = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
export const str = (v: unknown) => (typeof v === "string" ? v : "");
export const palette = [
  "#17233e",
  "#ffffff",
  "#ff6b6b",
  "#ffb86b",
  "#ffd84d",
  "#6bdc8b",
  "#18d6c4",
  "#5aa9ff",
  "#a98bff",
  "#f56bd6",
  "#9aa0aa",
  "#704d37",
  "#ead4ad",
  "#275c41",
  "#5b3375",
  "#acddef",
];
export type ViewProps = {
  snapshot: Record<string, unknown>;
  send: (input: unknown) => void;
  id: string;
  accent: string;
  themeProps?: string[];
  gameId?: string;
};
