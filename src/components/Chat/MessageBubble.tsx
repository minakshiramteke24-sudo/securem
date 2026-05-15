import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type Message } from "../../services/chatService";
import { type UserProfile } from "../../services/userService";
import { useCrypto } from "../../context/CryptoContext";
import { useAuth } from "../../context/AuthContext";
import { unwrapAESKey, decryptMessage, importSigningPublicKey, verifyData } from "../../services/cryptoService";
import { Shield, ShieldCheck, CheckCircle2, FileText, Download, Check, CheckCheck } from "lucide-react";
import { decryptBase64File } from "../../services/mediaService";

interface MessageBubbleProps {
  message: Message;
  senderProfile: UserProfile | null;
  isSelected: boolean;
  onSelect: (messageId: string, multi: boolean, text?: string) => void;
  onReaction?: (emoji: string) => void;
  onOpenMedia?: (url: string) => void;
  repliedMessage?: { sender: string, text: string } | null;
  searchQuery?: string;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ 
  message, 
  senderProfile, 
  isSelected, 
  onSelect, 
  onReaction,
  onOpenMedia,
  repliedMessage,
  searchQuery
}) => {
  const { user } = useAuth();
  const { privateKey } = useCrypto();
  const [decryptedText, setDecryptedText] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [error, setError] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [decryptingMedia, setDecryptingMedia] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);
  const longPressTimer = useRef<any>(null);

  const isMe = message.senderId === user?.uid;

  const startPress = () => {
    longPressTimer.current = setTimeout(() => {
      onSelect(message.id, false, decryptedText || "");
      if ('vibrate' in navigator) navigator.vibrate(50);
    }, 600);
  };

  const endPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onSelect(message.id, false, decryptedText || "");
  };

  const handleClick = () => {
    onSelect(message.id, true, decryptedText || "");
  };

  useEffect(() => {
    const decryptAndVerify = async () => {
      if (!privateKey || !user || !senderProfile || message.deleted) return;
      
      try {
        const wrappedKey = message.wrappedKeys?.[user.uid];
        if (!wrappedKey) throw new Error("No key for this user");

        const aesKey = await unwrapAESKey(wrappedKey, privateKey);
        
        if (message.ciphertext && message.iv) {
          const text = await decryptMessage(message.ciphertext, message.iv, aesKey);
          setDecryptedText(text);
        }

        if (message.signature && senderProfile.signingPublicKey) {
          const signingPubKey = await importSigningPublicKey(senderProfile.signingPublicKey);
          const verified = await verifyData(message.ciphertext, message.signature, signingPubKey);
          setIsVerified(verified);
        }
      } catch (e) {
        console.error("Decryption/Verification failed:", e);
        setError(true);
      }
    };

    decryptAndVerify();
  }, [
    message.id, 
    message.ciphertext, 
    message.signature, 
    message.deleted, 
    privateKey, 
    user?.uid, 
    senderProfile?.uid,
    senderProfile?.signingPublicKey
  ]);

  useEffect(() => {
    const handleMedia = async () => {
      if (!message.media || !privateKey || !user || mediaUrl) return;
      
      setDecryptingMedia(true);
      try {
        const wrappedKey = message.wrappedKeys?.[user.uid];
        if (!wrappedKey || !(message.media as any)?.base64Data) throw new Error("No media data for user");
        
        const aesKey = await unwrapAESKey(wrappedKey, privateKey);
        const blob = await decryptBase64File((message.media as any).base64Data, aesKey, message.media.type);
        
        setMediaUrl(URL.createObjectURL(blob));
      } catch (e) {
        console.error("Media decryption failed:", e);
      } finally {
        setDecryptingMedia(false);
      }
    };
    
    handleMedia();
    
    return () => {
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    };
  }, [message.id, !!message.media, privateKey, user?.uid]);

  const formatTime = (ts: any) => {
    if (!ts) return "";
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderTextWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.split(urlRegex).map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a 
            key={i} 
            href={part} 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ 
              color: isMe ? "rgba(255,255,255,0.9)" : "var(--primary)", 
              textDecoration: "underline",
              fontWeight: 600,
              wordBreak: "break-all"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  if (message.deleted) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`message-wrapper ${isSelected ? 'selected' : ''}`}
        onContextMenu={handleContextMenu}
        onClick={handleClick}
        style={{ 
          display: "flex", 
          flexDirection: "column", 
          alignItems: isMe ? "flex-end" : "flex-start",
          marginBottom: "1rem",
          width: "100%",
          padding: "8px 1.5rem",
          backgroundColor: isSelected ? "rgba(var(--primary-rgb), 0.1)" : "transparent",
          cursor: "pointer",
          transition: "all 0.2s"
        }}
      >
        <div className="message-bubble deleted" style={{ 
          padding: "0.75rem 1rem", 
          borderRadius: "12px", 
          border: "1px solid var(--border)", 
          background: "var(--glass)", 
          fontStyle: "italic", 
          color: "var(--text-muted)", 
          fontSize: "0.875rem" 
        }}>
          Message deleted
        </div>
      </motion.div>
    );
  }

  // Filter out messages that don't match the search query
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    const textMatch = decryptedText && decryptedText.toLowerCase().includes(query);
    const mediaMatch = message.media?.name && message.media.name.toLowerCase().includes(query);
    if (!textMatch && !mediaMatch) return null;
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring" as const, stiffness: 400, damping: 25 }}
      className={`message-wrapper ${isSelected ? 'selected' : ''} ${isMe ? 'me' : 'them'}`}
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={endPress}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      style={{ 
        display: "flex", 
        flexDirection: "column", 
        alignItems: isMe ? "flex-end" : "flex-start",
        marginBottom: "1rem",
        width: "100%",
        padding: "4px 1.5rem",
        backgroundColor: isSelected ? "rgba(var(--primary-rgb), 0.1)" : "transparent",
        cursor: "pointer",
        transition: "background-color 0.2s"
      }}
    >
      <div 
        className="message-content-wrapper"
        style={{ 
          display: "flex", 
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: isMe ? "flex-end" : "flex-start",
          gap: "8px",
          maxWidth: "85%"
        }}
      >
        {!isMe && (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="sender-avatar" 
            style={{ 
              width: "32px", 
              height: "32px", 
              borderRadius: "50%", 
              background: "var(--primary)", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              fontSize: "0.75rem",
              fontWeight: "bold",
              overflow: "hidden",
              flexShrink: 0,
              marginBottom: "4px",
              color: "white",
              border: "1px solid var(--border)"
            }}
          >
            {senderProfile?.avatar ? <img src={senderProfile.avatar} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : senderProfile?.username?.[0].toUpperCase()}
          </motion.div>
        )}
        
        <div 
          className="bubble-and-selection"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px"
          }}
        >
          <AnimatePresence>
            {isSelected && isMe && (
              <motion.div 
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                className="selection-indicator"
              >
                <CheckCircle2 size={18} color="var(--primary)" fill="currentColor" style={{ color: "var(--bg-card)" }} />
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div 
            className="message-bubble" 
            whileHover={{ y: -2 }}
            style={{
              padding: "0.8rem 1rem",
              borderRadius: "18px",
              backgroundColor: isMe ? "var(--primary)" : "var(--bg-card)",
              color: isMe ? "white" : "var(--text-main)",
              borderBottomRightRadius: isMe ? "4px" : "18px",
              borderBottomLeftRadius: isMe ? "18px" : "4px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              border: "1px solid var(--border)",
              position: "relative",
              minWidth: "60px"
            }}
          >
            {repliedMessage && (
              <div 
                style={{ 
                  background: isMe ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.05)",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  marginBottom: "8px",
                  borderLeft: `3px solid ${isMe ? "white" : "var(--primary)"}`,
                  fontSize: "0.8rem",
                  opacity: 0.9,
                  maxWidth: "100%",
                  cursor: "pointer"
                }}
              >
                <div style={{ fontWeight: 600, color: isMe ? "white" : "var(--primary)", marginBottom: "2px" }}>
                  {repliedMessage.sender}
                </div>
                <div style={{ 
                  whiteSpace: "nowrap", 
                  overflow: "hidden", 
                  textOverflow: "ellipsis",
                  color: isMe ? "rgba(255,255,255,0.8)" : "var(--text-muted)"
                }}>
                  {repliedMessage.text}
                </div>
              </div>
            )}
            
            {decryptedText ? (
              <p style={{ wordBreak: "break-word", fontSize: "0.9375rem", color: "inherit", whiteSpace: "pre-wrap", margin: 0 }}>
                {renderTextWithLinks(decryptedText)}
                {message.edited && (
                  <span style={{ fontSize: "0.65rem", opacity: 0.6, marginLeft: "8px" }}>(edited)</span>
                )}
              </p>
            ) : message.media ? (
              <div className="media-container" style={{ 
                minWidth: "180px",
                padding: "3px",
                background: "rgba(255,255,255,0.02)",
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.08)"
              }}>
                {decryptingMedia ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "20px" }}>
                    <div className="shimmer" style={{ width: "40px", height: "40px", borderRadius: "10px", background: "rgba(255,255,255,0.1)" }} />
                    <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>Decrypting Secure Data...</span>
                  </div>
                ) : mediaUrl ? (
                  message.media.type.startsWith('audio/') ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px", borderRadius: "12px", background: "rgba(255,255,255,0.05)", minWidth: "220px" }}>
                      <audio 
                        ref={audioRef}
                        controls 
                        src={mediaUrl} 
                        style={{ height: "30px", width: "100%", outline: "none" }} 
                        onClick={e => e.stopPropagation()} 
                      />
                      <motion.button
                        whileHover={{ scale: 1.1, background: 'rgba(255,255,255,0.2)' }}
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const speeds = [1, 1.5, 2, 3];
                          const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
                          const newSpeed = speeds[nextIndex];
                          setPlaybackSpeed(newSpeed);
                          if (audioRef.current) {
                            audioRef.current.playbackRate = newSpeed;
                          }
                        }}
                        style={{ 
                          background: 'rgba(255,255,255,0.1)', 
                          color: 'white', 
                          border: 'none', 
                          borderRadius: '8px', 
                          padding: '4px 8px', 
                          fontSize: '11px', 
                          fontWeight: '800',
                          cursor: 'pointer',
                          minWidth: '40px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {playbackSpeed}x
                      </motion.button>
                    </div>
                  ) : message.media.type.startsWith('image/') ? (
                    <div style={{ position: 'relative' }}>
                      <motion.img 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        src={mediaUrl} 
                        alt={message.media.name} 
                        style={{ maxWidth: "100%", borderRadius: "12px", display: "block", cursor: "zoom-in", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}
                        onClick={(e) => { e.stopPropagation(); if (onOpenMedia) onOpenMedia(mediaUrl); }}
                      />
                      <div style={{ 
                        position: 'absolute', 
                        bottom: '8px', 
                        right: '8px', 
                        background: 'rgba(0,0,0,0.5)', 
                        backdropFilter: 'blur(4px)',
                        padding: '2px 8px',
                        borderRadius: '100px',
                        fontSize: '9px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: 'white',
                        border: '1px solid rgba(255,255,255,0.1)'
                      }}>
                        <Shield size={10} color="#10b981" /> Decrypted
                      </div>
                    </div>
                  ) : (
                    <div className="file-card glass" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", borderRadius: "12px" }}>
                      <div style={{ background: "rgba(var(--primary-rgb), 0.2)", padding: "12px", borderRadius: "12px", color: "var(--primary)" }}>
                        <FileText size={24} />
                      </div>
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <p style={{ fontSize: "0.85rem", fontWeight: 700, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {message.media.name}
                        </p>
                        <p style={{ fontSize: "0.7rem", opacity: 0.6, margin: 0 }}>
                          {(message.media.size / 1024).toFixed(1)} KB • Encrypted File
                        </p>
                      </div>
                      <a 
                        href={mediaUrl} 
                        download={message.media.name} 
                        onClick={e => e.stopPropagation()}
                        style={{ background: 'rgba(255,255,255,0.1)', color: "inherit", padding: "10px", borderRadius: "10px", display: "flex" }}
                      >
                        <Download size={20} />
                      </a>
                    </div>
                  )
                ) : (
                  <div style={{ padding: "20px", textAlign: "center", opacity: 0.5, fontSize: "0.8rem" }}>
                    Failed to verify media integrity
                  </div>
                )}
              </div>
            ) : error ? (
              <p style={{ color: "var(--error)", fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "6px", margin: 0 }}>
                <Shield size={14} /> Decryption Failed
              </p>
            ) : (
              <div style={{ display: "flex", gap: "4px", padding: "4px 0" }}>
                <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1 }} style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
              </div>
            )}
            
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "flex-end", 
              gap: "6px", 
              marginTop: "4px",
              fontSize: "0.65rem",
              color: isMe ? "rgba(255,255,255,0.7)" : "var(--text-muted)"
            }}>
              {isVerified ? (
                <div style={{ display: "flex", alignItems: "center", gap: "2px", color: isMe ? "#4ade80" : "var(--accent)" }}>
                  <ShieldCheck size={10} />
                  <span style={{ fontWeight: 600 }}>Verified</span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                  <Shield size={10} />
                  <span>E2EE</span>
                </div>
              )}
              {isMe && (
                <div style={{ marginLeft: "2px" }}>
                  {message.read ? (
                    <CheckCheck size={14} color="#60a5fa" strokeWidth={3} />
                  ) : (
                    <Check size={14} strokeWidth={3} />
                  )}
                </div>
              )}
              <span style={{ opacity: 0.5 }}>•</span>
              <span>{formatTime(message.timestamp)}</span>
            </div>

            {/* Reactions */}
            {message.reactions && Object.keys(message.reactions).length > 0 && (
              <div style={{ 
                display: "flex", 
                flexWrap: "wrap", 
                gap: "4px", 
                marginTop: "8px",
                position: "absolute",
                bottom: "-12px",
                right: isMe ? "4px" : "auto",
                left: isMe ? "auto" : "4px"
              }}>
                {Object.entries(message.reactions).map(([emoji, uids]) => {
                  const count = Object.keys(uids).length;
                  const reacted = user && uids[user.uid];
                  return (
                    <motion.div 
                      key={emoji}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => { e.stopPropagation(); onReaction?.(emoji); }}
                      style={{ 
                        background: "var(--bg-card)", 
                        border: `1px solid ${reacted ? "var(--primary)" : "var(--border)"}`,
                        borderRadius: "12px",
                        padding: "2px 6px",
                        fontSize: "0.75rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                        cursor: "pointer"
                      }}
                    >
                      <span>{emoji}</span>
                      {count > 1 && <span style={{ fontWeight: 600 }}>{count}</span>}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>

          <AnimatePresence>
            {isSelected && !isMe && (
              <motion.div 
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                className="selection-indicator"
              >
                <CheckCircle2 size={18} color="var(--primary)" fill="currentColor" style={{ color: "var(--bg-card)" }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};

// Performance Optimization: Use memo with deep comparison for the message object
// to prevent unnecessary re-renders when the list is refreshed from RTDB.
export default React.memo(MessageBubble, (prev, next) => {
  return (
    prev.message.id === next.message.id &&
    prev.message.ciphertext === next.message.ciphertext &&
    prev.message.signature === next.message.signature &&
    prev.message.deleted === next.message.deleted &&
    prev.message.read === next.message.read &&
    prev.message.edited === next.message.edited &&
    JSON.stringify(prev.message.reactions) === JSON.stringify(next.message.reactions) &&
    prev.isSelected === next.isSelected &&
    prev.searchQuery === next.searchQuery &&
    prev.senderProfile?.uid === next.senderProfile?.uid &&
    prev.senderProfile?.status === next.senderProfile?.status
  );
});
