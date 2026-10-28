import { describe, expect, it } from 'vitest';
import { angleDelta, MAX_SCALE, MIN_SCALE, pinchTwist, snapScale, twoFinger } from '../src/three/gestures';

describe('AR touch gestures', () => {
  const start = twoFinger({ x: 100, y: 300 }, { x: 300, y: 300 });

  it('scales with the finger distance', () => {
    const wider = twoFinger({ x: 50, y: 300 }, { x: 350, y: 300 });
    expect(pinchTwist(start, wider, { scale: 1, yaw: 0 }).scale).toBeCloseTo(1.5, 6);
    const closer = twoFinger({ x: 150, y: 300 }, { x: 250, y: 300 });
    expect(pinchTwist(start, closer, { scale: 1, yaw: 0 }).scale).toBeCloseTo(0.5, 6);
  });

  it('clamps the scale', () => {
    const far = twoFinger({ x: 0, y: 300 }, { x: 5000, y: 300 });
    expect(pinchTwist(start, far, { scale: 1, yaw: 0 }).scale).toBe(MAX_SCALE);
    const near = twoFinger({ x: 199, y: 300 }, { x: 201, y: 300 });
    expect(pinchTwist(start, near, { scale: 1, yaw: 0 }).scale).toBe(MIN_SCALE);
  });

  it('turns clockwise (seen from above) when the fingers twist clockwise on screen', () => {
    // second finger moves down = clockwise on screen (y points down)
    const twisted = twoFinger({ x: 100, y: 300 }, { x: 300, y: 400 });
    const r = pinchTwist(start, twisted, { scale: 1, yaw: 0.5 });
    expect(r.yaw).toBeLessThan(0.5);
    expect(r.scale).toBeGreaterThan(1);
  });

  it('wraps angles across ±180°', () => {
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 6);
    expect(angleDelta(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2, 6);
  });

  it('snaps near 100 %', () => {
    expect(snapScale(1.03)).toBe(1);
    expect(snapScale(0.97)).toBe(1);
    expect(snapScale(1.2)).toBe(1.2);
  });
});
