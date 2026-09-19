import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

/**
 * Resolve a personal assistant workspace without ever falling back to the
 * bridge process directory. The same check is used before registration and
 * before each personal turn so a deleted or unmounted workspace fails closed.
 */
export async function resolvePersonalCwd(value: string | undefined): Promise<string | undefined> {
  if (!value || !isAbsolute(value)) return undefined;
  try {
    const cwd = await realpath(value);
    return (await stat(cwd)).isDirectory() ? cwd : undefined;
  } catch {
    return undefined;
  }
}

/** A bridge-owned binding key; it is deliberately not a Feishu message id. */
export function newPersonalSessionKey(userId: string, conversationId: string = randomUUID()): string {
  return `personal:${userId}:${conversationId}`;
}
