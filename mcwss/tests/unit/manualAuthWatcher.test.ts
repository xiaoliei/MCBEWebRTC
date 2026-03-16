import { describe, expect, it, vi } from 'vitest';
import { createManualAuthWatcher } from '../../src/services/command/manualAuthWatcher.js';

describe('manualAuthWatcher', () => {
  it('watch:start 后只匹配指定 playerName + challenge', () => {
    const onMatched = vi.fn();
    const watcher = createManualAuthWatcher({ onMatched });

    watcher.startWatch({ playerName: 'Steve', challenge: '#123456' });

    watcher.handlePlayerMessage({ playerName: 'Alex', message: '#123456' });
    watcher.handlePlayerMessage({ playerName: 'Steve', message: '#654321' });
    watcher.handlePlayerMessage({ playerName: 'Steve', message: '#123456' });

    expect(onMatched).toHaveBeenCalledTimes(1);
    expect(onMatched).toHaveBeenCalledWith({ playerName: 'Steve', challenge: '#123456' });
  });

  it('watch:stop 后停止匹配', () => {
    const onMatched = vi.fn();
    const watcher = createManualAuthWatcher({ onMatched });

    watcher.startWatch({ playerName: 'Steve', challenge: '#123456' });
    watcher.stopWatch('Steve');
    watcher.handlePlayerMessage({ playerName: 'Steve', message: '#123456' });

    expect(onMatched).not.toHaveBeenCalled();
  });

  it('同玩家新 watch 覆盖旧 watch 条件', () => {
    const onMatched = vi.fn();
    const watcher = createManualAuthWatcher({ onMatched });

    watcher.startWatch({ playerName: 'Steve', challenge: '#111111' });
    watcher.startWatch({ playerName: 'Steve', challenge: '#222222' });

    watcher.handlePlayerMessage({ playerName: 'Steve', message: '#111111' });
    watcher.handlePlayerMessage({ playerName: 'Steve', message: '#222222' });

    expect(onMatched).toHaveBeenCalledTimes(1);
    expect(onMatched).toHaveBeenCalledWith({ playerName: 'Steve', challenge: '#222222' });
  });

  it('使用 challenge 字段精确匹配 backend 下发的 challenge', () => {
    const onMatched = vi.fn();
    const watcher = createManualAuthWatcher({ onMatched });

    // backend 下发的 challenge 已包含 # 前缀
    watcher.startWatch({ playerName: 'Steve', challenge: '#A1B2C3' });

    // 精确匹配 challenge 原文，不拼接
    watcher.handlePlayerMessage({ playerName: 'Steve', message: '#A1B2C3' });

    expect(onMatched).toHaveBeenCalledTimes(1);
    expect(onMatched).toHaveBeenCalledWith({ playerName: 'Steve', challenge: '#A1B2C3' });
  });

  it('challenge 精确匹配时不匹配缺少前缀的纯数字', () => {
    const onMatched = vi.fn();
    const watcher = createManualAuthWatcher({ onMatched });

    watcher.startWatch({ playerName: 'Steve', challenge: '#A1B2C3' });

    // 发送纯数字不应匹配
    watcher.handlePlayerMessage({ playerName: 'Steve', message: 'A1B2C3' });
    watcher.handlePlayerMessage({ playerName: 'Steve', message: '#A1B2C3' });

    expect(onMatched).toHaveBeenCalledTimes(1);
  });
});
