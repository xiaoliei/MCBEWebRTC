import type { IAudioService } from './IAudioService';

export class AudioService implements IAudioService {
  private localStream: MediaStream | null = null;

  private readonly remoteAudios = new Map<string, HTMLAudioElement>();

  async initialize(): Promise<void> {
    if (this.localStream) {
      return;
    }

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      throw new Error('当前环境不支持麦克风访问');
    }

    try {
      // 中文注释：MVP 默认开启基础音频增强，保证语音质量和稳定性。
      this.localStream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        throw new Error('麦克风权限被拒绝');
      }
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        throw new Error('未检测到麦克风设备');
      }
      throw error instanceof Error ? error : new Error('音频初始化失败');
    }
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  playRemoteStream(sessionId: string, stream: MediaStream): void {
    const id = String(sessionId || '').trim();
    if (!id) {
      return;
    }

    const exists = this.remoteAudios.get(id);
    if (exists) {
      exists.srcObject = stream;
      return;
    }

    // 中文注释：使用隐藏 audio 元素承载远端语音，避免引入额外 UI 复杂度。
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', 'true');
    audio.dataset.sessionId = id;
    audio.style.display = 'none';
    audio.srcObject = stream;
    document.body.appendChild(audio);
    void audio.play().catch((error) => {
      // 中文注释：自动播放受限时打印日志，便于本地调试策略差异。
      console.warn('[AudioService] remote audio play blocked', error);
    });
    this.remoteAudios.set(id, audio);
  }

  stopRemoteStream(sessionId: string): void {
    const id = String(sessionId || '').trim();
    if (!id) {
      return;
    }
    const audio = this.remoteAudios.get(id);
    if (!audio) {
      return;
    }
    audio.pause();
    audio.srcObject = null;
    audio.remove();
    this.remoteAudios.delete(id);
  }

  cleanup(): void {
    // 中文注释：先拷贝 key 再删除，避免遍历时修改集合导致遗漏清理。
    Array.from(this.remoteAudios.keys()).forEach((sessionId) => {
      this.stopRemoteStream(sessionId);
    });

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
  }
}
