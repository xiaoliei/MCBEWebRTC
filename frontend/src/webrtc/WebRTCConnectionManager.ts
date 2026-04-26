import type { NearbyPlayerDto } from '@mcbewebrtc/shared';
import type { IAudioService } from '../audio/IAudioService';
import { calculateVolume } from '../audio/calculateVolume.js';
import { PeerConnection } from './PeerConnection';

export interface ConnectionState {
  sessionId: string;
  playerName: string;
  iceConnectionState: RTCIceConnectionState | 'unknown';
  hasRemoteTrack: boolean;
}

export interface WebRTCSignalOut {
  sendOffer(toSessionId: string, data: RTCSessionDescriptionInit): void;
  sendAnswer(toSessionId: string, data: RTCSessionDescriptionInit): void;
  sendCandidate(toSessionId: string, data: RTCIceCandidateInit): void;
}

export interface WebRTCManagerCallbacks {
  onStateChange(sessionId: string, next: ConnectionState): void;
  onDisconnected(sessionId: string): void;
}

export class WebRTCConnectionManager {
  private readonly connections = new Map<string, PeerConnection>();

  private readonly connectionStates = new Map<string, ConnectionState>();

  private readonly MAX_CONNECTIONS = 10;

  constructor(
    private readonly audioService: IAudioService,
    private readonly signalOut: WebRTCSignalOut,
    private readonly callbacks: WebRTCManagerCallbacks,
    private readonly selfSessionId: () => string,
    private readonly iceServers: RTCConfiguration['iceServers']
  ) {}

  async connectTo(sessionId: string, playerName: string): Promise<boolean> {
    if (this.connections.has(sessionId)) {
      return true;
    }

    if (this.connections.size >= this.MAX_CONNECTIONS) {
      return false;
    }

    const peer = this.createPeer(sessionId, playerName);
    try {
      const offer = await peer.createOffer();
      this.signalOut.sendOffer(sessionId, offer);
      return true;
    } catch (error) {
      // 中文注释：记录建连失败原因，便于定位 STUN/SDP 相关问题。
      console.warn('[WebRTCConnectionManager] connectTo failed', error);
      this.disconnectFrom(sessionId);
      return false;
    }
  }

  async handleOffer(data: {
    fromSessionId: string;
    playerName: string;
    offer: RTCSessionDescriptionInit;
  }): Promise<void> {
    const { fromSessionId, playerName, offer } = data;
    const peer =
      this.connections.get(fromSessionId) ??
      this.createPeer(fromSessionId, playerName);

    try {
      const answer = await peer.handleOffer(offer);
      this.signalOut.sendAnswer(fromSessionId, answer);
    } catch (error) {
      // 中文注释：记录 offer 处理失败上下文，方便排查协商异常。
      console.warn('[WebRTCConnectionManager] handleOffer failed', error);
      this.disconnectFrom(fromSessionId);
    }
  }

  async handleAnswer(data: {
    fromSessionId: string;
    answer: RTCSessionDescriptionInit;
  }): Promise<void> {
    const peer = this.connections.get(data.fromSessionId);
    if (!peer) {
      return;
    }

    try {
      await peer.handleAnswer(data.answer);
    } catch (error) {
      // 中文注释：answer 应用失败通常意味着状态不同步，输出日志辅助诊断。
      console.warn('[WebRTCConnectionManager] handleAnswer failed', error);
      this.disconnectFrom(data.fromSessionId);
    }
  }

  async handleCandidate(data: {
    fromSessionId: string;
    candidate: RTCIceCandidateInit;
  }): Promise<void> {
    const peer = this.connections.get(data.fromSessionId);
    if (!peer) {
      return;
    }

    try {
      await peer.addIceCandidate(data.candidate);
    } catch (error) {
      // 中文注释：候选应用失败时主动断连并保留日志，避免僵尸连接。
      console.warn('[WebRTCConnectionManager] handleCandidate failed', error);
      this.disconnectFrom(data.fromSessionId);
    }
  }

  syncConnections(nearbyPlayers: NearbyPlayerDto[]): void {
    const nearbyIds = new Set(nearbyPlayers.map((player) => player.sessionId));

    this.connections.forEach((_peer, sessionId) => {
      if (!nearbyIds.has(sessionId)) {
        this.disconnectFrom(sessionId);
      }
    });

    nearbyPlayers.forEach((player) => {
      const selfId = this.selfSessionId();
      const shouldConnect =
        player.sessionId !== selfId &&
        !this.connections.has(player.sessionId) &&
        selfId < player.sessionId;

      if (shouldConnect) {
        void this.connectTo(player.sessionId, player.playerName);
      }
    });
  }

  /**
   * 根据本玩家位置和附近玩家列表，计算每个在线连接的音量并更新
   * @param myPosition 本玩家位置，null 时所有连接音量设为 1.0
   * @param players 附近玩家列表
   */
  updateVolumes(
    myPosition: { x: number; y: number; z: number } | null,
    players: NearbyPlayerDto[],
  ): void {
    this.connections.forEach((_peer, sessionId) => {
      if (!myPosition) {
        // 本玩家位置未知（浏览器端客户端），不衰减
        this.audioService.updateRemoteVolume(sessionId, 1.0);
        return;
      }

      const player = players.find((p) => p.sessionId === sessionId);
      if (!player) {
        // 该连接的玩家不在附近列表中，保持静默
        return;
      }

      // 计算 3D 欧几里得距离
      const dx = myPosition.x - player.position.x;
      const dy = myPosition.y - player.position.y;
      const dz = myPosition.z - player.position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // 使用 1/r 反比例曲线计算音量
      const volume = calculateVolume(distance);
      this.audioService.updateRemoteVolume(sessionId, volume);
    });
  }

  disconnectFrom(sessionId: string): void {
    const peer = this.connections.get(sessionId);
    if (!peer) {
      return;
    }
    peer.close();
    this.connections.delete(sessionId);
    this.connectionStates.delete(sessionId);
    this.audioService.stopRemoteStream(sessionId);
    this.callbacks.onDisconnected(sessionId);
  }

  disconnectAll(): void {
    Array.from(this.connections.keys()).forEach((sessionId) => {
      this.disconnectFrom(sessionId);
    });
  }

  getConnections(): Map<string, ConnectionState> {
    return new Map(this.connectionStates);
  }

  private createPeer(sessionId: string, playerName: string): PeerConnection {
    const peer = new PeerConnection(sessionId, playerName, {
      iceServers: this.iceServers
    });

    const localStream = this.audioService.getLocalStream();
    if (localStream) {
      peer.attachLocalStream(localStream);
    }

    const defaultState: ConnectionState = {
      sessionId,
      playerName,
      iceConnectionState: peer.pc.iceConnectionState,
      hasRemoteTrack: false
    };
    this.connections.set(sessionId, peer);
    this.connectionStates.set(sessionId, defaultState);
    this.callbacks.onStateChange(sessionId, defaultState);

    peer.onIceCandidate = (candidate) => {
      this.signalOut.sendCandidate(sessionId, candidate);
    };

    peer.onTrack = (stream) => {
      this.audioService.playRemoteStream(sessionId, stream);
      const prev = this.connectionStates.get(sessionId) ?? defaultState;
      const next: ConnectionState = { ...prev, hasRemoteTrack: true };
      this.connectionStates.set(sessionId, next);
      this.callbacks.onStateChange(sessionId, next);
    };

    peer.onConnectionStateChange = (iceConnectionState) => {
      const prev = this.connectionStates.get(sessionId) ?? defaultState;
      const next: ConnectionState = { ...prev, iceConnectionState };
      this.connectionStates.set(sessionId, next);
      this.callbacks.onStateChange(sessionId, next);
      if (
        iceConnectionState === 'failed' ||
        iceConnectionState === 'disconnected' ||
        iceConnectionState === 'closed'
      ) {
        this.disconnectFrom(sessionId);
      }
    };

    return peer;
  }
}
