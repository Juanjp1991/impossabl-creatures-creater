import React from "react";
import type { GizmoAction, GizmoBounds } from "../editor/transform";
import type { GizmoPointerHandler } from "../editor/useGizmo";

/**
 * On-canvas selection box: drag body to move, 8 handles to scale, stalk handle to rotate.
 *
 * Every node carries `data-editor-chrome` so `sanitizeForSave` can recognise it if this
 * markup ever ends up somewhere it is serialised.
 */

const ACCENT = "#f59e0b";
const BACKDROP = "#18181b";

/**
 * Invisible pointer target around each handle. The visible squares are 8px, well under the
 * ~44px a fingertip needs, so touch drags on the real device missed constantly.
 */
const TOUCH_HALO = 22;

interface HandleSpec {
  action: GizmoAction;
  x: number;
  y: number;
  cursor: string;
}

function scaleHandles(bounds: GizmoBounds): HandleSpec[] {
  const { x, y, width, height } = bounds;
  const midX = x + width / 2;
  const midY = y + height / 2;
  return [
    { action: "scale-nw", x, y, cursor: "nwse-resize" },
    { action: "scale-n", x: midX, y, cursor: "ns-resize" },
    { action: "scale-ne", x: x + width, y, cursor: "nesw-resize" },
    { action: "scale-e", x: x + width, y: midY, cursor: "ew-resize" },
    { action: "scale-se", x: x + width, y: y + height, cursor: "nwse-resize" },
    { action: "scale-s", x: midX, y: y + height, cursor: "ns-resize" },
    { action: "scale-sw", x, y: y + height, cursor: "nesw-resize" },
    { action: "scale-w", x, y: midY, cursor: "ew-resize" },
  ];
}

export interface GizmoOverlayProps {
  bounds: GizmoBounds;
  /** Transform of the element being edited, so the box tracks it. */
  transform?: string;
  onPointerAction: GizmoPointerHandler;
}

export const GizmoOverlay: React.FC<GizmoOverlayProps> = ({
  bounds,
  transform,
  onPointerAction,
}) => {
  const { x, y, width, height } = bounds;
  const midX = x + width / 2;
  const rotateY = y - 28;

  return (
    <g
      transform={transform}
      data-editor-chrome="true"
      data-testid="layer-selection-overlay"
      style={{ touchAction: "none" }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="rgba(245,158,11,.04)"
        stroke={ACCENT}
        strokeWidth="1.5"
        strokeDasharray="4 3"
        style={{ cursor: "move" }}
        onPointerDown={(event) => onPointerAction("move", event)}
      />

      <line x1={midX} y1={y} x2={midX} y2={rotateY + 4} stroke={ACCENT} strokeWidth="1" />
      <g style={{ cursor: "grab" }} onPointerDown={(event) => onPointerAction("rotate", event)}>
        <circle cx={midX} cy={rotateY} r={TOUCH_HALO / 2} fill="transparent" />
        <circle cx={midX} cy={rotateY} r="5" fill={BACKDROP} stroke={ACCENT} strokeWidth="2" />
      </g>

      {scaleHandles(bounds).map((handle) => (
        <g
          key={handle.action}
          style={{ cursor: handle.cursor }}
          onPointerDown={(event) => onPointerAction(handle.action, event)}
        >
          <rect
            x={handle.x - TOUCH_HALO / 2}
            y={handle.y - TOUCH_HALO / 2}
            width={TOUCH_HALO}
            height={TOUCH_HALO}
            fill="transparent"
          />
          <rect
            x={handle.x - 4}
            y={handle.y - 4}
            width="8"
            height="8"
            rx="1"
            fill={ACCENT}
            stroke={BACKDROP}
            strokeWidth="1"
          />
        </g>
      ))}
    </g>
  );
};
