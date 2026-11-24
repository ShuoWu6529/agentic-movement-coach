// Downloads the pinned MediaPipe pose models into public/models/ and copies the wasm runtime
// from the npm package into public/wasm/, so the app makes no third-party requests at runtime (C-2).
// Idempotent: a model that is already present with the pinned sha256 is not downloaded again.
// A checksum mismatch fails the script, so an upstream model change can't slip in silently.

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const BASE = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker';

// These pinned sha256 sums are the source of truth. They were first recorded by the M0.5 spike,
// which is not committed. Re-pin only after reviewing an upstream model change (AGENTS.md).
const MODELS = [
  {
    file: 'pose_landmarker_full.task',
    url: `${BASE}/pose_landmarker_full/float16/latest/pose_landmarker_full.task`,
    sha256: '4eaa5eb7a98365221087693fcc286334cf0858e2eb6e15b506aa4a7ecdcec4ad',
  },
  {
    file: 'pose_landmarker_lite.task',
    url: `${BASE}/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`,
    sha256: '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
  },
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function readIfPresent(path) {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

await rm(join(pub, 'wasm'), { recursive: true, force: true });
await cp(join(root, 'node_modules/@mediapipe/tasks-vision/wasm'), join(pub, 'wasm'), { recursive: true });
console.log('fetch-models: wasm copied to public/wasm');

await mkdir(join(pub, 'models'), { recursive: true });
for (const m of MODELS) {
  const path = join(pub, 'models', m.file);
  const existing = await readIfPresent(path);
  if (existing && sha256(existing) === m.sha256) {
    console.log(`fetch-models: ${m.file} ok (cached)`);
    continue;
  }
  console.log(`fetch-models: downloading ${m.file}`);
  const res = await fetch(m.url);
  if (!res.ok) throw new Error(`${m.url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== m.sha256) {
    throw new Error(`${m.file}: sha256 ${got} does not match pinned ${m.sha256}. Upstream model changed; review before re-pinning.`);
  }
  await writeFile(path, buf);
  console.log(`fetch-models: ${m.file} ok (${(buf.length / 1e6).toFixed(1)} MB)`);
}
