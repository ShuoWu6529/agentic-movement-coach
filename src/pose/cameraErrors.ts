// Camera start errors (AC 2). Each kind says what happened and how to fix it; none offers a way to
// start a set.

export type CameraErrorKind = 'denied' | 'notFound' | 'inUse' | 'insecure' | 'unsupported' | 'model' | 'other';

export class CameraStartError extends Error {
  constructor(
    readonly kind: CameraErrorKind,
    readonly detail?: string,
  ) {
    super(`camera start failed: ${kind}${detail ? ` (${detail})` : ''}`);
  }
}

export function classifyGetUserMediaError(e: unknown): CameraErrorKind {
  const name = e instanceof Error || (typeof e === 'object' && e !== null && 'name' in e) ? String((e as { name: unknown }).name) : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'notFound';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'inUse';
    case 'NotSupportedError':
      return 'unsupported';
    default:
      return 'other';
  }
}

export function cameraErrorText(kind: CameraErrorKind): { title: string; help: string } {
  switch (kind) {
    case 'denied':
      return {
        title: 'Camera access was denied.',
        help:
          'To allow it, click the camera or lock icon in the address bar, set Camera to Allow, then press Try again. ' +
          'On an iPhone or iPad, open Settings → Safari → Camera and choose Allow, then reload this page.',
      };
    case 'notFound':
      return { title: 'No camera was found.', help: 'Connect a camera or check that it is turned on, then press Try again.' };
    case 'inUse':
      return {
        title: 'The camera could not start.',
        help: 'Another app or tab may be using it. Close them, then press Try again.',
      };
    case 'insecure':
      return {
        title: 'Camera access needs a secure page.',
        help: 'Open the app from an https:// address or from localhost.',
      };
    case 'unsupported':
      return { title: "This browser can't open the camera.", help: 'Try a recent version of Chrome, Edge, Firefox or Safari.' };
    case 'model':
      return {
        title: 'The pose model could not load.',
        help: 'Reload the page and try again. If it keeps happening, this device may not be supported yet.',
      };
    case 'other':
      return { title: 'The camera could not start.', help: 'Check your camera, then press Try again.' };
  }
}
