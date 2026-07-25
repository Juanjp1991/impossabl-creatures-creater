/**
 * Spine deformation: arching a back, sinking a saddle, raising a hump.
 *
 * Written rather than pulled from `warpjs` because that library deforms by resampling paths
 * into dense point clouds. A bent torso would gain hundreds of nodes, blowing the per-part
 * element budget (`DENSITY_BANDS` in `src/generation/metrics.ts`) and turning readable path
 * data into noise. Here the existing control points are displaced instead, so the command
 * count is identical before and after and the diff stays legible.
 *
 * Pure: no DOM, no React, so it is unit-testable under `node --test`.
 */

export interface PathCommand {
  /** Always an absolute command; relative input is converted on parse. */
  code: string;
  values: number[];
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One control point on the spine: a position along it, and how far the back lifts there. */
export interface SpinePoint {
  /** Position along the spine, 0 (start) to 1 (end). */
  t: number;
  /** Displacement in user units, positive meaning *up on screen*. */
  offset: number;
}

export interface BendOptions {
  /**
   * Control points defining the spine curve. Two or more give shapes a single bump cannot
   * express — an S-curve, a camel's two humps, a dip before a rise.
   *
   * When omitted, `amount`/`center`/`spread` describe a single symmetric bump instead.
   */
  points?: SpinePoint[];
  /**
   * Peak displacement in user units, positive meaning *up on screen* — a hump or arched
   * back. Negative sinks a saddle. Note this is the opposite sign to the raw SVG y axis,
   * which grows downward; the flip happens here so callers and UI labels can talk about
   * humps and saddles rather than about coordinate direction.
   */
  amount?: number;
  /** Where the peak sits along the spine, 0 (start) to 1 (end). */
  center?: number;
  /**
   * Fraction of the span the bend touches. 1 arches the whole back; smaller values give a
   * localised hump — a camel or bison shoulder — leaving the rest of the outline alone.
   */
  spread?: number;
  /** Axis the spine runs along. */
  axis?: "x" | "y";
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The single-bump form expressed as control points, so one code path serves both. */
export function bumpPoints(amount: number, center = 0.5, spread = 1): SpinePoint[] {
  const half = Math.max(spread, 1e-6) / 2;
  return [
    { t: clamp01(center - half), offset: 0 },
    { t: clamp01(center), offset: amount },
    { t: clamp01(center + half), offset: 0 },
  ];
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson).
 *
 * Deliberately not Catmull-Rom: that overshoots between control points, so the back would
 * bulge past the handle you just dragged and feel like it is fighting you. Monotone
 * interpolation stays within the values you set.
 *
 * Outside the control range the end offsets are held, so points left at zero keep the rest
 * of the outline untouched — that is what makes a localised hump local.
 */
export function evaluateSpine(points: SpinePoint[], t: number): number {
  if (!points.length) return 0;
  const sorted = [...points].sort((a, b) => a.t - b.t);
  if (sorted.length === 1) return sorted[0].offset;
  if (t <= sorted[0].t) return sorted[0].offset;
  if (t >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].offset;

  const n = sorted.length;
  const h: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const step = sorted[i + 1].t - sorted[i].t;
    h.push(step);
    delta.push(step > 1e-9 ? (sorted[i + 1].offset - sorted[i].offset) / step : 0);
  }

  const m: number[] = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = (delta[i - 1] + delta[i]) / 2;

  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(delta[i]) < 1e-12) { m[i] = 0; m[i + 1] = 0; continue; }
    const alpha = m[i] / delta[i];
    const beta = m[i + 1] / delta[i];
    const magnitude = alpha * alpha + beta * beta;
    if (magnitude > 9) {
      const tau = 3 / Math.sqrt(magnitude);
      m[i] = tau * alpha * delta[i];
      m[i + 1] = tau * beta * delta[i];
    }
  }

  let index = 0;
  while (index < n - 2 && t > sorted[index + 1].t) index++;
  const step = h[index];
  const local = (t - sorted[index].t) / step;
  const l2 = local * local;
  const l3 = l2 * local;
  return (
    (2 * l3 - 3 * l2 + 1) * sorted[index].offset +
    (l3 - 2 * l2 + local) * step * m[index] +
    (-2 * l3 + 3 * l2) * sorted[index + 1].offset +
    (l3 - l2) * step * m[index + 1]
  );
}

/** The control points a set of options describes, whichever form it uses. */
export const spinePointsOf = (options: BendOptions): SpinePoint[] =>
  options.points?.length ? options.points : bumpPoints(options.amount ?? 0, options.center, options.spread);

/** True when the options would not move a single point. */
export const hasBend = (options: BendOptions): boolean =>
  spinePointsOf(options).some((point) => Math.abs(point.offset) > 1e-9);

/** Coordinate pairs per command; arcs are special-cased because only the endpoint is a point. */
const ARITY: Record<string, number> = {
  M: 2, L: 2, T: 2, C: 6, S: 4, Q: 4, A: 7, H: 1, V: 1, Z: 0,
};

const isFinitePair = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b);

/**
 * Parse a `d` attribute into absolute commands.
 *
 * H and V become L: a horizontal lineto carries no y of its own, so once the previous point
 * is displaced vertically the segment would otherwise snap back to a stale y.
 */
export function parsePathData(d: string): PathCommand[] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!tokens) return [];

  const commands: PathCommand[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let startX = 0;
  let startY = 0;
  let index = 0;
  let previous = "M";

  while (index < tokens.length) {
    let token = tokens[index];
    let code: string;
    if (/[a-z]/i.test(token)) {
      code = token;
      index += 1;
    } else {
      // An omitted command repeats the previous one; a repeated M continues as L.
      code = previous === "M" ? "L" : previous === "m" ? "l" : previous;
    }

    const upper = code.toUpperCase();
    const relative = code !== upper;
    const arity = ARITY[upper] ?? 0;
    previous = code;

    if (upper === "Z") {
      commands.push({ code: "Z", values: [] });
      cursorX = startX;
      cursorY = startY;
      continue;
    }

    const raw = tokens.slice(index, index + arity).map(Number);
    if (raw.length < arity || raw.some((value) => !Number.isFinite(value))) break;
    index += arity;

    if (upper === "H") {
      const x = relative ? cursorX + raw[0] : raw[0];
      commands.push({ code: "L", values: [x, cursorY] });
      cursorX = x;
      continue;
    }
    if (upper === "V") {
      const y = relative ? cursorY + raw[0] : raw[0];
      commands.push({ code: "L", values: [cursorX, y] });
      cursorY = y;
      continue;
    }

    let values: number[];
    if (upper === "A") {
      // rx ry rotation large-arc sweep x y — only the final pair is a coordinate.
      const endX = relative ? cursorX + raw[5] : raw[5];
      const endY = relative ? cursorY + raw[6] : raw[6];
      values = [raw[0], raw[1], raw[2], raw[3], raw[4], endX, endY];
    } else {
      values = raw.map((value, position) =>
        relative ? value + (position % 2 === 0 ? cursorX : cursorY) : value,
      );
    }

    commands.push({ code: upper, values });
    cursorX = values[values.length - 2];
    cursorY = values[values.length - 1];
    if (upper === "M") {
      startX = cursorX;
      startY = cursorY;
    }
  }

  return commands;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

export function serializePathData(commands: PathCommand[]): string {
  return commands
    .map(({ code, values }) => (values.length ? `${code}${values.map(round).join(" ")}` : code))
    .join(" ")
    .trim();
}

/**
 * Raised-cosine bump, 1 at the centre and easing to 0 at the edges of its span.
 *
 * Smooth at the boundary in both value and slope, so a localised hump blends into the
 * untouched outline instead of meeting it at a visible crease.
 */
export function spineFalloff(t: number, center: number, spread: number): number {
  const halfWidth = Math.max(spread, 1e-6) / 2;
  const u = (t - center) / halfWidth;
  if (u <= -1 || u >= 1) return 0;
  return 0.5 * (1 + Math.cos(Math.PI * u));
}

/**
 * Displacement for one point.
 *
 * Weighted so the far side of the part barely moves: raising a back should lift the spine
 * and leave the belly and feet planted, otherwise the whole silhouette floats and the legs
 * detach from the ground line.
 */
export function spineDisplacement(point: { x: number; y: number }, bounds: Bounds, options: BendOptions): number {
  const axis = options.axis ?? "x";
  const along = axis === "x" ? bounds.width : bounds.height;
  const across = axis === "x" ? bounds.height : bounds.width;
  if (along <= 0 || across <= 0) return 0;

  const t = axis === "x" ? (point.x - bounds.x) / along : (point.y - bounds.y) / across;
  const acrossRatio = axis === "x" ? (point.y - bounds.y) / across : (point.x - bounds.x) / along;

  const lift = evaluateSpine(spinePointsOf(options), t);
  // 1 at the top edge, 0 at the bottom edge.
  const weight = 1 - Math.min(Math.max(acrossRatio, 0), 1);
  // Negated: both SVG axes grow away from the top-left, so raising a back means decreasing
  // the coordinate. See the sign convention on BendOptions.amount.
  // `|| 0` collapses negative zero, which would otherwise serialise as "-0" in path data.
  return -lift * weight || 0;
}

/** Bend a `d` string. Command count is unchanged — only coordinates move. */
export function bendPathData(d: string, bounds: Bounds, options: BendOptions): string {
  const commands = parsePathData(d);
  if (!commands.length) return d;
  const axis = options.axis ?? "x";

  const bent = commands.map(({ code, values }) => {
    if (!values.length) return { code, values };
    // Arc flags and radii are not coordinates; only the trailing endpoint is displaced.
    const firstPointIndex = code === "A" ? 5 : 0;
    const next = [...values];
    for (let i = firstPointIndex; i + 1 < next.length; i += 2) {
      const x = next[i];
      const y = next[i + 1];
      if (!isFinitePair(x, y)) continue;
      const shift = spineDisplacement({ x, y }, bounds, options);
      if (axis === "x") next[i + 1] = y + shift;
      else next[i] = x + shift;
    }
    return { code, values: next };
  });

  return serializePathData(bent);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Flatten a `d` string into a polygon outline.
 *
 * Curves are sampled rather than solved: the result feeds point-in-polygon tests for pattern
 * placement, where a few units of error is invisible, and sampling keeps this to a few lines
 * instead of a full curve/line intersection routine. Arcs are approximated by their chord,
 * which the generated parts barely use.
 */
export function flattenPathToPolygon(d: string, samplesPerCurve = 8): { x: number; y: number }[] {
  const commands = parsePathData(d);
  const points: { x: number; y: number }[] = [];
  let cursor = { x: 0, y: 0 };

  for (const { code, values } of commands) {
    if (code === "Z") continue;
    if (code === "M" || code === "L") {
      cursor = { x: values[0], y: values[1] };
      points.push(cursor);
      continue;
    }
    if (code === "C" || code === "S" || code === "Q" || code === "T") {
      const start = cursor;
      const end = { x: values[values.length - 2], y: values[values.length - 1] };
      // Sample the control polygon rather than the exact curve: close enough for an
      // inside/outside test, and independent of which curve variant produced it.
      const controls = [start, ...Array.from({ length: (values.length - 2) / 2 }, (_, i) => ({ x: values[i * 2], y: values[i * 2 + 1] })), end];
      for (let s = 1; s <= samplesPerCurve; s++) {
        const t = s / samplesPerCurve;
        const index = Math.min(controls.length - 2, Math.floor(t * (controls.length - 1)));
        const local = t * (controls.length - 1) - index;
        points.push({
          x: lerp(controls[index].x, controls[index + 1].x, local),
          y: lerp(controls[index].y, controls[index + 1].y, local),
        });
      }
      cursor = end;
      continue;
    }
    if (code === "A") {
      cursor = { x: values[5], y: values[6] };
      points.push(cursor);
    }
  }

  return points;
}

/** Displace a single point, for shapes that are not paths (circle centres, rect corners). */
export function bendPoint(
  point: { x: number; y: number },
  bounds: Bounds,
  options: BendOptions,
): { x: number; y: number } {
  const shift = spineDisplacement(point, bounds, options);
  return (options.axis ?? "x") === "x"
    ? { x: point.x, y: point.y + shift }
    : { x: point.x + shift, y: point.y };
}
