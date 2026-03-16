export interface SendTellCommandInput {
  playerName: string;
  code: string;
}

export interface SendTellCommandDeps {
  sendCommand: (input: {
    commandLine: string;
    originType?: string;
  }) => Promise<boolean>;
}

export type SendTellCommand = (input: SendTellCommandInput) => Promise<boolean>;

export function createSendTellCommand(deps: SendTellCommandDeps): SendTellCommand {
  return async ({ playerName, code }: SendTellCommandInput): Promise<boolean> => {
    const normalizedPlayerName = playerName.trim();
    const normalizedCode = code.trim();

    // 中文注释：玩家名加双引号包裹，验证码按原值发送（不叠加任何前缀）。
    const quotedPlayerName = `"${normalizedPlayerName}"`;
    const commandLine = `tell ${quotedPlayerName} ${normalizedCode}`;
    return deps.sendCommand({
      commandLine,
      originType: 'player'
    });
  };
}
