import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, Phone, Video, Send, Paperclip, 
  Shield, Loader2, Smile, X, Mic
} from "lucide-react";
import CustomEmojiPicker from "./CustomEmojiPicker";
import { useAuth } from "../../context/AuthContext";
import { useCrypto } from "../../context/CryptoContext";
import { 
  sendMessage, 
  getOrCreateChat, 
  subscribeToMessages, 
  markAsRead,
  toggleReaction,
  editMessage,
  setTypingStatus,
  deleteForMe,
  deleteForEveryone
} from "../../services/chatService";
import { rtdb } from "../../services/firebase";
import { ref, onValue } from "firebase/database";
import MessageBubble from "./MessageBubble";
import ActionToolbar from "./ActionToolbar";
import { prepareEncryptedFile } from "../../services/mediaService";
import { sendMediaMessage } from "../../services/chatService";
import { transferService, type TransferSession } from "../../services/transferService";
import TransferOverlay from "./TransferOverlay";

interface ChatWindowProps {
  recipient: any;
  onInitiateCall: (callData: any) => void;
  onBack?: () => void;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ recipient, onInitiateCall, onBack }) => {
  const { user, profile } = useAuth();
  const { signingPrivateKey } = useCrypto();
  
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [chatId, setChatId] = useState<string | null>(null);
  const [recipientTyping, setRecipientTyping] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [editingMessage, setEditingMessage] = useState<{ id: string, text: string } | null>(null);
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeTransfer, setActiveTransfer] = useState<TransferSession | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<any>(null);

  useEffect(() => {
    const initChat = async () => {
      if (user && recipient) {
        const id = await getOrCreateChat(user.uid, recipient.uid);
        setChatId(id);
      }
    };
    initChat();
  }, [user, recipient]);

  useEffect(() => {
    if (!chatId || !user) return;

    const unsubscribe = subscribeToMessages(chatId, user.uid, (msgs) => {
      setMessages(msgs);
      markAsRead(chatId, user.uid);
    });

    const typingRef = ref(rtdb, `typing/${chatId}/${recipient.uid}`);
    const unsubscribeTyping = onValue(typingRef, (snap) => {
      setRecipientTyping(snap.val() === true);
    });

    const transferRef = ref(rtdb, `transfers/${user.uid}`);
    const unsubscribeTransfers = onValue(transferRef, (snap) => {
      if (snap.exists()) {
        const sessions = Object.values(snap.val()) as TransferSession[];
        const pending = sessions.find(s => s.status === 'requesting');
        if (pending) setActiveTransfer(pending);
      }
    });
    
    return () => {
      unsubscribe();
      unsubscribeTyping();
      unsubscribeTransfers();
    };
  }, [chatId, user, recipient.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, recipientTyping]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !user || !chatId || !signingPrivateKey || uploading) return;

    if (editingMessage) {
      try {
        await editMessage(chatId, editingMessage.id, user.uid, recipient.uid, inputText, signingPrivateKey);
        setEditingMessage(null);
        setInputText("");
      } catch (err) {
        alert("Failed to edit message");
      }
      return;
    }

    try {
      await sendMessage(chatId, user.uid, recipient.uid, inputText, signingPrivateKey, replyingTo?.id);
      setInputText("");
      setReplyingTo(null);
      setTypingStatus(chatId, user.uid, false);
    } catch (err) {
      alert("Failed to send message");
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chatId || !user || !signingPrivateKey) return;

    if (file.size > 5 * 1024 * 1024) {
      if (window.confirm("File is over 5MB. Switch to Secure P2P Direct Transfer?")) {
        setActiveTransfer({
          id: 'local',
          senderId: user.uid,
          recipientId: recipient.uid,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          status: 'transferring'
        });
        await transferService.startTransfer(user.uid, recipient.uid, file, (p) => {
          if (p === 100) setTimeout(() => setActiveTransfer(null), 2000);
        });
        return;
      }
    }

    setUploading(true);
    setUploadStatus("Encrypting...");
    try {
      const { metadata, fileKey } = await prepareEncryptedFile(file);
      setUploadStatus("Sending...");
      await sendMediaMessage(chatId, user.uid, recipient.uid, metadata, fileKey);
    } catch (err: any) {
      alert(`Transfer failed: ${err.message || "Unknown error"}`);
    } finally {
      setUploading(false);
      setUploadStatus(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access is required to send voice notes.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      clearInterval(recordingTimerRef.current);
      setIsRecording(false);
      
      mediaRecorderRef.current.onstop = async () => {
        if (audioChunksRef.current.length === 0 || recordingDuration < 1) return;
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], `VoiceNote_${Date.now()}.webm`, { type: 'audio/webm' });
        
        setUploading(true);
        setUploadStatus("Encrypting Voice Note...");
        try {
          if (!chatId || !user || !signingPrivateKey) throw new Error("Missing credentials");
          const { metadata, fileKey } = await prepareEncryptedFile(file);
          setUploadStatus("Sending...");
          await sendMediaMessage(chatId, user.uid, recipient.uid, metadata, fileKey);
        } catch (err: any) {
          alert(`Voice Note failed: ${err.message || "Unknown error"}`);
        } finally {
          setUploading(false);
          setUploadStatus(null);
        }
      };
    }
  };

  const handleSelectMessage = (id: string, _multi: boolean, _text?: string) => {
    // Selection logic
    setSelectedMessageIds(prev => prev.includes(id) ? prev.filter(mid => mid !== id) : [...prev, id]);
  };


  return (
    <motion.main 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="chat-window"
    >
      <div className="chat-top-bar">
        <AnimatePresence mode="wait">
          {selectedMessageIds.length > 0 ? (
            <motion.div key="toolbar" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} style={{ width: "100%", height: "100%" }}>
              <ActionToolbar 
                selectedCount={selectedMessageIds.length}
                onClose={() => setSelectedMessageIds([])}
                onDeleteForMe={() => {
                  if (!chatId || !user) return;
                  selectedMessageIds.forEach(id => deleteForMe(chatId, id, user.uid));
                  setSelectedMessageIds([]);
                }}
                onDeleteForEveryone={() => {
                  if (!chatId || !user) return;
                  if (window.confirm(`Delete ${selectedMessageIds.length} messages for everyone?`)) {
                    selectedMessageIds.forEach(id => deleteForEveryone(chatId, id, user.uid));
                    setSelectedMessageIds([]);
                  }
                }}
                onCopy={() => {
                  const texts = messages
                    .filter(m => selectedMessageIds.includes(m.id))
                    .map(m => m.text)
                    .join('\n');
                  navigator.clipboard.writeText(texts);
                }}
                canEdit={selectedMessageIds.length === 1 && messages.find(m => m.id === selectedMessageIds[0])?.senderId === user?.uid}
                canDeleteForEveryone={selectedMessageIds.every(id => messages.find(m => m.id === id)?.senderId === user?.uid)}
                onEdit={() => {
                  const msg = messages.find(m => m.id === selectedMessageIds[0]);
                  if (msg) {
                    setEditingMessage({ id: msg.id, text: msg.text });
                    setInputText(msg.text);
                    setSelectedMessageIds([]);
                  }
                }}
                onReply={() => {
                  const msg = messages.find(m => m.id === selectedMessageIds[0]);
                  if (msg) {
                    setReplyingTo(msg);
                    setSelectedMessageIds([]);
                  }
                }}
                onReact={(emoji) => {
                  if (!chatId || !user) return;
                  const msgId = selectedMessageIds[0];
                  if (msgId) {
                    toggleReaction(chatId, msgId, user.uid, emoji);
                  }
                }}
              />
            </motion.div>
          ) : (
            <motion.header key="header" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="chat-header">
              <div className="header-left" onClick={() => setShowProfile(true)} style={{ cursor: "pointer" }}>
                {onBack && (
                  <button className="back-btn" onClick={(e) => { e.stopPropagation(); onBack(); }}>
                    <ArrowLeft size={24} />
                  </button>
                )}
                <div className="avatar">
                  {recipient?.avatar ? <img src={recipient.avatar} alt="Avatar" /> : <span>{recipient?.username?.[0]?.toUpperCase()}</span>}
                </div>
                <div className="header-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3>{recipient?.username || "Secure User"}</h3>
                  </div>
                  <p className="status-text">{recipientTyping ? "typing..." : recipient?.status || "Online"}</p>
                </div>
              </div>
              <div className="header-actions">
                <button onClick={() => onInitiateCall({ 
                  type: 'audio', 
                  recipientId: recipient.uid,
                  chatId: chatId,
                  recipientUsername: recipient.username,
                  recipientAvatar: recipient.avatar
                })}><Phone size={20} /></button>
                <button onClick={() => onInitiateCall({ 
                  type: 'video', 
                  recipientId: recipient.uid,
                  chatId: chatId,
                  recipientUsername: recipient.username,
                  recipientAvatar: recipient.avatar
                })}><Video size={20} /></button>
              </div>
            </motion.header>
          )}
        </AnimatePresence>
      </div>

      <div className="messages-area">
        {messages.map((msg) => {
          const repliedMsgData = msg.replyTo ? messages.find(m => m.id === msg.replyTo) : null;
          const repliedMessage = repliedMsgData ? {
            sender: repliedMsgData.senderId === user?.uid ? "You" : (recipient?.username || "Secure User"),
            text: repliedMsgData.text || "Media file"
          } : null;

          return (
            <MessageBubble 
              key={msg.id} 
              message={msg} 
              senderProfile={msg.senderId === user?.uid ? profile : recipient}
              isSelected={selectedMessageIds.includes(msg.id)}
              onSelect={handleSelectMessage}
              onReaction={(emoji) => toggleReaction(chatId!, msg.id, user!.uid, emoji)}
              onOpenMedia={(url) => setLightboxUrl(url)}
              repliedMessage={repliedMessage}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="input-area">
        <AnimatePresence>
          {showEmojiPicker && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              style={{ position: 'absolute', bottom: '100%', left: '10px', zIndex: 1000, marginBottom: '10px' }}
            >
              <CustomEmojiPicker onEmojiSelect={(emoji) => {
                setInputText(prev => prev + emoji);
                inputRef.current?.focus();
              }} />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {replyingTo && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="reply-banner"
              style={{
                background: 'var(--bg-card)',
                padding: '8px 16px',
                borderRadius: '12px',
                marginBottom: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderLeft: '4px solid var(--primary)'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                  Replying to message
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', opacity: 0.8 }} className="truncate">
                  {replyingTo.text ? (replyingTo.text.length > 50 ? replyingTo.text.substring(0, 50) + '...' : replyingTo.text) : 'Media file'}
                </span>
              </div>
              <button 
                type="button" 
                onClick={() => setReplyingTo(null)}
                style={{ background: 'transparent', color: 'var(--text-muted)' }}
              >
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSend} className="chat-input-container">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()} 
              disabled={uploading}
              style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '15px', padding: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {uploading ? (
                <>
                  <Loader2 size={24} className="animate-spin" />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{uploadStatus}</span>
                </>
              ) : <Paperclip size={24} color="#a5b4fc" />}
            </button>
            <button 
              type="button" 
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '15px', padding: '12px' }}
            >
              <Smile size={24} color={showEmojiPicker ? '#6366f1' : '#fbbf24'} />
            </button>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} style={{ display: "none" }} />
          <input 
            ref={inputRef} 
            type="text" 
            className="chat-input" 
            placeholder="Type a secure message..." 
            value={inputText} 
            onChange={(e) => setInputText(e.target.value)} 
            onFocus={() => setShowEmojiPicker(false)}
            disabled={isRecording}
          />
          
          {inputText.trim() === "" && !isRecording ? (
            <button 
              type="button" 
              className="send-btn" 
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              style={{ background: '#ec4899', color: 'white', borderRadius: '50%', width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Mic size={22} />
            </button>
          ) : isRecording ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 10px' }}>
              <motion.div 
                animate={{ scale: [1, 1.2, 1] }} 
                transition={{ repeat: Infinity, duration: 1 }}
                style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }}
              />
              <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
              </span>
            </div>
          ) : (
            <button type="submit" className="send-btn" style={{ background: '#6366f1', color: 'white', borderRadius: '50%', width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={22} />
            </button>
          )}
        </form>
      </div>

      <AnimatePresence>
        {showProfile && (
          <div className="profile-overlay" onClick={() => setShowProfile(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="profile-card" onClick={e => e.stopPropagation()}>
               <div className="profile-header">
                 <h2>{recipient.username}</h2>
                 <button onClick={() => setShowProfile(false)}>×</button>
               </div>
               <div className="profile-body">
                 <p>{recipient.bio || "No bio available."}</p>
                 <div className="encryption-info"><Shield size={16} /> End-to-End Encrypted</div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <TransferOverlay activeSession={activeTransfer} onClose={() => setActiveTransfer(null)} />

      {/* MEDIA LIGHTBOX */}
      <AnimatePresence>
        {lightboxUrl && createPortal(
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 30000,
              background: 'rgba(0,0,0,0.95)',
              backdropFilter: 'blur(15px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'zoom-out',
              padding: '20px'
            }}
          >
            <motion.img 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={lightboxUrl} 
              alt="Full size" 
              style={{ 
                maxWidth: '95vw', 
                maxHeight: '90vh', 
                borderRadius: '16px',
                boxShadow: '0 30px 60px rgba(0,0,0,0.8)',
                objectFit: 'contain',
                border: '1px solid rgba(255,255,255,0.1)'
              }} 
            />
            <div 
              className="lightbox-close"
              onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}
              style={{ 
                position: 'absolute', 
                top: '30px', 
                right: '30px', 
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.3s ease'
              }}
            >
              <Shield size={32} style={{ opacity: 0.6 }} />
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.4 }}>Secure</span>
            </div>
          </motion.div>,
          document.body
        )}
      </AnimatePresence>
    </motion.main>
  );
};

export default ChatWindow;
