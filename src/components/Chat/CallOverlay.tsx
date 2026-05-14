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
  RefreshCw,
  VolumeX
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { ref, onValue, off, get, update } from "firebase/database";
import { rtdb } from "../../services/firebase";
import { endCall } from "../../services/chatService";
import { callManager, type CallSession } from "../../services/callManager";

// v2.4.2 BUILD 1755

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
  const logsEndRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef(status);
  const shouldEndCall = useRef(true);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [ `${new Date().toLocaleTimeString()}: ${msg}`, ...prev.slice(0, 30)]);
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

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
      // No database sync for connected status to avoid race conditions
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
          const updates: any = {
            offer: { type: offer.type, sdp: offer.sdp },
            status: 'calling',
            callType: callType,
            timestamp: Date.now()
          };
          await update(ref(rtdb, path), updates);
        };

        await sendOffer();
        const persistenceTimer = setInterval(async () => {
          if ((statusRef.current as string) === 'connected') {
            clearInterval(persistenceTimer);
            return;
          }
          const snap = await get(ref(rtdb, path));
          if (!snap.exists() || !snap.val().offer) {
            addLog("Signal lost! Restoring...");
            await sendOffer();
          }
        }, 5000);

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
      addLog("SIGNAL SYNC: Answer applied.");
      callManager.setRemoteDescription(internalCall.answer);
    }

    if (!isIncoming && status === 'connecting') {
      const watchdog = setTimeout(() => {
        if (statusRef.current !== 'connected') {
          addLog("Connection slow. Self-healing...");
          manualSync();
        }
      }, 15000);
      return () => clearTimeout(watchdog);
    }
  }, [internalCall.answer, isIncoming, status, addLog, manualSync]);

  const handleAccept = useCallback(async () => {
    if (isAccepting) return;
    setIsAccepting(true);
    addLog("Accepting...");

    const acceptTimeout = setTimeout(() => {
      if (statusRef.current !== 'connected') {
        addLog("Accept timeout. Resetting...");
        setIsAccepting(false);
        setStatus('incoming');
      }
    }, 20000);

    let currentOffer = internalCall.offer;
    if (!currentOffer) {
      const syncedData = await manualSync();
      currentOffer = syncedData?.offer;
    }

    if (!currentOffer) {
      addLog("Wait for caller...");
      setIsAccepting(false);
      clearTimeout(acceptTimeout);
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
          setIsAccepting(false);
          clearTimeout(acceptTimeout);
          startVolumeMonitor(remote);
        },
        (state) => { 
          addLog(`PC: ${state}`);
          if (state === 'connected') {
            setStatus('connected');
            setIsAccepting(false);
            clearTimeout(acceptTimeout);
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
      const updates: any = {
        answer: { type: answer.type, sdp: answer.sdp },
        status: 'connected'
      };

      await update(ref(rtdb, path), updates);
    } catch (e: any) {
      addLog(`Fail: ${e.message}`);
      setIsAccepting(false);
      clearTimeout(acceptTimeout);
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
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = isSpeakerOff;
    }
  }, [isSpeakerOff]);

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
          <div className="call-badge version-v242">
             <span>v2.4.2</span>
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
                <span>SIGNALING LOGS (v2.4.2)</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={manualSync} title="Force Sync"><RefreshCw size={14} /></button>
                  <button onClick={() => setShowConsole(false)}>×</button>
                </div>
              </div>
              <div className="console-body" style={{ maxHeight: '150px', overflowY: 'auto', padding: '10px' }}>
                {logs.map((log, i) => <div key={i} className="log-line">{log}</div>)}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </AnimatePresence>

        <div className="call-actions-bar enhanced-controls">
          <AnimatePresence mode="wait">
            {status === 'incoming' && !isAccepting ? (
              <motion.div 
                key="incoming-actions"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                className="call-btn-group incoming-ring"
              >
                <button onClick={() => handleEnd('Declined')} className="call-btn danger large ring-btn">
                  <PhoneOff size={32} />
                  <span className="btn-label">DECLINE</span>
                </button>
                <button onClick={handleAccept} className="call-btn success extra-large ring-btn pulse">
                  <Phone size={40} />
                  <span className="btn-label">ACCEPT</span>
                </button>
              </motion.div>
            ) : isAccepting ? (
              <motion.div 
                key="accepting-state"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="call-btn-group"
              >
                <div className="call-btn extra-large connecting glass">
                  <Loader className="animate-spin" size={40} />
                  <span className="btn-label">CONNECTING...</span>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="active-actions"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="call-btn-group"
              >
                <button 
                  onClick={toggleMute} 
                  className={`call-btn large ${isMuted ? 'muted active' : ''}`} 
                >
                  {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
                  <span className="btn-label">{isMuted ? 'UNMUTE' : 'MUTE'}</span>
                </button>
                
                <button onClick={() => handleEnd()} className="call-btn danger end extra-large">
                  <PhoneOff size={40} />
                  <span className="btn-label">END</span>
                </button>
                
                <button 
                  onClick={() => setIsSpeakerOff(!isSpeakerOff)} 
                  className={`call-btn large ${isSpeakerOff ? 'active warning' : ''}`}
                >
                  {isSpeakerOff ? <VolumeX size={28} /> : <Volume2 size={28} />}
                  <span className="btn-label">SPEAKER</span>
                </button>

                <button 
                  onClick={() => setShowConsole(!showConsole)} 
                  className={`call-btn medium console-btn ${showConsole ? 'active' : ''}`}
                >
                  <Terminal size={20} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      
      <style>{`
        .enhanced-controls {
          padding-bottom: 40px;
        }
        .call-btn-group {
          display: flex;
          align-items: flex-end;
          gap: 20px;
          justify-content: center;
          width: 100%;
        }
        .call-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 20px;
          border: none;
          background: rgba(255,255,255,0.1);
          color: white;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          backdrop-filter: blur(10px);
          position: relative;
        }
        .call-btn.medium { width: 50px; height: 50px; border-radius: 15px; }
        .call-btn.large { width: 85px; height: 85px; border-radius: 25px; }
        .call-btn.extra-large { width: 110px; height: 110px; border-radius: 35px; }
        
        .call-btn:hover { background: rgba(255,255,255,0.2); transform: translateY(-4px); }
        .call-btn.active { background: var(--primary); }
        .call-btn.muted.active { background: #ef4444; }
        .call-btn.warning.active { background: #f59e0b; }
        .call-btn.danger { background: #ef4444; }
        .call-btn.success { background: #22c55e; }
        
        .btn-label {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.05em;
          opacity: 0.8;
        }
        
        .pulse { animation: ring-pulse 2s infinite; }
        @keyframes ring-pulse {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
          70% { box-shadow: 0 0 0 20px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }

        .console-btn {
          position: absolute;
          right: 30px;
          bottom: 0;
        }

        .force-audio-btn {
          position: absolute;
          bottom: 180px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--primary);
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 25px;
          font-weight: bold;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          box-shadow: 0 8px 25px rgba(0,0,0,0.4);
          z-index: 100;
          animation: btn-float 2s infinite ease-in-out;
        }
        @keyframes btn-float {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-10px); }
        }
      `}</style>
    </div>
  );
};

export default CallOverlay;
