import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeWebHosts, readWebHosts, saveWebHosts, webUrl } from '../src/web/hosts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('web hosts', () => {
  it('保留 loopback，并接受多个内网/Tailscale IPv4 与 IPv6 地址', () => {
    expect(normalizeWebHosts(['192.168.10.20', '100.87.23.4,fd7a:115c:a1e0::1234', '192.168.10.20'])).toEqual([
      '127.0.0.1',
      '192.168.10.20',
      '100.87.23.4',
      'fd7a:115c:a1e0::1234',
    ]);
  });

  it.each(['0.0.0.0', '::', '0:0:0:0:0:0:0:0', 'tailnet.example.ts.net', '192.168.1.999'])(
    '拒绝非显式 IP 或通配地址：%s',
    (host) => {
      expect(() => normalizeWebHosts([host])).toThrow();
    },
  );

  it('持久化后可读回，且配置文件权限为仅当前用户可读', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'web-hosts-test-'));
    tempDirs.push(dir);
    const file = join(dir, 'web-hosts.json');

    await saveWebHosts(['192.168.10.20', '100.87.23.4'], file);

    expect(await readWebHosts(file)).toEqual(['127.0.0.1', '192.168.10.20', '100.87.23.4']);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('为 IPv6 生成带方括号的 URL', () => {
    expect(webUrl('fd7a:115c:a1e0::1234', 51847, 'a b')).toBe('http://[fd7a:115c:a1e0::1234]:51847/?token=a%20b');
  });
});
