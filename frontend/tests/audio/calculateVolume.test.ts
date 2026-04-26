import { describe, expect, it } from 'vitest';

import { calculateVolume } from '../../src/audio/calculateVolume';

describe('calculateVolume', () => {
  it('距离为 0 时截断到最大值 1.0', () => {
    expect(calculateVolume(0, 2)).toBe(1.0);
  });

  it('距离小于 referenceDistance 时截断到最大值 1.0', () => {
    expect(calculateVolume(1, 2)).toBe(1.0);
  });

  it('距离等于 referenceDistance 时音量为 1.0', () => {
    expect(calculateVolume(2, 2)).toBe(1.0);
  });

  it('距离为 referenceDistance 的 2 倍时音量为 0.5', () => {
    expect(calculateVolume(4, 2)).toBe(0.5);
  });

  it('距离为 referenceDistance 的 4 倍时音量为 0.25', () => {
    expect(calculateVolume(8, 2)).toBe(0.25);
  });

  it('距离为 referenceDistance 的 8 倍时音量为 0.125', () => {
    expect(calculateVolume(16, 2)).toBe(0.125);
  });

  it('使用默认 referenceDistance=2 时行为正确', () => {
    expect(calculateVolume(4)).toBe(0.5);
    expect(calculateVolume(1)).toBe(1.0);
    expect(calculateVolume(16)).toBe(0.125);
  });

  it('自定义 referenceDistance=3 时行为正确', () => {
    expect(calculateVolume(3, 3)).toBe(1.0);
    expect(calculateVolume(6, 3)).toBe(0.5);
    expect(calculateVolume(1, 3)).toBe(1.0);
  });
});
