import { describe, expect, it, vi } from 'vitest';
import { safeEmit } from '../../../src/utils/safeEmit.js';

describe('safeEmit', () => {
  it('发射成功时返回 true', () => {
    const emit = vi.fn();
    const result = safeEmit({ emit }, 'presence:nearby', { players: [] });

    expect(result).toBe(true);
    expect(emit).toHaveBeenCalledWith('presence:nearby', { players: [] });
  });

  it('发射失败时返回 false 并调用错误回调', () => {
    const emit = vi.fn(() => {
      throw new Error('boom');
    });
    const onError = vi.fn();

    const result = safeEmit({ emit }, 'presence:nearby', { players: [] }, { onError });

    expect(result).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});