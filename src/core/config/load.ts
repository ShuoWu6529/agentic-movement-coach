// Parses and validates the therapist config. Errors name the field path at fault (AC 15),
// and nothing is guessed: any problem means no config.

import type { z } from 'zod';
import { TargetsConfigSchema, type TargetsConfig } from './schema';

export type ConfigResult =
  | { ok: true; config: TargetsConfig }
  | { ok: false; problems: string[] };

function formatIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.map(String).join('.') || '(root)';
  return `${path}: ${issue.message}`;
}

export function parseConfig(value: unknown): ConfigResult {
  const result = TargetsConfigSchema.safeParse(value);
  if (result.success) return { ok: true, config: result.data };
  return { ok: false, problems: result.error.issues.map(formatIssue) };
}

export function parseConfigText(text: string): ConfigResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, problems: [`The file is not valid JSON (${(e as Error).message})`] };
  }
  return parseConfig(value);
}
