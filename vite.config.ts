/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Every session log records the app version and git commit (PLANS.md §5, §7). A build from a tree
// with uncommitted changes to tracked files is marked "-dirty", so it can't pass for a clean commit.
function gitSha(): string {
  try {
    const sha = execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    let dirty = false;
    try {
      execSync('git diff --quiet HEAD --', { stdio: 'ignore' });
    } catch {
      dirty = true;
    }
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return 'unknown';
  }
}
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// `base: './'` keeps every asset URL relative, so the build works from any static host or subpath (O-12).
// The dev server stays on localhost: v1 is webcam only (SPEC C-1), and localhost is a secure context for the camera.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_SHA__: JSON.stringify(gitSha()),
  },
  plugins: [react()],
  server: { host: 'localhost' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    environmentOptions: { jsdom: { pretendToBeVisual: true } },
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
