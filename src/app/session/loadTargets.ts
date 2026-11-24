import { parseConfigText, type ConfigResult } from '../../core/config/load';

export const TARGETS_URL = `${import.meta.env.BASE_URL}config/targets.json`;

/** Fetches the therapist config without caching, so an edited file takes effect on reload (AC 14). */
export async function loadTargets(signal?: AbortSignal): Promise<ConfigResult> {
  let res: Response;
  try {
    res = await fetch(TARGETS_URL, { cache: 'no-store', signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    return { ok: false, problems: [`Could not load config/targets.json (${(e as Error).message})`] };
  }
  if (!res.ok) {
    return { ok: false, problems: [`Could not load config/targets.json (HTTP ${res.status})`] };
  }
  return parseConfigText(await res.text());
}
