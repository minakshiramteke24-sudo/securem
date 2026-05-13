import { ref, set, push, onValue, onChildAdded, remove } from "firebase/database";
import { rtdb } from "./firebase";

export interface TransferSession {
  id: string;
  senderId: string;
  recipientId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: 'requesting' | 'accepted' | 'transferring' | 'completed' | 'failed' | 'rejected';
  offer?: any;
  answer?: any;
}

const ICE_SERVERS = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

class TransferService {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private candidateQueue: any[] = [];
  private isRemoteSet = false;

  /**
   * INITIATE A TRANSFER (Sender)
   */
  async startTransfer(senderId: string, recipientId: string, file: File, onProgress: (p: number) => void) {
    const sessionId = push(ref(rtdb, `transfers/${recipientId}`)).key!;
    this.pc = new RTCPeerConnection(ICE_SERVERS);
    
    // Create Data Channel
    this.dataChannel = this.pc.createDataChannel("fileTransfer");
    this.dataChannel.binaryType = "arraybuffer";

    // Handle ICE
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        set(push(ref(rtdb, `transfers/${recipientId}/${sessionId}/senderCandidates`)), event.candidate.toJSON());
      }
    };

    // Create Offer
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const session: TransferSession = {
      id: sessionId,
      senderId,
      recipientId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      status: 'requesting',
      offer
    };

    await set(ref(rtdb, `transfers/${recipientId}/${sessionId}`), session);

    // Listen for Answer
    onValue(ref(rtdb, `transfers/${recipientId}/${sessionId}/answer`), async (snap) => {
      if (snap.exists() && this.pc) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(snap.val()));
        this.isRemoteSet = true;
        this.processCandidates();
      }
    });

    // Listen for Recipient ICE
    onChildAdded(ref(rtdb, `transfers/${recipientId}/${sessionId}/recipientCandidates`), (snap) => {
      const candidate = snap.val();
      if (this.isRemoteSet) this.pc?.addIceCandidate(new RTCIceCandidate(candidate));
      else this.candidateQueue.push(candidate);
    });

    // Handle Data Channel Open and Send File
    this.dataChannel.onopen = () => {
      this.sendFile(file, onProgress);
    };
  }

  private async sendFile(file: File, onProgress: (p: number) => void) {
    if (!this.dataChannel) return;
    
    const CHUNK_SIZE = 16384;
    const buffer = await file.arrayBuffer();
    let offset = 0;

    const sendChunk = () => {
      while (offset < buffer.byteLength) {
        if (this.dataChannel!.bufferedAmount > this.dataChannel!.bufferedAmountLowThreshold) {
          setTimeout(sendChunk, 1);
          return;
        }
        const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
        this.dataChannel!.send(chunk);
        offset += CHUNK_SIZE;
        onProgress(Math.min(100, (offset / buffer.byteLength) * 100));
      }
      this.dataChannel?.send("EOF"); // End of file signal
    };
    sendChunk();
  }

  private processCandidates() {
    this.candidateQueue.forEach(c => this.pc?.addIceCandidate(new RTCIceCandidate(c)));
    this.candidateQueue = [];
  }

  /**
   * ACCEPT A TRANSFER (Recipient)
   */
  async acceptTransfer(session: TransferSession, onFileReceived: (blob: Blob) => void, onProgress: (p: number) => void) {
    this.pc = new RTCPeerConnection(ICE_SERVERS);
    const receivedChunks: ArrayBuffer[] = [];

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        set(push(ref(rtdb, `transfers/${session.recipientId}/${session.id}/recipientCandidates`)), event.candidate.toJSON());
      }
    };

    this.pc.ondatachannel = (event) => {
      const channel = event.channel;
      channel.binaryType = "arraybuffer";
      let receivedSize = 0;

      channel.onmessage = (e) => {
        if (e.data === "EOF") {
          const blob = new Blob(receivedChunks, { type: session.fileType });
          onFileReceived(blob);
          remove(ref(rtdb, `transfers/${session.recipientId}/${session.id}`));
          return;
        }
        receivedChunks.push(e.data);
        receivedSize += e.data.byteLength;
        onProgress(Math.min(100, (receivedSize / session.fileSize) * 100));
      };
    };

    await this.pc.setRemoteDescription(new RTCSessionDescription(session.offer));
    this.isRemoteSet = true;
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await set(ref(rtdb, `transfers/${session.recipientId}/${session.id}/answer`), answer);
    
    // Process Sender ICE
    onChildAdded(ref(rtdb, `transfers/${session.recipientId}/${session.id}/senderCandidates`), (snap) => {
      this.pc?.addIceCandidate(new RTCIceCandidate(snap.val()));
    });
  }
}

export const transferService = new TransferService();
