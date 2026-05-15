import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Phone, Video, Send,
  Shield, X, Mic, Trash2, Search, Pin
} from "lucide-react";
import CustomEmojiPicker from "./CustomEmojiPicker";
import { useAuth } from "../../context/AuthContext";
import { useCrypto } from "../../context/CryptoContext";
import {
  sendMessage,
  getOrCreateChat,
  subscribeToMessages,
  markAsRead,
  markMessageAsRead,
  toggleReaction,
  editMessage,
  setTypingStatus,
  deleteForMe,
  deleteForEveryone,
  setChatWallpaper,
  pinMessage,
  sendMediaMessage
} from "../../services/chatService";
import { rtdb } from "../../services/firebase";
import { ref, onValue } from "firebase/database";
import { transferService, type TransferSession } from "../../services/transferService";
import MessageBubble from "./MessageBubble";
import ActionToolbar from "./ActionToolbar";
import { prepareEncryptedFile } from "../../services/mediaService";
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const [activeWallpaper, setActiveWallpaper] = useState<string | null>(null);
  const [wpPosition, setWpPosition] = useState("center");
  const [wpSize, setWpSize] = useState("cover");
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const [adjustingWallpaper, setAdjustingWallpaper] = useState<string | null>(null);
  const [wallpaperZoom, setWallpaperZoom] = useState(150);
  const [wallpaperPos, setWallpaperPos] = useState({ x: 50, y: 50 });
  const [isDraggingWp, setIsDraggingWp] = useState(false);
  const wpAdjustRef = useRef<HTMLDivElement>(null);

  // Fix onWheel event for wallpaper adjustment (preventing whole page zoom)
  useEffect(() => {
    const el = wpAdjustRef.current;
    if (!el) return;
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setWallpaperZoom(prev => Math.min(Math.max(prev - e.deltaY * 0.1, 20), 500));
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [adjustingWallpaper]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<any>(null);
  const prevMsgCount = useRef(0);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiToggleRef = useRef<HTMLButtonElement>(null);
  const profileCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user && recipient) {
      // Deterministic ID allows instant subscription without waiting for DB
      const id = [user.uid, recipient.uid].sort().join("_");
      setChatId(id);

      // Ensure metadata and Sequential Handshake happens in background
      getOrCreateChat(user.uid, recipient.uid);
    }
  }, [user, recipient]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!chatId || !user) return;

    const unsubscribe = subscribeToMessages(chatId, user.uid, (msgs) => {
      // Desktop Notification logic
      if (msgs.length > messages.length && messages.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg.senderId === recipient.uid && document.visibilityState === 'hidden') {
          if (Notification.permission === "granted") {
            new Notification(`New message from ${recipient.username}`, {
              body: "Encrypted message received",
              icon: recipient.avatar || "/favicon.ico"
            });
          }
        }
      }

      setMessages(msgs);
      markAsRead(chatId, user.uid);

      // Mark incoming messages as read
      msgs.forEach(msg => {
        if (msg.senderId === recipient.uid && !msg.read) {
          markMessageAsRead(chatId, msg.id);
        }
      });

      // Update wallpaper from summary (handled by separate listener)
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

    const chatSummaryRef = ref(rtdb, `user-chats/${user.uid}/${chatId}/summary`);
    const unsubscribeSummary = onValue(chatSummaryRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setActiveWallpaper(data.wallpaper || null);
        setWpPosition(data.wallpaperPosition || "center");
        setWpSize(data.wallpaperSize || "cover");
        setPinnedMessageId(data.pinnedMessageId || null);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeTyping();
      unsubscribeTransfers();
      unsubscribeSummary();
    };
  }, [chatId, user, recipient.uid]);

  // Generalized Click outside to close overlays
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Emoji Picker
      if (showEmojiPicker && emojiPickerRef.current && !emojiPickerRef.current.contains(target) &&
        emojiToggleRef.current && !emojiToggleRef.current.contains(target)) {
        setShowEmojiPicker(false);
      }

      // Profile Modal
      if (showProfile && profileCardRef.current && !profileCardRef.current.contains(target)) {
        setShowProfile(false);
      }

      // Wallpaper Picker
      if (showWallpaperPicker && target instanceof HTMLElement && !target.closest('.wallpaper-picker-overlay') && !emojiToggleRef.current?.contains(target)) {
        setShowWallpaperPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker, showProfile]);

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
        await transferService.startTransfer(user.uid, recipient.uid, file, (p: number) => {
          if (p === 100) setTimeout(() => setActiveTransfer(null), 2000);
        });
        return;
      }
    }

    setUploading(true);
    try {
      const { metadata, fileKey } = await prepareEncryptedFile(file);
      await sendMediaMessage(chatId, user.uid, recipient.uid, metadata, fileKey);
    } catch (err: any) {
      alert(`Transfer failed: ${err.message || "Unknown error"}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
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
        try {
          if (!chatId || !user || !signingPrivateKey) throw new Error("Missing credentials");
          const { metadata, fileKey } = await prepareEncryptedFile(file);
          await sendMediaMessage(chatId, user.uid, recipient.uid, metadata, fileKey);
        } catch (err: any) {
          alert(`Voice Note failed: ${err.message || "Unknown error"}`);
        } finally {
          setUploading(false);
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
    setSelectedMessageIds(prev => prev.includes(id) ? prev.filter(mid => mid !== id) : [...prev, id]);
  };

  const handlePinMessage = async () => {
    if (user && chatId && selectedMessageIds.length === 1) {
      await pinMessage(user.uid, chatId, selectedMessageIds[0]);
      setSelectedMessageIds([]);
    }
  };

  const handleUnpin = async () => {
    if (user && chatId) {
      await pinMessage(user.uid, chatId, null);
    }
  };

  const pinnedMsgData = pinnedMessageId ? messages.find(m => m.id === pinnedMessageId) : null;


  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="chat-window"
      style={{
        backgroundImage: activeWallpaper || (settings?.appearance?.wallpaper && settings.appearance.wallpaper !== 'default'
          ? settings.appearance.wallpaper
          : 'none'),
        backgroundSize: activeWallpaper ? wpSize : 'cover',
        backgroundPosition: activeWallpaper ? wpPosition : 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        backgroundColor: 'var(--bg-dark)'
      }}
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
                    setEditingMessage({ id: msg.id, text: msg.text || "" });
                    setInputText(msg.text || "");
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
                  setSelectedMessageIds([]);
                }}
                onPin={handlePinMessage}
              />
            </motion.div>
          ) : (
            <motion.header
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="chat-header"
              style={{
                padding: '0 1.5rem',
                height: '72px',
                borderBottom: '1px solid var(--border)',
                background: 'rgba(0, 0, 0, 0.2)',
                backdropFilter: 'blur(25px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                position: 'relative',
                zIndex: 100
              }}
            >
              {isSearching ? (
                <div className="search-bar-container" style={{ display: 'flex', alignItems: 'center', gap: '15px', width: '100%' }}>
                  <button onClick={() => { setIsSearching(false); setSearchQuery(""); }} style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
                    <ArrowLeft size={22} />
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
                      padding: '10px 18px',
                      color: 'var(--text-main)',
                      outline: 'none',
                      fontSize: '0.95rem'
                    }}
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>
                      <X size={18} />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => setShowProfile(true)}>
                    {onBack && (
                      <motion.button
                        whileHover={{ x: -3 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => { e.stopPropagation(); onBack(); }}
                        className="back-btn"
                        style={{ padding: '8px', marginLeft: '-8px', background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer' }}
                      >
                        <ArrowLeft size={22} />
                      </motion.button>
                    )}

                    <div style={{ position: 'relative' }}>
                      <div className="avatar" style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', color: 'white', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        {recipient?.avatar ? <img src={recipient.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>{recipient?.username?.[0]?.toUpperCase()}</span>}
                      </div>
                      {recipient?.status === 'online' && (
                        <div style={{ position: 'absolute', bottom: '1px', right: '1px', width: '12px', height: '12px', borderRadius: '50%', background: '#10b981', border: '2px solid var(--bg-dark)' }} />
                      )}
                    </div>

                    <div className="header-info">
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>{recipient?.username || "Secure User"}</h3>
                      <p className="status-text" style={{ margin: 0, fontSize: '0.75rem', color: recipient?.status === 'online' ? '#10b981' : 'var(--text-muted)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {recipient?.status === 'online' && (
                          <motion.span
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}
                          />
                        )}
                        {recipientTyping ? "typing..." : (recipient?.status === 'online' ? "Active now" : (recipient?.status === 'offline' ? "Offline" : recipient?.status || "Click for profile"))}
                      </p>
                    </div>
                  </div>

                  <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <motion.button
                      whileHover={{ scale: 1.05, background: 'var(--glass)' }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setIsSearching(true)}
                      style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}
                    >
                      <Search size={20} />
                    </motion.button>

                    <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />

                    <motion.button
                      whileHover={{ scale: 1.05, background: 'rgba(255,255,255,0.05)' }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowWallpaperPicker(!showWallpaperPicker)}
                      style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}
                      title="Chat Wallpaper"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                      </svg>
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.05, background: 'rgba(16, 185, 129, 0.1)' }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onInitiateCall({
                        type: 'audio',
                        recipientId: recipient.uid,
                        chatId: chatId,
                        recipientUsername: recipient.username,
                        recipientAvatar: recipient.avatar
                      })}
                      style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#10b981', border: 'none', cursor: 'pointer' }}
                    >
                      <Phone size={20} />
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.05, background: 'rgba(99, 102, 241, 0.1)' }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onInitiateCall({
                        type: 'video',
                        recipientId: recipient.uid,
                        chatId: chatId,
                        recipientUsername: recipient.username,
                        recipientAvatar: recipient.avatar
                      })}
                      style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--primary)', border: 'none', cursor: 'pointer' }}
                    >
                      <Video size={20} />
                    </motion.button>
                  </div>
                </>
              )}
            </motion.header>
          )}
        </AnimatePresence>
      </div>

      {/* Pinned Message Bar */}
      <AnimatePresence>
        {pinnedMsgData && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{
              background: 'var(--bg-card)',
              borderBottom: '1px solid var(--border)',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              zIndex: 10,
              cursor: 'pointer'
            }}
            onClick={() => {
              // Scroll to message logic could be added here
            }}
          >
            <Pin size={16} className="text-primary" style={{ color: 'var(--primary)' }} />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)' }}>Pinned Message</p>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {pinnedMsgData.text || (pinnedMsgData.media ? "Media file" : "Encrypted message")}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleUnpin(); }}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="messages-area"
        style={{
          background: 'transparent',
          flex: 1,
          overflowY: 'auto'
        }}
      >
        {(() => {
          // Optimization: Create a map for O(1) lookups of replied messages
          const messageMap = new Map(messages.map(m => [m.id, m]));

          return messages.map((msg) => {
            const repliedMsgData = msg.replyTo ? messageMap.get(msg.replyTo) : null;
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
          });
        })()}
        <div ref={bottomRef} />
      </div>

      <div className="input-area" style={{ position: 'relative' }}>
        <AnimatePresence>
          {recipientTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              style={{
                position: 'absolute',
                top: '-25px',
                left: '20px',
                padding: '2px 10px',
                fontSize: '0.7rem',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600,
                background: 'var(--bg-main)',
                borderRadius: '8px 8px 0 0',
                border: '1px solid var(--border)',
                borderBottom: 'none',
                zIndex: 5
              }}
            >
              <div style={{ display: 'flex', gap: '2px' }}>
                <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1 }} style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />
                <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />
                <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />
              </div>
              {recipient.username} is typing...
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showEmojiPicker && (
            <motion.div
              ref={emojiPickerRef}
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

        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="chat-input-container glass"
          style={{
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '24px',
            padding: '8px 12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backdropFilter: 'blur(20px)'
          }}
        >
          <button
            ref={emojiToggleRef}
            type="button"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#ffffff',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
              zIndex: 10,
              padding: 0,
              transition: 'all 0.2s'
            }}
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title="Emojis"
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
              <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>

          <button
            type="button"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#ffffff',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
              zIndex: 10,
              padding: 0,
              transition: 'all 0.2s'
            }}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.onchange = (e: any) => handleFileSelect(e);
              input.click();
            }}
            title="Attach File"
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.51a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          <AnimatePresence mode="wait">
            {isRecording ? (

              <motion.div
                key="recording-ui"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
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
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}
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
                className="chat-input"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  boxShadow: 'none',
                  padding: '10px 4px',
                  fontSize: '1rem'
                }}
              />
            )}
          </AnimatePresence>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
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
                  if (!isRecording) stopRecording();
                }}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                animate={isRecording ? { scale: 1.2, boxShadow: "0 0 30px rgba(236, 72, 153, 0.4)" } : {}}
                style={{
                  background: 'linear-gradient(135deg, #ec4899, #db2777)',
                  color: 'white',
                  borderRadius: '50%',
                  width: '46px',
                  height: '46px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: 'none',
                  zIndex: 10,
                  boxShadow: '0 4px 12px rgba(236, 72, 153, 0.3)'
                }}
              >
                <Mic size={22} />
              </motion.button>
            )}

            {inputText.trim() !== "" && !isRecording && (
              <motion.button
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                whileHover={{ scale: 1.1, x: 2 }}
                whileTap={{ scale: 0.9 }}
                type="submit"
                className="send-btn"
                style={{
                  background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
                  color: 'white',
                  borderRadius: '50%',
                  width: '46px',
                  height: '46px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(var(--primary-rgb), 0.3)'
                }}
              >
                <Send size={22} />
              </motion.button>
            )}
          </div>
        </form>
      </div>

      <AnimatePresence>
        {showWallpaperPicker && (
          <div
            className="wallpaper-picker-overlay"
            onClick={() => setShowWallpaperPicker(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ background: 'var(--bg-card)', padding: '24px', borderRadius: '24px', width: '90%', maxWidth: '400px', border: '1px solid var(--border)' }}
            >
              <h3 style={{ margin: '0 0 20px 0', textAlign: 'center' }}>Chat Wallpaper</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{ 
                    padding: '12px', 
                    borderRadius: '12px', 
                    background: 'var(--primary)', 
                    color: 'white', 
                    border: 'none', 
                    cursor: 'pointer', 
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Upload Custom Image
                </button>

                <input 
                  type="file" 
                  ref={fileInputRef} 
                  hidden 
                  accept="image/*" 
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file && user && chatId) {
                      const reader = new FileReader();
                      reader.onloadend = async () => {
                        const base64 = reader.result as string;
                        setAdjustingWallpaper(base64);
                      };
                      reader.readAsDataURL(file);
                    }
                    setShowWallpaperPicker(false);
                  }} 
                />

                <button
                  onClick={async () => {
                    if (user && chatId) {
                      setActiveWallpaper(null);
                      await setChatWallpaper(user.uid, chatId, "");
                    }
                    setShowWallpaperPicker(false);
                  }}
                  style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', border: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  Remove Wallpaper
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProfile && (
          <div
            className="profile-overlay"
            onClick={() => setShowProfile(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          >
            <motion.div
              ref={profileCardRef}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="glass profile-card"
              onClick={e => e.stopPropagation()}
              style={{ background: 'var(--bg-card)', borderRadius: '24px', width: '90%', maxWidth: '360px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' }}
            >
              {/* Header Banner */}
              <div style={{ width: '100%', height: '120px', background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))', position: 'relative' }}>
                <button
                  onClick={() => setShowProfile(false)}
                  style={{
                    position: 'absolute',
                    top: '15px',
                    right: '15px',
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none',
                    color: 'white',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 20,
                    transition: 'all 0.2s',
                    backdropFilter: 'blur(4px)'
                  }}
                >
                  <img
                    src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='18' y1='6' x2='6' y2='18'%3E%3C/line%3E%3Cline x1='6' y1='6' x2='18' y2='18'%3E%3C/line%3E%3C/svg%3E"
                    width="24"
                    height="24"
                    alt="X"
                  />                 </button>
              </div>

              <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'var(--bg-card)', marginTop: '-50px', border: '4px solid var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 'bold', color: 'white', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 10 }}>
                {recipient?.avatar ? <img src={recipient.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (recipient?.username?.[0]?.toUpperCase() || "S")}
              </div>

              <div style={{ padding: '20px 30px 30px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>


                <h2 style={{ margin: '0 0 5px 0', color: 'var(--text-main)', fontSize: '1.5rem' }}>{recipient.username}</h2>
                <p style={{ margin: '0 0 20px 0', color: recipient?.status === 'online' ? '#10b981' : 'var(--text-muted)', fontSize: '0.9rem', fontWeight: recipient?.status === 'online' ? 600 : 400 }}>
                  {recipient?.status === 'online' || recipient?.status === 'offline' ? recipient.status.charAt(0).toUpperCase() + recipient.status.slice(1) : "Online"}
                </p>

                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '12px', padding: '15px', width: '100%', marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Bio</h4>
                  <p style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.95rem', lineHeight: 1.5, textAlign: 'center' }}>
                    {recipient?.bio || (recipient?.status && recipient.status !== 'online' && recipient.status !== 'offline' ? recipient.status : "No bio available.")}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>
                  <Shield size={16} />
                  <span>End-to-End Encrypted</span>
                </div>
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
      <AnimatePresence>
        {adjustingWallpaper && (
          <div 
            className="wallpaper-adjust-overlay"
            style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(15px)' }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{ background: 'var(--bg-card)', padding: '30px', borderRadius: '32px', width: '95%', maxWidth: '600px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '20px' }}
            >
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: 0 }}>Customize Background</h3>
                <p style={{ margin: '5px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Drag to move • Scroll to zoom</p>
              </div>
              
              <div 
                ref={wpAdjustRef}
                style={{ 
                  width: '100%', 
                  height: '350px', 
                  borderRadius: '20px', 
                  overflow: 'hidden', 
                  position: 'relative',
                  background: '#000',
                  cursor: isDraggingWp ? 'grabbing' : 'grab',
                  touchAction: 'none'
                }}
                onMouseDown={() => setIsDraggingWp(true)}
                onMouseUp={() => setIsDraggingWp(false)}
                onMouseLeave={() => setIsDraggingWp(false)}
                onMouseMove={(e) => {
                  if (isDraggingWp) {
                    setWallpaperPos(prev => ({
                      x: Math.min(Math.max(prev.x + e.movementX * 0.2, 0), 100),
                      y: Math.min(Math.max(prev.y + e.movementY * 0.2, 0), 100)
                    }));
                  }
                }}
              >
                {/* Background Image */}
                <div style={{ 
                  width: '100%', 
                  height: '100%', 
                  backgroundImage: `url(${adjustingWallpaper})`,
                  backgroundSize: `${wallpaperZoom}%`,
                  backgroundPosition: `${wallpaperPos.x}% ${wallpaperPos.y}%`,
                  backgroundRepeat: 'no-repeat',
                  pointerEvents: 'none'
                }} />

                {/* Mask Overlay with Hole (The White Box - representing chat aspect ratio) */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  border: '3px solid rgba(255,255,255,1)', // The "White Box"
                  margin: '20px 80px', // More vertical and taller
                  borderRadius: '24px',
                  boxShadow: '0 0 20px rgba(0,0,0,0.5), 0 0 0 400px rgba(0,0,0,0.6)'
                }} />
                
                {/* Mock UI for context (inside the white box area) */}
                <div style={{ position: 'absolute', top: '35px', left: '95px', right: '95px', display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
                   <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                   <div style={{ width: '80px', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.3)', marginTop: '12px' }} />
                   <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                </div>
                
                <div style={{ position: 'absolute', bottom: '100px', left: '95px', padding: '10px 14px', background: 'rgba(255,255,255,0.1)', borderRadius: '14px 14px 14px 4px', fontSize: '0.75rem', color: 'white', maxWidth: '120px', pointerEvents: 'none' }}>
                  Previewing... 💬
                </div>

                <div style={{ position: 'absolute', bottom: '45px', right: '95px', padding: '12px 18px', background: 'var(--primary)', borderRadius: '18px 18px 4px 18px', fontSize: '0.8rem', color: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
                  Looks perfect! 📸
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => {
                    setAdjustingWallpaper(null);
                    setWallpaperZoom(100);
                    setWallpaperPos({ x: 50, y: 50 });
                  }}
                  style={{ flex: 1, padding: '14px', borderRadius: '14px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', border: '1px solid var(--border)', cursor: 'pointer', fontWeight: '600' }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (user && chatId && adjustingWallpaper) {
                      const pos = `${wallpaperPos.x}% ${wallpaperPos.y}%`;
                      const size = `${wallpaperZoom}%`;
                      setActiveWallpaper(`url(${adjustingWallpaper})`);
                      setWpPosition(pos);
                      setWpSize(size);
                      await setChatWallpaper(user.uid, chatId, `url(${adjustingWallpaper})`, pos, size);
                    }
                    setAdjustingWallpaper(null);
                  }}
                  style={{ flex: 1, padding: '14px', borderRadius: '14px', background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
                >
                  Apply & Save
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.main>
  );
};

export default ChatWindow;
