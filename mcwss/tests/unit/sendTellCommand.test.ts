import { describe, expect, it, vi } from 'vitest';
import { createSendTellCommand } from '../../src/services/command/sendTellCommand.js';

describe('sendTellCommand', () => {
  it('应把 playerName 包裹为双引号并发送不带前缀的 code', async () => {
    const sendCommand = vi.fn().mockResolvedValue(true);
    const sendTellCommand = createSendTellCommand({ sendCommand });

    await sendTellCommand({ playerName: 'Steve', code: '123456' });

    expect(sendCommand).toHaveBeenCalledWith({
      commandLine: 'tell "Steve" 123456',
      originType: 'player'
    });
  });

  it('应对参数做 trim 后再组装命令', async () => {
    const sendCommand = vi.fn().mockResolvedValue(true);
    const sendTellCommand = createSendTellCommand({ sendCommand });

    await sendTellCommand({ playerName: '  Steve  ', code: '  123456  ' });

    expect(sendCommand).toHaveBeenCalledWith({
      commandLine: 'tell "Steve" 123456',
      originType: 'player'
    });
  });
});
