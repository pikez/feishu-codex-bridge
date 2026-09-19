import { isIP } from 'node:net';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { paths } from '../config/paths';

/** 始终保留本机入口；显式地址是在此基础上追加的。 */
export const LOOPBACK_WEB_HOST = '127.0.0.1';

interface WebHostsFile {
  version: 1;
  hosts: string[];
}

/**
 * 校验并规范化 Web 的监听地址。
 *
 * 只接受字面 IP，避免把 DNS 解析变化变成新的可访问来源；也拒绝通配地址，使用者必须
 * 明确列出每个内网 / Tailnet 地址。无论是否传入额外地址，127.0.0.1 都会保留。
 */
export function normalizeWebHosts(rawHosts: readonly string[] = []): string[] {
  const hosts = [LOOPBACK_WEB_HOST];
  for (const raw of rawHosts) {
    for (const part of raw.split(',')) {
      const host = part.trim();
      if (!host) continue;
      if (isUnspecifiedAddress(host)) {
        throw new Error(`不允许通配监听地址「${host}」；请明确指定内网或 Tailscale IP。`);
      }
      if (isIP(host) === 0) {
        throw new Error(`无效 IP 地址「${host}」；--host 只接受字面 IPv4 或 IPv6 地址。`);
      }
      if (!hosts.includes(host)) hosts.push(host);
    }
  }
  return hosts;
}

function isUnspecifiedAddress(host: string): boolean {
  return host === '0.0.0.0' || host === '::' || host === '0:0:0:0:0:0:0:0';
}

/** 将 IP 格式化为可访问的 HTTP URL；IPv6 URL 必须加方括号。 */
export function webUrl(host: string, port: number, token: string): string {
  const address = isIP(host) === 6 ? `[${host}]` : host;
  return `http://${address}:${port}/?token=${encodeURIComponent(token)}`;
}

/** 读取已保存的监听地址。损坏/旧格式安全回退到仅本机监听。 */
export async function readWebHosts(file: string = paths.webHostsFile): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<WebHostsFile>;
    if (parsed.version !== 1 || !Array.isArray(parsed.hosts) || !parsed.hosts.every((host) => typeof host === 'string')) {
      return [LOOPBACK_WEB_HOST];
    }
    return normalizeWebHosts(parsed.hosts);
  } catch {
    return [LOOPBACK_WEB_HOST];
  }
}

/** 原子保存显式监听地址；配置文件不含 token，仍用 0600 与其它本地状态保持一致。 */
export async function saveWebHosts(hosts: readonly string[], file: string = paths.webHostsFile): Promise<string[]> {
  const normalized = normalizeWebHosts(hosts);
  const content = `${JSON.stringify({ version: 1, hosts: normalized } satisfies WebHostsFile, null, 2)}\n`;
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(tmp, content, 'utf8');
  await chmod(tmp, 0o600);
  await rename(tmp, file);
  return normalized;
}
