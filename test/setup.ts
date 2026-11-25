import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { installCanvasStub } from './fakes';

// jsdom has no canvas: give every canvas a context that records drawing calls.
beforeEach(() => {
  if (typeof HTMLCanvasElement !== 'undefined') installCanvasStub();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
