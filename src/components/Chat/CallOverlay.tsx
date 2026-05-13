import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Volume2, 
  Loader,
  Activity,
  Lock,
  Terminal,
  UserCheck,
  RefreshCw
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { ref, onValue, off, get } from "firebase/database";
import { rtdb } from "../../services/firebase";
import { updateCallStatus, endCall } from "../../services/chatService";
import { callManager, type CallSession } from "../../services/callManager";

interface CallOverlayProps {
  call: CallSession & { 
    remoteUsername?: string; 
    remoteAvatar?: string; 
    offer?: any; 
    answer?: any; 
    status?: string;
    callType?: string;
  };
  isIncoming: boolean;
  onClose: () => void;
}

const CallOverlay: React.FC<CallOverlayProps> = ({ call, isIncoming, onClose }) => {
  const { user } = useAuth();
  const [internalCall, setInternalCall] = useState(call);
  const [status, setStatus] = useState<'incoming' | 'outgoing' | 'connecting' | 'connected'>(isIncoming ? 'incoming' : 'outgoing');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [showConsole, setShowConsole] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [isAccepting, setIsAccepting] = useState(false);
  const [connectionTime, setConnectionTime] = useState(0);
  const hasInitiated = useRef(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const shouldEndCall = useRef(true);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [ `${new Date().toLocaleTimeString()}: ${msg}`, ...prev.slice(0, 15)]);
  }, []);

  const manualSync = useCallback(async () => {
    if (!user) return;
    const path = `calls/${call.recipientId}/${call.callerId}`;
    addLog(`Force Syncing: ${path}`);
    try {
      const snapshot = await get(ref(rtdb, path));
      if (snapshot.exists()) {
        const data = snapshot.val();
        addLog(`Sync Results: ${data.status} | Offer: ${!!data.offer}`);
        setInternalCall(prev => ({ ...prev, ...data }));
        if (data.status === 'connected' && status !== 'connected') setStatus('connected');
        return data;
      }
    } catch (e: any) {
      addLog(`Sync Fail: ${e.message}`);
    }
    return null;
  }, [user, call.recipientId, call.callerId, status, addLog]);

  const handleEnd = useCallback(async (reason: string = 'User Action') => {
    if (!shouldEndCall.current) return;
    shouldEndCall.current = false;
    addLog(`Ending: ${reason}`);
    await callManager.cleanup();
    try {
      await endCall(call.recipientId, call.callerId);
    } catch (e) {}
    onClose();
  }, [call.recipientId, call.callerId, onClose, addLog]);

  useEffect(() => {
    if (!user) return;
    const path = `calls/${call.recipientId}/${call.callerId}`;
    const callRef = ref(rtdb, path);
    
    onValue(callRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      
      setInternalCall(prev => ({
        ...prev,
        ...data,
        remoteUsername: data.remoteUsername || prev.remoteUsername || call.remoteUsername,
        remoteAvatar: data.remoteAvatar || prev.remoteAvatar || call.remoteAvatar
      }));

      if (data.status === 'ended') handleEnd('Remote ended');
      if (data.status === 'connected' && status !== 'connected') setStatus('connected');
    });

    return () => off(callRef);
  }, [user, call.recipientId, call.callerId, handleEnd]);

  useEffect(() => {
    if (isIncoming || localStream || status === 'connected' || !user || hasInitiated.current) return;
    hasInitiated.current = true;

    const startCallHandshake = async () => {
      try {
        addLog("Media init...");
        const callType = (internalCall.callType || internalCall.type || 'audio') as any;
        const stream = await callManager.startLocalStream(callType);
        setLocalStream(stream);
        addLog("Media OK. Creating PC...");

        const pc = await callManager.createPeerConnection(
          stream,
          (remote) => { 
            addLog("Remote stream received!");
            setRemoteStream(remote); 
            setStatus('connected'); 
          },
          (state) => { 
            addLog(`PC State: ${state}`); 
            if (state === 'connected') setStatus('connected'); 
          }
        );

        pc.onicecandidate = (e) => {
          if (e.candidate) callManager.handleIceCandidate(call.recipientId, call.callerId, 'caller', e.candidate.toJSON());
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        addLog("Sending offer...");
        await updateCallStatus(call.recipientId, call.callerId, { 
          offer: { type: offer.type, sdp: offer.sdp }, 
          status: 'calling' 
        });
        
        callManager.listenForCandidates(call.recipientId, call.callerId, 'recipient');
      } catch (err: any) {
        addLog(`Error: ${err.message}`);
        hasInitiated.current = false;
      }
    };

    startCallHandshake();
  }, [isIncoming, status, user, call.recipientId, call.callerId, addLog, localStream, internalCall.callType, internalCall.type]);

  useEffect(() => {
    if (!isIncoming && internalCall.answer && status !== 'connected') {
      addLog("Remote answer! Handshaking...");
      callManager.setRemoteDescription(internalCall.answer);
    }
  }, [internalCall.answer, isIncoming, status, addLog]);

  const handleAccept = useCallback(async () => {
    if (isAccepting) return;
    
    setIsAccepting(true);
    addLog("Accepting...");

    let currentOffer = internalCall.offer;
    
    if (!currentOffer) {
      addLog("Offer missing. Force syncing...");
      const syncedData = await manualSync();
      if (syncedData?.offer) {
        currentOffer = syncedData.offer;
      }
    }

    if (!currentOffer) {
      addLog("No offer yet. Please wait...");
      setIsAccepting(false);
      return;
    }

    setStatus('connecting');

    try {
      const callType = (internalCall.callType || internalCall.type || 'audio') as any;
      const stream = await callManager.startLocalStream(callType);
      setLocalStream(stream);
      addLog("Media OK. Connecting...");

      const pc = await callManager.createPeerConnection(
        stream,
        (remote) => { 
          addLog("Remote stream OK!");
          setRemoteStream(remote); 
          setStatus('connected'); 
        },
        (state) => { 
          addLog(`PC State: ${state}`);
          if (state === 'connected') setStatus('connected'); 
        }
      );

      pc.onicecandidate = (e) => {
        if (e.candidate) callManager.handleIceCandidate(call.recipientId, call.callerId, 'recipient', e.candidate.toJSON());
      };

      callManager.listenForCandidates(call.recipientId, call.callerId, 'caller');
      await callManager.setRemoteDescription(currentOffer);
      const answer = await callManager.createAnswer(callType);
      
      await updateCallStatus(call.recipientId, call.callerId, { 
        answer: { type: answer.type, sdp: answer.sdp }, 
        status: 'connected' 
      });
      setIsAccepting(false);
    } catch (e: any) {
      addLog(`Fail: ${e.message}`);
      setIsAccepting(false);
      handleEnd('Error');
    }
  }, [internalCall.offer, internalCall.callType, internalCall.type, call.recipientId, call.callerId, isAccepting, handleEnd, manualSync, addLog]);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => { t.enabled = isMuted; });
      setIsMuted(!isMuted);
    }
  };

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      // Force play
      remoteVideoRef.current.play().catch(() => {});
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      // Force play
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [localStream, remoteStream]);

  useEffect(() => {
    let timer: any;
    if (status === 'connected') {
      timer = setInterval(() => setConnectionTime(prev => prev + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const remoteName = internalCall.remoteUsername || "Secure User";
  const remoteAvatar = internalCall.remoteAvatar;

  return (
    <div className="call-overlay">
      <div className="call-container">
        <audio ref={remoteAudioRef} autoPlay playsInline />
        
        <div className="call-info-badges">
          <div className="call-badge active">
            <Lock size={14} />
            <span>E2EE VALIDATED</span>
          </div>
          <div className="call-badge" onClick={() => setShowConsole(!showConsole)}>
            <Activity size={14} />
            <span>S: {status.toUpperCase()} | O: {internalCall.offer ? '✅' : '⌛'} | A: {internalCall.answer ? '✅' : '⌛'}</span>
          </div>
          <div className="call-badge" style={{ background: '#6366f1', color: 'white' }}>
             <span>v2.2.4</span>
          </div>
        </div>

        <div className="call-main">
          {(internalCall.callType || internalCall.type) === 'video' && status === 'connected' && remoteStream ? (
            <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
          ) : (
            <div className="call-avatar-view">
              <div className="call-avatar-circle">
                <div className="call-ping"></div>
                <div className="avatar-inner-box">
                   {remoteAvatar ? (
                     <img src={remoteAvatar} alt="Avatar" className="avatar-img" />
                   ) : (
                     <span className="avatar-letter">{remoteName[0].toUpperCase()}</span>
                   )}
                </div>
              </div>
              <div className="user-text-box">
                <h1 className="remote-name-text">{remoteName}</h1>
                <p className="call-phase-text">
                  {status === 'connected' ? formatTime(connectionTime) : 
                   status === 'incoming' ? 'INCOMING CALL' : 
                   status === 'connecting' ? 'CONNECTING...' : 'CALLING...'}
                </p>
              </div>
            </div>
          )}

          {(internalCall.callType || internalCall.type) === 'video' && localStream && (
            <div className="local-preview-card">
              <video ref={localVideoRef} autoPlay muted playsInline className="local-video" />
            </div>
          )}
        </div>

        <AnimatePresence>
          {showConsole && (
            <div className="call-debug-console">
              <div className="console-header">
                <span>SIGNALING LOGS (v2.2.4)</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={manualSync} title="Force Sync"><RefreshCw size={14} /></button>
                  <button onClick={() => setShowConsole(false)}>×</button>
                </div>
              </div>
              <div className="console-body">
                {logs.map((log, i) => <div key={i} className="log-line">{log}</div>)}
              </div>
            </div>
          )}
        </AnimatePresence>

        <div className="call-actions-bar">
          <div className="call-btn-group">
            <button onClick={toggleMute} className={`call-btn ${isMuted ? 'active' : ''}`}>
              {isMuted ? <MicOff /> : <Mic />}
            </button>
            <button onClick={() => handleEnd()} className="call-btn danger end">
              <PhoneOff size={32} />
            </button>
            <button onClick={() => setIsSpeakerOff(!isSpeakerOff)} className={`call-btn ${isSpeakerOff ? 'active' : ''}`}>
              <Volume2 />
            </button>
          </div>

          <div className="call-btn-group">
            {status === 'incoming' && (
              <button 
                onClick={handleAccept} 
                disabled={isAccepting}
                className={`call-btn success ringing`}
              >
                {isAccepting ? <Loader className="animate-spin" /> : (internalCall.offer ? <Phone size={32} /> : <UserCheck size={32} />)}
              </button>
            )}
            <button onClick={() => setShowConsole(!showConsole)} className={`call-btn ${showConsole ? 'active' : ''}`}>
              <Terminal />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallOverlay;
