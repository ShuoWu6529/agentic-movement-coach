import { parseConfigText, type ConfigResult } from '../../core/config/load';

export const TARGETS_URL = `${import.meta.env.BASE_URL}config/targets.json`;

const problem = (detail: string): ConfigResult => ({
  ok: false,
  problems: [`Could not load config/targets.json (${detail})`],
});

/**
 * Fetches the therapist config without caching, so an edited file takes effect on reload (AC 14).
 * Resolves with a problem for every failure except an abort, which rejects (AC 15: fail closed, say why).
 */
export async function loadTargets(signal?: AbortSignal): Promise<ConfigResult> {
  let res: Response;
  try {
    res = await fetch(TARGETS_URL, { cache: 'no-store', signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    return problem((e as Error).message);
  }
  if (!res.ok) return problem(`HTTP ${res.status}`);

  // Dev servers and SPA hosts answer a missing file with the app's index.html and HTTP 200.
  if (res.headers.get('content-type')?.includes('text/html')) {
    return problem('the server sent a web page instead, so the file is probably missing');
  }

  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    if (signal?.aborted) throw e;
    return problem((e as Error).message);
  }
  return parseConfigText(text);
}
