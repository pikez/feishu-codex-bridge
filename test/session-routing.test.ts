import { describe, expect, it } from 'vitest';
import { routePersonalSession } from '../src/bot/session-routing';

describe('personal session routing', () => {
  it('keeps the owner full-access and gives an allowlisted collaborator an isolated write/no-network route', () => {
    const owner = routePersonalSession({ userId: 'ou_owner', ownerId: 'ou_owner', cwd: '/workspace' });
    const guest = routePersonalSession({ userId: 'ou_guest', ownerId: 'ou_owner', cwd: '/workspace' });

    expect(owner).toMatchObject({ mode: 'full', cwd: '/workspace', userId: 'ou_owner', isNew: true });
    expect(owner.network).toBeUndefined();
    expect(guest).toMatchObject({ mode: 'write', network: false, cwd: '/workspace', userId: 'ou_guest', isNew: true });
    expect(owner.sessionKey).not.toBe(guest.sessionKey);
  });

  it('uses only the caller-owned active binding when continuing a conversation', () => {
    const route = routePersonalSession({
      userId: 'ou_guest',
      ownerId: 'ou_owner',
      cwd: '/workspace',
      activeSessionKey: 'personal:ou_guest:existing',
    });
    expect(route).toMatchObject({ sessionKey: 'personal:ou_guest:existing', isNew: false, mode: 'write', network: false });
  });
});
