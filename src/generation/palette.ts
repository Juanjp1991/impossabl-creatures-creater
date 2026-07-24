// The single canonical colour ramp every species uses (§5.2). `primary` and `accent`
// are the per-creature palette; the rest are DERIVED from them at render time, identically
// for every species, plus two fixed neutrals. Animals may not declare their own ramp — a
// per-animal ramp just reintroduces arbitrary hexes with extra steps. Making one palette
// shared is what lets a five-species frankenstein read as a single creature.

export const RAMP_TOKENS = ["primary", "accent", "primary-light", "primary-dark", "accent-dark", "outline", "highlight"] as const;
export type RampToken = (typeof RAMP_TOKENS)[number];

// Fixed neutrals — the same near-black outline and off-white highlight for every animal.
export const OUTLINE_HEX = "#1a1a1a";
export const HIGHLIGHT_HEX = "#f5f5f5";

// Longest-first so token replacement never lets "primary" shadow "primary-light".
const TOKENS_LONGEST_FIRST = [...RAMP_TOKENS].sort((a, b) => b.length - a.length);
const RAMP_SET = new Set<string>(RAMP_TOKENS);

interface Rgb { r: number; g: number; b: number; }
const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

export function parseHex(value: string): Rgb | null {
  const six = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (six) return { r: parseInt(six[1].slice(0, 2), 16), g: parseInt(six[1].slice(2, 4), 16), b: parseInt(six[1].slice(4, 6), 16) };
  const three = /^#?([0-9a-f]{3})$/i.exec(value.trim());
  if (three) return { r: parseInt(three[1][0] + three[1][0], 16), g: parseInt(three[1][1] + three[1][1], 16), b: parseInt(three[1][2] + three[1][2], 16) };
  return null;
}
const toHex = ({ r, g, b }: Rgb) => `#${[r, g, b].map((channel) => clamp(channel).toString(16).padStart(2, "0")).join("")}`;
const mixToward = (hex: string, target: number, amount: number) => {
  const rgb = parseHex(hex) ?? { r: 136, g: 136, b: 136 };
  return toHex({ r: rgb.r + (target - rgb.r) * amount, g: rgb.g + (target - rgb.g) * amount, b: rgb.b + (target - rgb.b) * amount });
};
export const lighten = (hex: string, amount = 0.32) => mixToward(hex, 255, amount);
export const darken = (hex: string, amount = 0.32) => mixToward(hex, 0, amount);

// Deterministic near-black / near-white classifiers used by the normalizer to fold the
// model's raw outline/highlight hexes onto the fixed ramp tokens (the outline token IS a
// fixed near-black, so this is resolving to the ramp, not inventing a colour).
export function isNearBlack(hex: string): boolean {
  const rgb = parseHex(hex);
  return rgb ? Math.max(rgb.r, rgb.g, rgb.b) <= 64 : false;
}
export function isNearWhite(hex: string): boolean {
  const rgb = parseHex(hex);
  return rgb ? Math.min(rgb.r, rgb.g, rgb.b) >= 224 : false;
}

/** Resolve the full ramp to concrete hex values from a creature's primary/accent. */
export function resolveRamp(primary: string, accent: string): Record<RampToken, string> {
  return {
    primary, accent,
    "primary-light": lighten(primary), "primary-dark": darken(primary), "accent-dark": darken(accent),
    outline: OUTLINE_HEX, highlight: HIGHLIGHT_HEX,
  };
}

const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * Substitute every ramp token in a part SVG with its resolved hex. Handles the three
 * forms parts use: a quoted attribute value ("primary"), a CSS custom-property reference
 * with or without a baked fallback (var(--primary) / var(--primary,#hex)), and an inline
 * style declaration (fill:primary). Unknown tokens and raw hexes are left untouched.
 */
export function applyRamp(svg: string, ramp: Record<RampToken, string>): string {
  let out = svg;
  for (const token of TOKENS_LONGEST_FIRST) {
    const hex = escapeAttr(ramp[token]);
    out = out
      .replace(new RegExp(`var\\(\\s*--${token}\\s*(?:,[^)]*)?\\)`, "gi"), hex)
      .replace(new RegExp(`(["'])\\s*${token}\\s*\\1`, "gi"), `"${hex}"`)
      .replace(new RegExp(`(\\b(?:fill|stroke|stop-color)\\s*:\\s*)${token}(?=\\s*(?:;|["']|$))`, "gi"), `$1${hex}`);
  }
  return out;
}

/** True when a fill/stroke/stop-color VALUE is a ramp token, a var(--token), or a neutral keyword. */
export function isRampOrNeutralColour(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "" || trimmed === "none" || trimmed === "transparent" || trimmed === "currentcolor") return true;
  if (RAMP_SET.has(trimmed)) return true;
  const variable = /^var\(\s*--([a-z-]+)\s*(?:,.*)?\)$/i.exec(trimmed);
  return Boolean(variable && RAMP_SET.has(variable[1]));
}

/** A concrete colour (hex/rgb/hsl) that is not a ramp reference — i.e. an off-palette raw colour. */
export function isRawColour(value: string): boolean {
  return /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(value) && !isRampOrNeutralColour(value);
}
