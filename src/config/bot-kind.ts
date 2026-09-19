/** The bridge's local behavior profile. This is deliberately independent from
 * Feishu's app archetype, which the SDK currently creates as PersonalAgent. */
export type BotKind = 'personal' | 'project';

export const DEFAULT_BOT_KIND: BotKind = 'project';

/** Missing/unknown persisted values must preserve the historical project bot. */
export function normalizeBotKind(value: unknown): BotKind {
  return value === 'personal' ? 'personal' : DEFAULT_BOT_KIND;
}

export function botKindLabel(kind: BotKind): string {
  return kind === 'personal' ? '个人助理' : '项目协作';
}
