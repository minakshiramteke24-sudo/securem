import { ref, set, push, onChildAdded } from "firebase/database";
import { rtdb } from "./firebase";

export interface CallSession {
  chatId: string;
  callerId: string;
  recipientId: string;
  type: 'audio' | 'video';
  status: 'init' | 'calling' | 'connected' | 'ended';
  offer?: any;
  answer?: any;
  recipientUsername?: string;
  recipientAvatar?: string;
  callerUsername?: string;
  callerAvatar?: string;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
};

class CallManager {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private candidateQueue: RTCIceCandidateInit[] = [];
  private isRemoteDescriptionSet = false;
  private cleanupCallbacks: (() => void)[] = [];

  constructor() {}

  async startLocalStream(type: 'audio' | 'video'): Promise<MediaStream> {
    console.log(`[CallManager] Starting local stream (${type})`);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: type === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    this.localStream = stream;
    return stream;
  }

  async shareScreen(): Promise<MediaStream> {
    if (!this.pc) throw new Error("PC not initialized");
    
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const screenTrack = screenStream.getVideoTracks()[0];
    
    const sender = this.pc.getSenders().find(s => s.track?.kind === 'video');
    if (sender) {
      await sender.replaceTrack(screenTrack);
    } else {
      this.pc.addTrack(screenTrack, screenStream);
    }
    
    return screenStream;
  }
  
  async stopScreenShare(originalVideoStream: MediaStream) {
    if (!this.pc) return;
    const videoTrack = originalVideoStream.getVideoTracks()[0];
    if (videoTrack) {
      const sender = this.pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(videoTrack);
      }
    }
  }

  async createPeerConnection(localStream: MediaStream, onRemoteStream: (stream: MediaStream) => void, onStateChange: (state: string) => void): Promise<RTCPeerConnection> {
    console.log("[CallManager] Creating RTCPeerConnection");
    this.pc = new RTCPeerConnection(ICE_SERVERS);

    localStream.getTracks().forEach(track => {
      this.pc?.addTrack(track, localStream);
    });

    this.pc.ontrack = (event) => {
      console.log("[CallManager] 📥 Remote track received:", event.track.kind);
      if (event.streams && event.streams[0]) {
        onRemoteStream(event.streams[0]);
      } else {
        // Fallback for browsers that don't provide streams in ontrack
        console.log("[CallManager] 🏗️ Creating fallback stream for track");
        const fallbackStream = new MediaStream([event.track]);
        onRemoteStream(fallbackStream);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log(`[CallManager] 📶 ICE State: ${this.pc?.iceConnectionState}`);
      onStateChange(this.pc?.iceConnectionState || "");
    };

    this.pc.onconnectionstatechange = () => {
      console.log(`[CallManager] 🔌 Connection State: ${this.pc?.connectionState}`);
      onStateChange(this.pc?.connectionState || "");
    };

    return this.pc;
  }

  async handleIceCandidate(recipientId: string, callerId: string, myType: 'caller' | 'recipient', candidate: RTCIceCandidateInit) {
    const path = `calls/${recipientId}/${callerId}/${myType}Candidates`;
    await set(push(ref(rtdb, path)), candidate);
  }

  listenForCandidates(recipientId: string, callerId: string, remoteType: 'caller' | 'recipient') {
    const path = `calls/${recipientId}/${callerId}/${remoteType}Candidates`;
    const candidatesRef = ref(rtdb, path);
    const unsubscribe = onChildAdded(candidatesRef, (snapshot) => {
      const candidate = snapshot.val();
      if (this.isRemoteDescriptionSet) {
        this.pc?.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error("[CallManager] ICE addition failed", e));
      } else {
        this.candidateQueue.push(candidate);
      }
    });
    this.cleanupCallbacks.push(unsubscribe);
    return unsubscribe;
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    if (this.isRemoteDescriptionSet) {
      console.log("[CallManager] RemoteDescription already set, skipping.");
      return;
    }
    
    console.log("[CallManager] Setting RemoteDescription");
    try {
      await this.pc?.setRemoteDescription(new RTCSessionDescription(description));
      this.isRemoteDescriptionSet = true;
      
      // Process queued candidates
      console.log(`[CallManager] Processing ${this.candidateQueue.length} queued candidates`);
      while (this.candidateQueue.length > 0) {
        const candidate = this.candidateQueue.shift();
        if (candidate) {
          await this.pc?.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error("[CallManager] Queued ICE addition failed", e));
        }
      }
    } catch (err) {
      console.error("[CallManager] Failed to set remote description:", err);
      throw err;
    }
  }

  async createAnswer(type: 'audio' | 'video'): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error("PC not initialized");
    console.log("[CallManager] 📤 Creating Answer...");
    const answer = await this.pc.createAnswer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: type === 'video'
    });
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async cleanup() {
    console.log("[CallManager] 🧩 Comprehensive Cleanup Started");
    
    // 1. Run all unsubscribe callbacks
    this.cleanupCallbacks.forEach(cb => cb());
    this.cleanupCallbacks = [];

    // 2. Stop all media tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    // 3. Close peer connection
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }

    this.isRemoteDescriptionSet = false;
    this.candidateQueue = [];
  }
}

export const callManager = new CallManager();
