import React from "react";
import { anchorBounds, resolveAnchorDrag, type AnchorPart } from "../editor/anchors";
import { createPointDragHandler } from "../editor/useGizmo";
import type { Point } from "../editor/transform";

/**
 * The body's four attachment sockets, draggable directly on the canvas.
 *
 * Each drag is clamped to the socket's legal range and to the left-facing rule before it is
 * committed, so the number inputs in the sidebar and the canvas can never disagree and
 * neither can produce a draft the validator would reject.
 */

export const ANCHOR_COLORS: Record<AnchorPart, string> = {
  neck: "#ec4899",
  tail: "#3b82f6",
  frontLegs: "#eab308",
  backLegs: "#10b981",
};

const ANCHOR_LABELS: Record<AnchorPart, string> = {
  neck: "neck",
  tail: "tail",
  frontLegs: "front",
  backLegs: "rear",
};

/** Fingertips need far more than the 5px dot; the halo is invisible but grabbable. */
const TOUCH_HALO = 24;

export interface AnchorHandlesProps {
  stageRef: React.RefObject<SVGSVGElement | null>;
  /** Body-local anchor positions, as stored on the animal. */
  anchors: Record<AnchorPart, Point>;
  /** Body-local origin in stage coordinates, for converting a drag back to body space. */
  bodyOrigin: Point;
  onChange: (part: AnchorPart, point: Point) => void;
  /** Socket currently being dragged, if any — drives the range hint. */
  activePart: AnchorPart | null;
  onActivePartChange: (part: AnchorPart | null) => void;
}

export const AnchorHandles: React.FC<AnchorHandlesProps> = ({
  stageRef,
  anchors,
  bodyOrigin,
  onChange,
  activePart,
  onActivePartChange,
}) => {
  const toStage = (point: Point): Point => ({
    x: bodyOrigin.x + point.x,
    y: bodyOrigin.y + point.y,
  });

  const handleFor = (part: AnchorPart) =>
    createPointDragHandler({
      stageRef,
      start: toStage(anchors[part]),
      resolve: (stagePoint) =>
        toStage(
          resolveAnchorDrag(
            part,
            { x: stagePoint.x - bodyOrigin.x, y: stagePoint.y - bodyOrigin.y },
            anchors,
          ),
        ),
      onPreview: (stagePoint) =>
        onChange(part, { x: stagePoint.x - bodyOrigin.x, y: stagePoint.y - bodyOrigin.y }),
      onCommit: () => onActivePartChange(null),
    });

  return (
    <g data-editor-chrome="true" data-testid="anchor-handles" style={{ touchAction: "none" }}>
      {/* Legal range for the socket being dragged, so the clamp is visible rather than
          just felt as the handle refusing to follow the pointer. */}
      {activePart && (() => {
        const bounds = anchorBounds(activePart);
        return (
          <rect
            x={bodyOrigin.x + bounds.minX}
            y={bodyOrigin.y + bounds.minY}
            width={bounds.maxX - bounds.minX}
            height={bounds.maxY - bounds.minY}
            fill={ANCHOR_COLORS[activePart]}
            fillOpacity="0.07"
            stroke={ANCHOR_COLORS[activePart]}
            strokeOpacity="0.5"
            strokeWidth="1"
            strokeDasharray="3 3"
            pointerEvents="none"
          />
        );
      })()}

      {(Object.keys(anchors) as AnchorPart[]).map((part) => {
        const position = toStage(anchors[part]);
        const color = ANCHOR_COLORS[part];
        const isActive = activePart === part;
        return (
          <g
            key={part}
            style={{ cursor: "grab" }}
            onPointerDown={(event) => {
              onActivePartChange(part);
              handleFor(part)(event);
            }}
          >
            <circle cx={position.x} cy={position.y} r={TOUCH_HALO / 2} fill="transparent" />
            <circle
              cx={position.x}
              cy={position.y}
              r={isActive ? 7 : 5}
              fill={color}
              stroke="#18181b"
              strokeWidth="1.5"
            />
            <text
              x={position.x + 9}
              y={position.y - 6}
              fill={color}
              pointerEvents="none"
              className="text-[9px] font-mono font-bold select-none"
            >
              {ANCHOR_LABELS[part]}
            </text>
          </g>
        );
      })}
    </g>
  );
};
