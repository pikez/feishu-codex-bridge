import type { PermissionMode } from '../agent/types';
import { newPersonalSessionKey } from './personal';

/** The execution-facing result of a private personal-chat route. Keeping this
 * independent of Feishu/card code makes the privacy boundary explicit. */
export interface PersonalSessionRoute {
  sessionKey: string;
  cwd: string;
  mode: PermissionMode;
  network?: boolean;
  userId: string;
  isNew: boolean;
}

/**
 * Owner conversations receive full local access. Every other allowlisted user
 * gets a distinct binding, write-only sandbox and an explicit network deny.
 */
export function routePersonalSession(input: {
  userId: string;
  ownerId?: string;
  cwd: string;
  activeSessionKey?: string;
}): PersonalSessionRoute {
  const owner = input.userId === input.ownerId;
  return {
    sessionKey: input.activeSessionKey ?? newPersonalSessionKey(input.userId),
    cwd: input.cwd,
    mode: owner ? 'full' : 'write',
    ...(owner ? {} : { network: false }),
    userId: input.userId,
    isNew: !input.activeSessionKey,
  };
}
