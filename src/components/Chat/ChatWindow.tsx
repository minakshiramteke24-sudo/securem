import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, Phone, Video, Send, Paperclip, 
  Shield, Loader2, Smile, X, Mic, Trash2, Search
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
  const { user, profile, settings } = useAuth();
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
  const prevMsgCount = useRef(0);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
    if (messages.length > prevMsgCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCount.current = messages.length;
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
      const stream = mediaRecorderRef.current.stream;
      mediaRecorderRef.current.stop();
      stream.getTracks().forEach(track => track.stop());
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

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
              {isSearching ? (
                <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '10px' }}>
                  <button onClick={() => { setIsSearching(false); setSearchQuery(""); }} style={{ background: 'transparent', color: 'var(--text-muted)' }}>
                    <ArrowLeft size={20} />
                  </button>
                  <input 
                    autoFocus
                    type="text" 
                    placeholder="Search in conversation..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ 
                      flex: 1, 
                      background: 'rgba(255,255,255,0.05)', 
                      border: '1px solid var(--border)', 
                      borderRadius: '12px', 
                      padding: '8px 15px', 
                      color: 'var(--text-main)',
                      outline: 'none'
                    }}
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} style={{ background: 'transparent', color: 'var(--text-muted)' }}>
                      <X size={16} />
                    </button>
                  )}
                </div>
              ) : (
                <>
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
                    <button onClick={() => setIsSearching(true)}><Search size={20} /></button>
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
                </>
              )}
            </motion.header>
          )}
        </AnimatePresence>
      </div>

      <div 
        className="messages-area" 
        style={{ 
          background: settings?.appearance?.wallpaper && settings.appearance.wallpaper !== 'default' 
            ? settings.appearance.wallpaper 
            : undefined 
        }}
      >
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
              searchQuery={searchQuery}
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
          
          <AnimatePresence mode="wait">
            {isRecording ? (
              <motion.div 
                key="recording-bar"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '15px', 
                  padding: '0 15px', 
                  background: 'transparent', 
                  flex: 1,
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <motion.button
                    whileHover={{ scale: 1.1, color: '#ef4444' }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (mediaRecorderRef.current) {
                        const stream = mediaRecorderRef.current.stream;
                        mediaRecorderRef.current.onstop = null;
                        mediaRecorderRef.current.stop();
                        stream.getTracks().forEach(track => track.stop());
                      }
                      setIsRecording(false);
                      setRecordingDuration(0);
                    }}
                    style={{ background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: '600' }}
                  >
                    <Trash2 size={18} />
                    Cancel
                  </motion.button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <motion.div 
                      animate={{ opacity: [1, 0, 1] }} 
                      transition={{ repeat: Infinity, duration: 1.2 }}
                    >
                      <Mic size={18} color="#ef4444" />
                    </motion.div>
                    <span style={{ color: 'var(--text-main)', fontWeight: '700', fontSize: '1rem', fontVariantNumeric: 'tabular-nums' }}>
                      {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>

                <motion.div 
                  animate={{ x: [-5, 5, -5] }} 
                  transition={{ repeat: Infinity, duration: 2 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.9rem' }}
                >
                  <ArrowLeft size={14} />
                  <span>Slide to cancel</span>
                </motion.div>
              </motion.div>
            ) : (
              <motion.input
                key="chat-input"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                ref={inputRef}
                type="text"
                placeholder="Type a secure message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                className="chat-input"
                style={{ flex: 1 }}
              />
            )}
          </AnimatePresence>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {(inputText.trim() === "" || isRecording) && (
              <motion.button 
                type="button" 
                className="send-btn" 
                drag={isRecording ? "x" : false}
                dragConstraints={{ left: -200, right: 0 }}
                dragElastic={0.1}
                onDrag={(_, info) => {
                  if (info.offset.x < -120) {
                    if (mediaRecorderRef.current) {
                      const stream = mediaRecorderRef.current.stream;
                      mediaRecorderRef.current.onstop = null;
                      mediaRecorderRef.current.stop();
                      stream.getTracks().forEach(track => track.stop());
                    }
                    setIsRecording(false);
                    setRecordingDuration(0);
                  }
                }}
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={() => {
                  // Only stop if not dragging
                  if (!isRecording) stopRecording();
                }}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                animate={isRecording ? { scale: 1.2, boxShadow: "0 0 30px rgba(236, 72, 153, 0.4)" } : {}}
                style={{ 
                  background: '#ec4899', 
                  color: 'white', 
                  borderRadius: '50%', 
                  width: '52px', 
                  height: '52px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: 'none',
                  zIndex: 10
                }}
              >
                <Mic size={24} />
              </motion.button>
            )}

            {inputText.trim() !== "" && !isRecording && (
              <motion.button 
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                whileHover={{ scale: 1.1, x: 5 }}
                whileTap={{ scale: 0.9 }}
                type="submit" 
                onClick={handleSend}
                className="send-btn" 
                style={{ background: 'var(--primary)', color: 'white', borderRadius: '50%', width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none' }}
              >
                <Send size={24} />
              </motion.button>
            )}
          </div>
        </form>
      </div>

      <AnimatePresence>
        {showProfile && (
          <div 
            className="profile-overlay" 
            onClick={() => setShowProfile(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass profile-card" 
              onClick={e => e.stopPropagation()}
              style={{ background: 'var(--bg-card)', borderRadius: '24px', padding: '30px', width: '90%', maxWidth: '360px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
               <button 
                 onClick={() => setShowProfile(false)}
                 style={{ position: 'absolute', top: '15px', right: '15px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}
               >
                 <X size={18} strokeWidth={2.5} color="#ffffff" />
               </button>
               
               {/* Cover Photo Area */}
               <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '120px', background: 'linear-gradient(135deg, var(--primary), #818cf8)', opacity: 0.8, borderTopLeftRadius: '24px', borderTopRightRadius: '24px' }} />
               
               <div style={{ position: 'relative', width: '110px', height: '110px', borderRadius: '50%', background: 'var(--bg-card)', padding: '6px', marginTop: '40px', marginBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }}>
                 <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 'bold', color: 'white', overflow: 'hidden' }}>
                   {recipient?.avatar ? <img src={recipient.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : recipient?.username?.[0]?.toUpperCase()}
                 </div>
               </div>
               
               <h2 style={{ margin: '0 0 4px 0', color: 'var(--text-main)', fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.5px' }}>{recipient.username}</h2>
               
               <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '24px' }}>
                 <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)' }} />
                 <span style={{ color: '#10b981', fontSize: '0.9rem', fontWeight: 600 }}>Online</span>
               </div>
               
               <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px', width: '100%', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                 <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>About</span>
                 <p style={{ margin: 0, color: 'rgba(255,255,255,0.9)', fontSize: '1rem', lineHeight: 1.6, textAlign: 'left', wordBreak: 'break-word' }}>
                   {recipient?.bio || (recipient?.status && recipient.status !== 'online' && recipient.status !== 'offline' ? recipient.status : "Hey there! I am using Securem.")}
                 </p>
               </div>
               
               <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500, background: 'rgba(255,255,255,0.02)', padding: '10px 16px', borderRadius: '100px' }}>
                 <ShieldCheck size={16} color="#10b981" /> 
                 <span>Verified End-to-End Encrypted</span>
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
            className="lightbox-overlay"
            onClick={() => setLightboxUrl(null)}
            style={{ 
              position: 'fixed', 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0, 
              background: 'rgba(0,0,0,0.95)', 
              backdropFilter: 'blur(15px)',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              zIndex: 9999,
              padding: '40px'
            }}
          >
            <motion.img 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              src={lightboxUrl} 
              alt="Fullscreen" 
              style={{ 
                maxWidth: '100%', 
                maxHeight: '100%', 
                borderRadius: '12px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                objectFit: 'contain'
              }} 
            />
            <button 
              onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}
              style={{ 
                position: 'absolute', 
                top: '20px', 
                right: '20px', 
                background: 'rgba(255,255,255,0.1)', 
                border: 'none', 
                color: 'white', 
                width: '40px', 
                height: '40px', 
                borderRadius: '50%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={24} />
            </button>
          </motion.div>,
          document.body
        )}
      </AnimatePresence>
    </motion.main>
  );
};

export default ChatWindow;
