import type { IAudioService } from './IAudioService';

/** 远端音频的 Web Audio 节点链 */
interface RemoteAudioNodes {
  sourceNode: MediaElementAudioSourceNode;
  gainNode: GainNode;
}

export class AudioService implements IAudioService {
  private localStream: MediaStream | null = null;

  private readonly remoteAudios = new Map<string, HTMLAudioElement>();

  /** 每个 sessionId 对应的 Web Audio 节点链 */
  private readonly remoteNodes = new Map<string, RemoteAudioNodes>();

  private audioContext: AudioContext | null = null;

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

  /** 确保全局 AudioContext 已创建（懒初始化，首次播放时创建以应对浏览器自动播放策略） */
  private ensureAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    return this.audioContext;
  }

  playRemoteStream(sessionId: string, stream: MediaStream): void {
    const id = String(sessionId || '').trim();
    if (!id) {
      return;
    }

    // 已存在时更新 srcObject
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

    // 接入 Web Audio API：audio -> sourceNode -> gainNode -> destination
    try {
      const ctx = this.ensureAudioContext();
      const sourceNode = ctx.createMediaElementSource(audio);
      const gainNode = ctx.createGain();
      sourceNode.connect(gainNode);
      gainNode.connect(ctx.destination);
      this.remoteNodes.set(id, { sourceNode, gainNode });
    } catch (error) {
      // AudioContext 可能被暂停或创建失败，降级为无音量控制
      console.warn(
        '[AudioService] Web Audio API 初始化失败，音量控制不可用',
        error
      );
    }
  }

  /**
   * 更新指定远端音频的音量
   * @param sessionId 远端玩家会话 ID
   * @param volume 音量值，范围 [0, 1]
   */
  updateRemoteVolume(sessionId: string, volume: number): void {
    const id = String(sessionId || '').trim();
    if (!id) {
      return;
    }
    const nodes = this.remoteNodes.get(id);
    if (!nodes) {
      return;
    }
    const ctx = this.audioContext;
    if (!ctx) {
      return;
    }
    // 确保 AudioContext 处于运行状态（浏览器可能因自动播放策略暂停它）
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    nodes.gainNode.gain.setValueAtTime(volume, ctx.currentTime);
  }

  stopRemoteStream(sessionId: string): void {
    const id = String(sessionId || '').trim();
    if (!id) {
      return;
    }

    // 断开 Web Audio 节点链
    const nodes = this.remoteNodes.get(id);
    if (nodes) {
      try {
        nodes.sourceNode.disconnect();
      } catch {
        // 忽略已断开的节点错误
      }
      this.remoteNodes.delete(id);
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

    // 关闭全局 AudioContext
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}
