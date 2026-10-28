// Pure touch-gesture maths for AR (unit-tested).

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 3;

export interface Point {
  x: number;
  y: number;
}

export interface TwoFinger {
  dist: number;
  /** Screen angle of the line between the fingers (radians, y down → clockwise positive). */
  angle: number;
}

export function twoFinger(a: Point, b: Point): TwoFinger {
  return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

/** Smallest signed difference between two angles. */
export function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/**
 * Pinch → scale, twist → yaw. Twisting the fingers clockwise on screen turns the
 * furniture clockwise seen from above (negative rotation about +y).
 */
export function pinchTwist(start: TwoFinger, now: TwoFinger, base: { scale: number; yaw: number }): { scale: number; yaw: number } {
  const ratio = start.dist > 1 ? now.dist / start.dist : 1;
  return { scale: clampScale(base.scale * ratio), yaw: base.yaw - angleDelta(start.angle, now.angle) };
}

/** Snap close to 100 % so the real size is easy to get back. */
export function snapScale(s: number): number {
  return Math.abs(s - 1) < 0.04 ? 1 : s;
}
