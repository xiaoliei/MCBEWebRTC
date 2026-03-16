import type { PositionDto } from '@mcbewebrtc/shared';

export interface IAudioService {
  initialize(): Promise<void>;
  getLocalStream(): MediaStream | null;
  playRemoteStream(sessionId: string, stream: MediaStream): void;
  stopRemoteStream(sessionId: string): void;
  cleanup(): void;
  updateSourcePosition?(sessionId: string, position: PositionDto): void;
}
