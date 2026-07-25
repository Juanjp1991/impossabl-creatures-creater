import React, { useRef } from "react";
import { createPointDragHandler } from "../editor/useGizmo";
import { evaluateSpine, type SpinePoint } from "../editor/pathWarp";
import type { Point } from "../editor/transform";

/**
 * On-canvas control for the spine bend.
 *
 * Rendered at stage level rather than inside the part group, for two reasons: the artwork
 * would otherwise paint over the handles (parts drawn later cover earlier ones), and handles
 * nested in the part would inherit its flip and stretch — mirror a part and the controls
 * would mirror with it. Instead the group carries only the part's *placement* translation,
 * so coordinates stay in undistorted part-local units.
 *
 * Any number of control points: drag to shape, double-click the guide to add one, alt-click
 * a handle to remove it.
 */

export interface BendHandlesProps {
  stageRef: React.RefObject<SVGSVGElement | null>;
  /** The part's placement translate — no rotation, scale or flip. */
  placement: string;
  /** The part's local view size. */
  width: number;
  height: number;
  axis: "x" | "y";
  points: SpinePoint[];
  selectedIndex: number | null;
  onChange: (points: SpinePoint[]) => void;
  onSelect: (index: number | null) => void;
}

const ACCENT = "#38bdf8";
const TOUCH_HALO = 26;
/** Keeps neighbouring control points from stacking onto the same position. */
const MIN_GAP = 0.02;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const BendHandles: React.FC<BendHandlesProps> = ({
  stageRef,
  placement,
  width,
  height,
  axis,
  points,
  selectedIndex,
  onChange,
  onSelect,
}) => {
  const frameRef = useRef<SVGGElement | null>(null);
  const frame = () => frameRef.current;

  const horizontal = axis === "x";
  const along = horizontal ? width : height;
  /** Rest line sits up where a back is — the bend weights that region most. */
  const rest = (horizontal ? height : width) * 0.18;

  /** Control point -> canvas position, and back. */
  const toCanvas = (point: SpinePoint): Point =>
    horizontal
      ? { x: point.t * along, y: rest - point.offset }
      : { x: rest - point.offset, y: point.t * along };

  const fromCanvas = (position: Point): SpinePoint =>
    horizontal
      ? { t: clamp(position.x / along, 0, 1), offset: rest - position.y }
      : { t: clamp(position.y / along, 0, 1), offset: rest - position.x };

  const ordered = [...points].sort((a, b) => a.t - b.t);

  const dragPoint = (index: number) =>
    createPointDragHandler({
      stageRef,
      frame,
      start: toCanvas(ordered[index]),
      onPreview: (position) => {
        const moved = fromCanvas(position);
        // Stay between the neighbours, so dragging past one cannot reorder the curve
        // underneath the pointer.
        const lower = index > 0 ? ordered[index - 1].t + MIN_GAP : 0;
        const upper = index < ordered.length - 1 ? ordered[index + 1].t - MIN_GAP : 1;
        const next = [...ordered];
        next[index] = { t: clamp(moved.t, Math.min(lower, upper), Math.max(lower, upper)), offset: Math.round(moved.offset) };
        onChange(next);
      },
    });

  const addPointAt = (event: React.MouseEvent<SVGElement>) => {
    const stage = stageRef.current;
    const group = frameRef.current;
    if (!stage || !group) return;
    const matrix = group.getScreenCTM();
    if (!matrix) return;
    const svgPoint = stage.createSVGPoint();
    svgPoint.x = event.clientX;
    svgPoint.y = event.clientY;
    const local = svgPoint.matrixTransform(matrix.inverse());
    const t = clamp((horizontal ? local.x : local.y) / along, 0, 1);
    if (ordered.some((point) => Math.abs(point.t - t) < MIN_GAP)) return;
    // The new point starts on the existing curve, so adding one never changes the shape.
    const next = [...ordered, { t, offset: Math.round(evaluateSpine(ordered, t)) }].sort((a, b) => a.t - b.t);
    onChange(next);
    onSelect(next.findIndex((point) => point.t === t));
  };

  const removePoint = (index: number) => {
    if (ordered.length <= 1) return;
    onChange(ordered.filter((_, i) => i !== index));
    onSelect(null);
  };

  /** Sampled preview of the curve the control points describe. */
  const curve = Array.from({ length: 49 }, (_, i) => {
    const t = i / 48;
    const position = toCanvas({ t, offset: evaluateSpine(ordered, t) });
    return `${position.x.toFixed(1)},${position.y.toFixed(1)}`;
  }).join(" ");

  const guideStart = toCanvas({ t: 0, offset: 0 });
  const guideEnd = toCanvas({ t: 1, offset: 0 });

  return (
    <g ref={frameRef} transform={placement} data-editor-chrome="true" data-testid="bend-handles" style={{ touchAction: "none" }}>
      {/* The rest line doubles as the hit area for adding a point. */}
      <line
        x1={guideStart.x}
        y1={guideStart.y}
        x2={guideEnd.x}
        y2={guideEnd.y}
        stroke={ACCENT}
        strokeWidth="10"
        strokeOpacity="0"
        style={{ cursor: "copy" }}
        onDoubleClick={addPointAt}
      />
      <line x1={guideStart.x} y1={guideStart.y} x2={guideEnd.x} y2={guideEnd.y} stroke={ACCENT} strokeWidth="1" strokeOpacity="0.4" strokeDasharray="3 3" pointerEvents="none" />
      <polyline points={curve} fill="none" stroke={ACCENT} strokeWidth="1.5" strokeOpacity="0.9" pointerEvents="none" />

      {ordered.map((point, index) => {
        const position = toCanvas(point);
        const anchor = toCanvas({ t: point.t, offset: 0 });
        const selected = selectedIndex === index;
        return (
          <g key={`${point.t}-${index}`}>
            <line x1={anchor.x} y1={anchor.y} x2={position.x} y2={position.y} stroke={ACCENT} strokeWidth="1" strokeOpacity="0.5" pointerEvents="none" />
            <g
              style={{ cursor: "grab" }}
              onPointerDown={(event) => {
                // Alt-click removes; anything else selects and starts a drag.
                if (event.altKey) { removePoint(index); return; }
                onSelect(index);
                dragPoint(index)(event);
              }}
            >
              <circle cx={position.x} cy={position.y} r={TOUCH_HALO / 2} fill="transparent" />
              <circle
                cx={position.x}
                cy={position.y}
                r={selected ? 7 : 5}
                fill={selected ? "#f8fafc" : ACCENT}
                stroke="#0f172a"
                strokeWidth="2"
              />
            </g>
          </g>
        );
      })}
    </g>
  );
};
