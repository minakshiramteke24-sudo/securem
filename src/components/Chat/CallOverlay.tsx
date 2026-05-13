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
import { ref, onValue, off, get, set } from "firebase/database";
import { rtdb } from "../../services/firebase";
import { endCall } from "../../services/chatService";
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
  const [remoteVolume, setRemoteVolume] = useState(0);
  const hasInitiated = useRef(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const shouldEndCall = useRef(true);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [ `${new Date().toLocaleTimeString()}: ${msg}`, ...prev.slice(0, 30)]);
  }, []);

  const manualSync = useCallback(async () => {
    if (!user) return;
    const path = `calls/${call.recipientId}/${call.callerId}`;
    addLog(`Deep Sync: ${path}`);
    try {
      const snapshot = await get(ref(rtdb, path));
      if (snapshot.exists()) {
        const data = snapshot.val();
        addLog(`Found: ${data.status} | O: ${!!data.offer} | A: ${!!data.answer}`);
        setInternalCall(prev => ({ ...prev, ...data }));
        if (data.status === 'connected' && status !== 'connected') setStatus('connected');
        return data;
      } else {
        addLog("Sync: Data missing.");
      }
    } catch (e: any) {
      addLog(`Sync Err: ${e.message}`);
    }
    return null;
  }, [user, call.recipientId, call.callerId, status, addLog]);

  const handleEnd = useCallback(async (reason: string = 'User Action') => {
    if (!shouldEndCall.current) return;
    shouldEndCall.current = false;
    addLog(`Ending: ${reason}`);
    await callManager.cleanup();
    if (audioContextRef.current) audioContextRef.current.close();
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
      setInternalCall(prev => ({ ...prev, ...data }));
      if (data.status === 'ended') handleEnd('Remote ended');
      if (data.status === 'connected' && status !== 'connected') setStatus('connected');
    });

    return () => off(callRef);
  }, [user, call.recipientId, call.callerId, handleEnd]);

  const startVolumeMonitor = (stream: MediaStream) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        setRemoteVolume(sum / bufferLength);
        requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch (e) {}
  };

  useEffect(() => {
    if (isIncoming || localStream || status === 'connected' || !user || hasInitiated.current) return;
    hasInitiated.current = true;

    const startCallHandshake = async () => {
      try {
        addLog("Media init...");
        const callType = (internalCall.callType || internalCall.type || 'audio') as any;
        const stream = await callManager.startLocalStream(callType);
        
        stream.getAudioTracks().forEach(track => { track.enabled = true; });
        setIsMuted(false);
        setLocalStream(stream);
        addLog("Media OK. Sending Offer...");

        const pc = await callManager.createPeerConnection(
          stream,
          (remote) => { 
            addLog("Stream OK!");
            setRemoteStream(remote); 
            setStatus('connected');
            startVolumeMonitor(remote);
          },
          (state) => { 
            addLog(`PC: ${state}`); 
            if (state === 'connected') setStatus('connected'); 
          }
        );

        pc.onicecandidate = (e) => {
          if (e.candidate) callManager.handleIceCandidate(call.recipientId, call.callerId, 'caller', e.candidate.toJSON());
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        const path = `calls/${call.recipientId}/${call.callerId}`;
        const sendOffer = async () => {
          const sanitizedCall = JSON.parse(JSON.stringify({
            ...internalCall,
            offer: { type: offer.type, sdp: offer.sdp },
            status: 'calling',
            callType: callType,
            answer: null
          }));
          await set(ref(rtdb, path), sanitizedCall);
        };

        await sendOffer();
        addLog("Offer sent. Loop active.");

        // PERSISTENCE LOOP: Re-send offer if it gets deleted by 'ghost' tabs
        const persistenceTimer = setInterval(async () => {
          if (status === 'connected') {
            clearInterval(persistenceTimer);
            return;
          }
          const snap = await get(ref(rtdb, path));
          if (!snap.exists() || !snap.val().offer) {
            addLog("Offer lost! Re-sending...");
            await sendOffer();
          }
        }, 3000);

        callManager.listenForCandidates(call.recipientId, call.callerId, 'recipient');
      } catch (err: any) {
        addLog(`Error: ${err.message}`);
        hasInitiated.current = false;
      }
    };

    startCallHandshake();
  }, [isIncoming, status, user, call.recipientId, call.callerId, addLog, localStream, internalCall.callType, internalCall.type, internalCall]);

  useEffect(() => {
    if (!isIncoming && internalCall.answer && status !== 'connected') {
      addLog("Answer found! Finalizing...");
      callManager.setRemoteDescription(internalCall.answer);
    }
  }, [internalCall.answer, isIncoming, status, addLog]);

  const handleAccept = useCallback(async () => {
    if (isAccepting) return;
    setIsAccepting(true);
    addLog("Accepting...");

    let currentOffer = internalCall.offer;
    if (!currentOffer) {
      const syncedData = await manualSync();
      currentOffer = syncedData?.offer;
    }

    if (!currentOffer) {
      addLog("Wait for caller signal...");
      setIsAccepting(false);
      return;
    }

    setStatus('connecting');

    try {
      const callType = (internalCall.callType || internalCall.type || 'audio') as any;
      const stream = await callManager.startLocalStream(callType);
      stream.getAudioTracks().forEach(track => { track.enabled = true; });
      setIsMuted(false);
      setLocalStream(stream);
      addLog("Media OK. Handshaking...");

      const pc = await callManager.createPeerConnection(
        stream,
        (remote) => { 
          addLog("Stream OK!");
          setRemoteStream(remote); 
          setStatus('connected'); 
          startVolumeMonitor(remote);
        },
        (state) => { 
          addLog(`PC: ${state}`);
          if (state === 'connected') setStatus('connected'); 
        }
      );

      pc.onicecandidate = (e) => {
        if (e.candidate) callManager.handleIceCandidate(call.recipientId, call.callerId, 'recipient', e.candidate.toJSON());
      };

      callManager.listenForCandidates(call.recipientId, call.callerId, 'caller');
      await callManager.setRemoteDescription(currentOffer);
      const answer = await callManager.createAnswer(callType);
      
      const path = `calls/${call.recipientId}/${call.callerId}`;
      const sanitizedAnswer = JSON.parse(JSON.stringify({ 
        ...internalCall,
        answer: { type: answer.type, sdp: answer.sdp }, 
        status: 'connected' 
      }));

      await set(ref(rtdb, path), sanitizedAnswer);
      setIsAccepting(false);
    } catch (e: any) {
      addLog(`Fail: ${e.message}`);
      setIsAccepting(false);
      handleEnd('Error');
    }
  }, [internalCall, call.recipientId, call.callerId, isAccepting, handleEnd, manualSync, addLog]);

  const toggleMute = () => {
    if (localStream) {
      const newState = !isMuted;
      localStream.getAudioTracks().forEach(t => { t.enabled = !newState; });
      setIsMuted(newState);
      addLog(newState ? "Muted" : "Unmuted");
    }
  };

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.volume = 1.0;
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
          <div className="call-badge version-v229">
             <span>v2.2.9</span>
          </div>
        </div>

        <div className="call-main">
          {(internalCall.callType || internalCall.type) === 'video' && status === 'connected' && remoteStream ? (
            <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
          ) : (
            <div className="call-avatar-view">
              <div className="call-avatar-circle" style={{ boxShadow: `0 0 ${remoteVolume * 2}px var(--primary)` }}>
                {status === 'connected' && <div className="call-ping" style={{ opacity: Math.max(0.3, remoteVolume / 50) }}></div>}
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
                {status === 'connected' && (
                  <div style={{ display: 'flex', gap: '2px', height: '10px', alignItems: 'flex-end', marginTop: '10px', justifyContent: 'center' }}>
                    {[1,2,3,4,5].map(i => (
                      <div key={i} style={{ width: '4px', background: 'var(--primary)', borderRadius: '2px', height: `${Math.random() * remoteVolume}%`, minHeight: '2px', transition: 'height 0.1s' }} />
                    ))}
                  </div>
                )}
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
                <span>SIGNALING LOGS (v2.2.9)</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={manualSync} title="Force Sync"><RefreshCw size={14} /></button>
                  <button onClick={() => setShowConsole(false)}>×</button>
                </div>
              </div>
              <div className="console-body" style={{ maxHeight: '150px', overflowY: 'auto', padding: '10px' }}>
                {logs.map((log, i) => <div key={i} className="log-line">{log}</div>)}
              </div>
            </div>
          )}
        </AnimatePresence>

        <div className="call-actions-bar">
          <div className="call-btn-group">
            <button onClick={toggleMute} className={`call-btn ${isMuted ? 'muted' : ''}`} title={isMuted ? "Unmute" : "Mute"}>
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
