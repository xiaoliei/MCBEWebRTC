interface StartWatchInput {
  playerName: string;
  challenge: string;
}

interface PlayerMessageInput {
  playerName: string;
  message: string;
}

interface ManualAuthWatcherOptions {
  onMatched: (input: { playerName: string; challenge: string }) => void;
}

export interface ManualAuthWatcher {
  startWatch: (input: StartWatchInput) => void;
  stopWatch: (playerName: string) => void;
  handlePlayerMessage: (input: PlayerMessageInput) => void;
}

export function createManualAuthWatcher(
  options: ManualAuthWatcherOptions
): ManualAuthWatcher {
  const watchedChallengeByPlayerName = new Map<string, string>();

  return {
    startWatch: ({ playerName, challenge }: StartWatchInput): void => {
      // 中文注释：同名玩家重复发起 watch 时覆盖旧 challenge，确保仅以最新请求为准。
      watchedChallengeByPlayerName.set(playerName.trim(), challenge.trim());
    },
    stopWatch: (playerName: string): void => {
      watchedChallengeByPlayerName.delete(playerName.trim());
    },
    handlePlayerMessage: ({ playerName, message }: PlayerMessageInput): void => {
      const normalizedPlayerName = playerName.trim();
      const expectedChallenge = watchedChallengeByPlayerName.get(normalizedPlayerName);
      if (!expectedChallenge) {
        return;
      }

      const normalizedMessage = message.trim();
      // 中文注释：使用 backend 下发的 challenge 精确匹配，不再拼接 # 前缀
      if (normalizedMessage !== expectedChallenge) {
        return;
      }

      options.onMatched({
        playerName: normalizedPlayerName,
        challenge: expectedChallenge
      });
    }
  };
}
