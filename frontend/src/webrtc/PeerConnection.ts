export class PeerConnection {
  readonly sessionId: string;

  readonly playerName: string;

  readonly pc: RTCPeerConnection;

  onIceCandidate?: (candidate: RTCIceCandidateInit) => void;

  onTrack?: (stream: MediaStream) => void;

  onConnectionStateChange?: (state: RTCIceConnectionState) => void;

  private readonly localTrackIds = new Set<string>();

  private pendingCandidates: RTCIceCandidateInit[] = [];

  private isClosed = false;

  constructor(
    sessionId: string,
    playerName: string,
    configuration?: RTCConfiguration
  ) {
    this.sessionId = sessionId;
    this.playerName = playerName;
    this.pc = new RTCPeerConnection(configuration);

    this.pc.addEventListener('icecandidate', (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate.toJSON());
      }
    });

    this.pc.addEventListener('track', (event) => {
      const stream =
        event.streams[0] ?? new MediaStream(event.track ? [event.track] : []);
      if (this.onTrack) {
        this.onTrack(stream);
      }
    });

    this.pc.addEventListener('iceconnectionstatechange', () => {
      const state = this.pc.iceConnectionState;
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(state);
      }
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        this.close();
      }
    });
  }

  attachLocalStream(stream: MediaStream): void {
    stream.getTracks().forEach((track) => {
      if (this.localTrackIds.has(track.id)) {
        return;
      }
      this.pc.addTrack(track, stream);
      this.localTrackIds.add(track.id);
    });
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(offer);
    await this.flushPendingCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(answer);
    await this.flushPendingCandidates();
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    await this.pc.addIceCandidate(candidate);
  }

  close(): void {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    this.pendingCandidates = [];
    this.pc.close();
  }

  private async flushPendingCandidates(): Promise<void> {
    if (!this.pendingCandidates.length || !this.pc.remoteDescription) {
      return;
    }

    const queue = this.pendingCandidates;
    this.pendingCandidates = [];
    await Promise.all(queue.map((candidate) => this.pc.addIceCandidate(candidate)));
  }
}
