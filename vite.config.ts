/// <reference types="vitest/config" />
import basicSsl from '@vitejs/plugin-basic-ssl';
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
// `npm run dev:https` (mode "https") serves over a self-signed certificate on the LAN, because
// phones only allow camera access in a secure context.
export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_SHA__: JSON.stringify(gitSha()),
  },
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  server: { host: mode === 'https' ? true : 'localhost' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    environmentOptions: { jsdom: { pretendToBeVisual: true } },
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
}));
