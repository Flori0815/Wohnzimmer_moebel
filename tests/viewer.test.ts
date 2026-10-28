import { describe, expect, it } from 'vitest';
import { sceneVisibility } from '../src/three/viewer';

describe('scene visibility per XR mode', () => {
  it('never shows the virtual room or background in AR, whatever the options', () => {
    for (const room of [true, false]) {
      for (const dimensions of [true, false]) {
        const v = sceneVisibility('ar', { room, dimensions });
        expect(v).toEqual({ room: false, background: false, dimensions: false });
      }
    }
  });

  it('follows the options on screen and keeps the room in VR', () => {
    expect(sceneVisibility('none', { room: true, dimensions: true })).toEqual({ room: true, background: true, dimensions: true });
    expect(sceneVisibility('none', { room: false, dimensions: false })).toEqual({ room: false, background: true, dimensions: false });
    expect(sceneVisibility('vr', { room: true, dimensions: true })).toEqual({ room: true, background: true, dimensions: false });
  });
});
