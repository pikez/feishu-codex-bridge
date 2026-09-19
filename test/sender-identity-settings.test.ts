import { describe, expect, it } from 'vitest';
import { getIncludeSenderIdentity, type AppConfig } from '../src/config/schema';

function cfg(includeSenderIdentity?: boolean): AppConfig {
  return {
    accounts: { app: { id: 'cli_app', secret: 'secret', tenant: 'feishu' } },
    preferences: includeSenderIdentity === undefined ? {} : { includeSenderIdentity },
  };
}

describe('发信人身份上下文偏好', () => {
  it('缺省保持开启，确保已有机器人升级后行为不变', () => {
    expect(getIncludeSenderIdentity(cfg())).toBe(true);
  });

  it('显式关闭时不向 Agent 编织姓名和 open_id', () => {
    expect(getIncludeSenderIdentity(cfg(false))).toBe(false);
    expect(getIncludeSenderIdentity(cfg(true))).toBe(true);
  });
});
