import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CodexAppServerBackend } from '../src/agent/codex-appserver/backend';

// One app-server process emits notifications for its principal thread and for
// a sub-agent thread. Only the principal thread may affect this run.
const FAKE_SERVER = `#!/usr/bin/env node
let buf = '';
const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\\n');
process.stdin.on('data', (d) => {
  buf += d;
  let nl;
  while ((nl = buf.indexOf('\\n')) !== -1) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (typeof msg.id !== 'number') continue;
    if (msg.method === 'turn/start') {
      send({ jsonrpc: '2.0', id: msg.id, result: {} });
      send({ jsonrpc: '2.0', method: 'turn/started', params: { threadId: 'subagent', turn: { id: 'sub-turn' } } });
      send({ jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { threadId: 'subagent', turnId: 'sub-turn', itemId: 'sub-msg', delta: 'subagent reply' } });
      send({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'subagent', turn: { id: 'sub-turn' } } });
      send({ jsonrpc: '2.0', method: 'turn/started', params: { threadId: 'parent', turn: { id: 'parent-turn' } } });
      send({ jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { threadId: 'parent', turnId: 'stale-turn', itemId: 'stale-msg', delta: 'stale reply' } });
      send({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'parent', turn: { id: 'stale-turn' } } });
      send({ jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { threadId: 'parent', turnId: 'parent-turn', itemId: 'parent-msg', delta: 'parent reply' } });
      send({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'parent', turn: { id: 'parent-turn' } } });
      continue;
    }
    if (msg.method === 'thread/goal/set') {
      const objective = msg.params.objective;
      const goal = (status) => ({ objective, status, tokenBudget: null, tokensUsed: 1, timeUsedSeconds: 1 });
      send({ jsonrpc: '2.0', id: msg.id, result: {} });
      send({ jsonrpc: '2.0', method: 'turn/started', params: { threadId: 'subagent', turn: { id: 'sub-goal-turn' } } });
      send({ jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { threadId: 'subagent', turnId: 'sub-goal-turn', itemId: 'sub-goal-msg', delta: 'subagent goal reply' } });
      send({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'subagent', turn: { id: 'sub-goal-turn' } } });
      send({ jsonrpc: '2.0', method: 'turn/started', params: { threadId: 'parent', turn: { id: 'parent-goal-turn' } } });
      send({ jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { threadId: 'parent', turnId: 'parent-goal-turn', itemId: 'parent-goal-msg', delta: 'parent goal reply' } });
      send({ jsonrpc: '2.0', method: 'thread/goal/updated', params: { threadId: 'parent', turnId: 'parent-goal-turn', goal: goal('active') } });
      send({ jsonrpc: '2.0', method: 'thread/goal/updated', params: { threadId: 'parent', turnId: 'parent-goal-turn', goal: goal('complete') } });
      send({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'parent', turn: { id: 'parent-goal-turn' } } });
      continue;
    }
    const result = msg.method === 'thread/start' ? { thread: { id: 'parent' } } : {};
    send({ jsonrpc: '2.0', id: msg.id, result });
  }
});
setInterval(() => {}, 1 << 30);
`;

const dir = mkdtempSync(join(tmpdir(), 'subagent-event-isolation-'));
const bin = join(dir, 'codex');
writeFileSync(bin, FAKE_SERVER, { mode: 0o755 });

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe.skipIf(process.platform === 'win32')('sub-agent event isolation', () => {
  it('does not render or terminate on another thread in the same app-server process', async () => {
    const previousBin = process.env.CODEX_BIN;
    process.env.CODEX_BIN = bin;
    try {
      const thread = await new CodexAppServerBackend().startThread({ cwd: dir });
      const events = [];
      for await (const event of thread.runStreamed({ text: 'go' }).events) events.push(event);
      expect(events).toEqual([
        { type: 'turn_started', turnId: 'parent-turn' },
        { type: 'text_delta', itemId: 'parent-msg', delta: 'parent reply' },
        { type: 'done', turnId: 'parent-turn' },
      ]);
      await thread.close();
    } finally {
      if (previousBin === undefined) delete process.env.CODEX_BIN;
      else process.env.CODEX_BIN = previousBin;
    }
  });

  it('keeps a goal attached to its parent thread while a sub-agent finishes', async () => {
    const previousBin = process.env.CODEX_BIN;
    process.env.CODEX_BIN = bin;
    try {
      const thread = await new CodexAppServerBackend().startThread({ cwd: dir });
      const events = [];
      for await (const event of thread.runGoal('finish parent goal').events) events.push(event);
      expect(events).toEqual([
        { type: 'turn_started', turnId: 'parent-goal-turn' },
        { type: 'text_delta', itemId: 'parent-goal-msg', delta: 'parent goal reply' },
        { type: 'goal_update', status: 'active', objective: 'finish parent goal', tokensUsed: 1, timeUsedSeconds: 1, tokenBudget: null },
        { type: 'goal_update', status: 'complete', objective: 'finish parent goal', tokensUsed: 1, timeUsedSeconds: 1, tokenBudget: null },
        { type: 'done', turnId: 'parent-goal-turn' },
      ]);
      await thread.close();
    } finally {
      if (previousBin === undefined) delete process.env.CODEX_BIN;
      else process.env.CODEX_BIN = previousBin;
    }
  });
});
