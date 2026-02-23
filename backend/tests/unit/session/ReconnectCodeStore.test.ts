import { describe, expect, it } from 'vitest';
import { ReconnectCodeStore } from '../../../src/domain/session/ReconnectCodeStore.js';

describe('ReconnectCodeStore', () => {
  it('校验成功后会消费验证码', () => {
    const store = new ReconnectCodeStore();
    store.setCode({ playerName: 'Alex', code: '123456', expiresAt: 2000 });

    expect(store.consumeCode({ playerName: 'Alex', code: '123456', now: 1500 })).toBe(true);
    expect(store.consumeCode({ playerName: 'Alex', code: '123456', now: 1500 })).toBe(false);
  });

  it('过期验证码返回 false 并清理', () => {
    const store = new ReconnectCodeStore();
    store.setCode({ playerName: 'Alex', code: '123456', expiresAt: 1000 });

    expect(store.consumeCode({ playerName: 'Alex', code: '123456', now: 1001 })).toBe(false);
    expect(store.getCode('Alex')).toBeNull();
  });
});