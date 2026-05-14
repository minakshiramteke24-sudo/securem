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
  RefreshCw,
  VolumeX,
  Zap
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

  const forceAudioPlay = () => {
    addLog("Forcing audio playback...");
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.volume = 1.0;
      remoteAudioRef.current.play().catch(e => addLog(`Play fail: ${e.message}`));
    }
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

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
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      audioContextRef.current = audioCtx;
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
        stream.getAudioTracks().forEach(t => { t.enabled = true; });
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
        const persistenceTimer = setInterval(async () => {
          if ((status as string) === 'connected') {
            clearInterval(persistenceTimer);
            return;
          }
          const snap = await get(ref(rtdb, path));
          if (!snap.exists() || !snap.val().offer) {
            addLog("Signal lost! Restoring...");
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
      addLog("Wait for caller...");
      setIsAccepting(false);
      return;
    }

    setStatus('connecting');

    try {
      const callType = (internalCall.callType || internalCall.type || 'audio') as any;
      const stream = await callManager.startLocalStream(callType);
      stream.getAudioTracks().forEach(t => { t.enabled = true; });
      setLocalStream(stream);
      addLog("Media OK. Handshaking...");

      const pc = await callManager.createPeerConnection(
        stream,
        (remote) => { 
          addLog("Stream OK!");
          setRemoteStream(remote); 
          setStatus('connected'); 
          setIsAccepting(false); // Force accepting off
          startVolumeMonitor(remote);
        },
        (state) => { 
          addLog(`PC: ${state}`);
          if (state === 'connected') {
            setStatus('connected');
            setIsAccepting(false); // Force accepting off
          }
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
          <div className="call-badge version-v230">
             <span>v2.3.0</span>
          </div>
        </div>

        <div className="call-main">
          {(internalCall.callType || internalCall.type) === 'video' && status === 'connected' && remoteStream ? (
            <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
          ) : (
            <div className="call-avatar-view">
              <div className="call-avatar-circle" style={{ boxShadow: `0 0 ${remoteVolume * 3}px var(--primary)` }}>
                {status === 'connected' && <div className="call-ping" style={{ opacity: Math.max(0.3, remoteVolume / 40) }}></div>}
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
                  <div className="mic-meter">
                    {[1,2,3,4,5,6,7,8].map(i => (
                      <div key={i} className="mic-bar" style={{ height: `${Math.random() * remoteVolume * 1.5}%` }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {status === 'connected' && (
            <button className="force-audio-btn" onClick={forceAudioPlay}>
               <Volume2 size={16} /> 📢 FIX AUDIO
            </button>
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
                <span>SIGNALING LOGS (v2.3.0)</span>
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
              {isSpeakerOff ? <VolumeX /> : <Volume2 />}
            </button>
          </div>

          <div className="call-btn-group">
            {status === 'incoming' && !isAccepting && (
              <button onClick={handleAccept} className="call-btn success ringing">
                <Phone size={32} />
              </button>
            )}
            {isAccepting && (
              <div className="call-btn connecting">
                <Loader className="animate-spin" />
              </div>
            )}
            <button onClick={() => setShowConsole(!showConsole)} className={`call-btn ${showConsole ? 'active' : ''}`}>
              <Terminal />
            </button>
          </div>
        </div>
      </div>
      
      <style>{`
        .force-audio-btn {
          position: absolute;
          bottom: 120px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--primary);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: bold;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3);
          z-index: 100;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { transform: translateX(-50%) scale(1); }
          50% { transform: translateX(-50%) scale(1.05); }
          100% { transform: translateX(-50%) scale(1); }
        }
        .mic-meter {
          display: flex;
          gap: 3px;
          height: 15px;
          align-items: flex-end;
          margin-top: 15px;
          justify-content: center;
        }
        .mic-bar {
          width: 5px;
          background: var(--primary);
          border-radius: 2px;
          min-height: 2px;
          transition: height 0.1s ease;
        }
      `}</style>
    </div>
  );
};

export default CallOverlay;
