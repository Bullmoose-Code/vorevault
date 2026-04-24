export type Point = { x: number; y: number };

export type MarqueeRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/**
 * Build a positive-area rect from two arbitrary corner points.
 * Handles dragging in any direction.
 */
export function buildMarqueeRect(start: Point, current: Point): MarqueeRect {
  return {
    left: Math.min(start.x, current.x),
    top: Math.min(start.y, current.y),
    right: Math.max(start.x, current.x),
    bottom: Math.max(start.y, current.y),
  };
}

/**
 * Standard AABB overlap test. Edge-touching counts as overlap
 * (so a marquee that just barely clips a card still selects it).
 */
export function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}
