export interface IAudioService {
  initialize(): Promise<void>;
  getLocalStream(): MediaStream | null;
  playRemoteStream(sessionId: string, stream: MediaStream): void;
  stopRemoteStream(sessionId: string): void;
  /** 更新远端音频音量（基于距离衰减计算） */
  updateRemoteVolume(sessionId: string, volume: number): void;
  cleanup(): void;
}
