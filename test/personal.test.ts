import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { realpathSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newPersonalSessionKey, resolvePersonalCwd } from '../src/bot/personal';

describe('personal workspace boundary', () => {
  it('accepts only an existing absolute directory and canonicalizes it', async () => {
    const cwd = mkdtempSync(`${tmpdir()}/personal-workspace-`);
    try {
      expect(await resolvePersonalCwd(cwd)).toBe(realpathSync(cwd));
      expect(await resolvePersonalCwd('relative/workspace')).toBeUndefined();
      expect(await resolvePersonalCwd(`${cwd}/missing`)).toBeUndefined();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('makes a user-namespaced opaque binding key', () => {
    expect(newPersonalSessionKey('ou_a', 'id-1')).toBe('personal:ou_a:id-1');
  });
});
