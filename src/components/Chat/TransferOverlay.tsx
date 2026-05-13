import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Upload, X, Shield, CheckCircle2 } from "lucide-react";
import { transferService, type TransferSession } from "../../services/transferService";
import { useAuth } from "../../context/AuthContext";

interface TransferOverlayProps {
  activeSession: TransferSession | null;
  onClose: () => void;
}

const TransferOverlay: React.FC<TransferOverlayProps> = ({ activeSession, onClose }) => {
  const { user } = useAuth();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>("Initializing...");

  const isSender = activeSession?.senderId === user?.uid;

  useEffect(() => {
    if (activeSession && !isSender && progress === 0) {
      handleAccept();
    }
  }, [activeSession]);

  const handleAccept = async () => {
    if (!activeSession) return;
    setStatus("Connecting P2P...");
    await transferService.acceptTransfer(
      activeSession,
      (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = activeSession.fileName;
        a.click();
        setStatus("Completed!");
        setTimeout(onClose, 2000);
      },
      (p) => {
        setProgress(p);
        setStatus("Receiving File...");
      }
    );
  };

  if (!activeSession) return null;

  return (
    <AnimatePresence>
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)'
      }}>
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="glass"
          style={{
            width: '100%',
            maxWidth: '450px',
            borderRadius: '1.5rem',
            padding: '2rem',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            position: 'relative'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ padding: '0.5rem', background: 'rgba(var(--primary-rgb), 0.2)', borderRadius: '0.75rem' }}>
                <Shield size={20} color="var(--primary)" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem' }}>P2P Secure Transfer</h3>
                <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.6 }}>Direct Device-to-Device</p>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-muted)', padding: '0.5rem' }}>
              <X size={20} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="glass" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(255,255,255,0.05)' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: '0.75rem' }}>
                {isSender ? <Upload size={24} /> : <Download size={24} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeSession.fileName}</p>
                <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.6 }}>{(activeSession.fileSize / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ opacity: 0.6 }}>{status}</span>
                <span style={{ fontWeight: 700 }}>{Math.round(progress)}%</span>
              </div>
              <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '100px', overflow: 'hidden' }}>
                <motion.div 
                  style={{ height: '100%', background: 'var(--primary)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {progress === 100 && (
              <motion.div 
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '0.5rem', 
                  color: '#10b981', 
                  background: 'rgba(16, 185, 129, 0.1)', 
                  padding: '0.75rem', 
                  borderRadius: '0.75rem',
                  fontWeight: 700
                }}
              >
                <CheckCircle2 size={18} />
                <span>Transfer Successful</span>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default TransferOverlay;
