// AC 2 at the adapter: each getUserMedia failure becomes a typed error with a how-to-fix message.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { openCamera } from './camera';
import { CameraStartError, cameraErrorText, classifyGetUserMediaError, type CameraErrorKind } from './cameraErrors';

function secure(value: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value, configurable: true });
}

afterEach(() => {
  secure(false);
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
});

describe('camera start errors', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'notFound'],
    ['OverconstrainedError', 'notFound'],
    ['NotReadableError', 'inUse'],
    ['NotSupportedError', 'unsupported'],
    ['TypeError', 'other'],
  ])('classifies %s as %s', (name, kind) => {
    expect(classifyGetUserMediaError(new DOMException('x', name))).toBe(kind);
  });

  it('says access was denied and how to allow it', () => {
    const { title, help } = cameraErrorText('denied');
    expect(title).toMatch(/denied/i);
    expect(help).toMatch(/allow/i);
  });

  it.each<CameraErrorKind>(['denied', 'notFound', 'inUse', 'insecure', 'unsupported', 'model', 'other'])('has text for %s', (k) => {
    expect(cameraErrorText(k).help.length).toBeGreaterThan(10);
  });

  it('rejects with "denied" when the user blocks the camera, without loading the model', async () => {
    secure(true);
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('blocked', 'NotAllowedError'));
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    const engine = vi.fn();
    await expect(openCamera(engine)).rejects.toMatchObject({ kind: 'denied' });
    expect(engine).not.toHaveBeenCalled();
  });

  it('refuses an insecure page and a browser without getUserMedia', async () => {
    secure(false);
    await expect(openCamera()).rejects.toBeInstanceOf(CameraStartError);
    await expect(openCamera()).rejects.toMatchObject({ kind: 'insecure' });
    secure(true);
    await expect(openCamera()).rejects.toMatchObject({ kind: 'unsupported' });
  });
});
