import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Trash2, Eye, Send, MessageCircle } from 'lucide-react';
import { type Story, deleteStory, markStoryAsSeen } from '../../services/storyService';
import { sendMessage } from '../../services/chatService';
import { useAuth } from '../../context/AuthContext';

// v2.4.4 BUILD 1757 - PREMIUM STORY VIEWER

interface StoryViewerProps {
  stories: Story[];
  initialIndex: number;
  onClose: () => void;
}

const StoryViewer: React.FC<StoryViewerProps> = ({ stories, initialIndex, onClose }) => {
  const { user } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [showViews, setShowViews] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const currentStory = stories[currentIndex];
  const isMine = user?.uid === currentStory?.uid;

  useEffect(() => {
    if (currentStory && user && !isMine) {
      markStoryAsSeen(currentStory.id, {
        uid: user.uid,
        username: user.displayName || "Secure User",
        avatar: user.photoURL || undefined
      });
    }
  }, [currentStory, user, isMine]);

  useEffect(() => {
    if (isPaused) return;
    
    setProgress(0);
    const duration = 5000; // 5 seconds per story
    const interval = 50;
    const step = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          handleNext();
          return 0;
        }
        return prev + step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [currentIndex, isPaused]);

  const handleNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleDelete = async () => {
    if (window.confirm("Permanently delete this story?")) {
      await deleteStory(currentStory.id);
      handleNext();
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !user || isSendingReply) return;
    
    setIsSendingReply(true);
    try {
      // Stories are ephemeral, replies go to chat
      await sendMessage("direct", user.uid, currentStory.uid, `Replied to your story: ${replyText}`);
      setReplyText("");
      alert("Reply sent!");
    } catch (e) {
      alert("Failed to send reply");
    } finally {
      setIsSendingReply(false);
    }
  };

  if (!currentStory) return null;

  const viewerCount = currentStory.views ? Object.keys(currentStory.views).length : 0;
  const viewers = currentStory.views ? Object.values(currentStory.views) : [];

  return (
    <div className="story-viewer-overlay">
      {/* Background Blur */}
      <div className="story-bg-blur" style={{ backgroundImage: `url(${currentStory.type === 'image' ? currentStory.content : ''})` }} />
      
      <div className="story-viewer-container">
        {/* Progress Bars */}
        <div className="story-progress-container">
          {stories.map((_, idx) => (
            <div key={idx} className="story-progress-track">
              <motion.div 
                className="story-progress-bar"
                initial={{ width: 0 }}
                animate={{ 
                  width: idx === currentIndex ? `${progress}%` : idx < currentIndex ? '100%' : '0%' 
                }}
                transition={{ duration: idx === currentIndex ? 0.05 : 0.3 }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="story-header">
          <div className="story-user-info">
            <div className="story-avatar-ring">
              {currentStory.avatar ? <img src={currentStory.avatar} alt="" /> : <div className="avatar-placeholder">{currentStory.username[0]}</div>}
            </div>
            <div className="story-meta">
              <span className="story-username-text">{currentStory.username}</span>
              <span className="story-time-text">Secure Story</span>
            </div>
          </div>
          
          <div className="story-header-actions">
            {isMine && (
              <button onClick={handleDelete} className="story-icon-btn delete">
                <Trash2 size={20} />
              </button>
            )}
            <button onClick={onClose} className="story-icon-btn close">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div 
          className="story-content-main"
          onMouseDown={() => setIsPaused(true)}
          onMouseUp={() => setIsPaused(false)}
          onTouchStart={() => setIsPaused(true)}
          onTouchEnd={() => setIsPaused(false)}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStory.id}
              initial={{ opacity: 0, scale: 0.9, rotateY: 45 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              exit={{ opacity: 0, scale: 0.9, rotateY: -45 }}
              transition={{ type: 'spring', damping: 20 }}
              className="story-media-box"
            >
              {currentStory.type === 'image' ? (
                <img src={currentStory.content} alt="" className="story-media-content" />
              ) : currentStory.type === 'video' ? (
                <video
                  src={currentStory.content}
                  autoPlay
                  playsInline
                  onEnded={handleNext}
                  className="story-media-content"
                />
              ) : currentStory.type === 'audio' ? (
                <div className="story-audio-card">
                  <div className="audio-visualizer-orb">
                    <Shield size={60} color="white" />
                  </div>
                  <div className="audio-info">
                    <h3>{currentStory.musicData?.title || "Secure Track"}</h3>
                    <p>{currentStory.musicData?.artist || "Encrypted Artist"}</p>
                  </div>
                  <audio src={currentStory.content} autoPlay onEnded={handleNext} />
                </div>
              ) : (
                <div className="story-text-content">
                  {currentStory.content}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation Click Zones */}
          <div className="story-nav-zone left" onClick={handlePrev} />
          <div className="story-nav-zone right" onClick={handleNext} />
        </div>

        {/* Footer Interaction */}
        <div className="story-footer">
          {isMine ? (
            <button className="story-views-btn" onClick={() => setShowViews(true)}>
              <Eye size={18} />
              <span>{viewerCount} Views</span>
            </button>
          ) : (
            <form className="story-reply-form" onSubmit={handleReply}>
              <div className="reply-input-wrapper">
                <MessageCircle size={18} className="reply-icon" />
                <input 
                  type="text" 
                  placeholder="Send a reply..." 
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onFocus={() => setIsPaused(true)}
                  onBlur={() => setIsPaused(false)}
                />
                <button type="submit" disabled={!replyText.trim() || isSendingReply}>
                  <Send size={18} />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Seen-By Sheet */}
      <AnimatePresence>
        {showViews && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="seen-by-sheet"
          >
            <div className="sheet-handle" onClick={() => setShowViews(false)} />
            <div className="sheet-header">
              <h3>Story Views</h3>
              <button onClick={() => setShowViews(false)}><X size={20} /></button>
            </div>
            <div className="sheet-body">
              {viewers.length > 0 ? viewers.map((v: any, i) => (
                <div key={i} className="viewer-item">
                  <div className="viewer-avatar">
                    {v.avatar ? <img src={v.avatar} alt="" /> : v.username[0]}
                  </div>
                  <div className="viewer-info">
                    <span className="viewer-name">{v.username}</span>
                    <span className="viewer-time">Viewed {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              )) : (
                <div className="no-views">No views yet. Keep sharing!</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .story-viewer-overlay {
          position: fixed;
          inset: 0;
          z-index: 20000;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          overflow: hidden;
        }

        .story-bg-blur {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          filter: blur(80px) brightness(0.4);
          opacity: 0.6;
          z-index: 0;
        }

        .story-viewer-container {
          position: relative;
          width: 100%;
          max-width: 450px;
          height: 100%;
          display: flex;
          flex-direction: column;
          z-index: 1;
        }

        .story-progress-container {
          display: flex;
          gap: 6px;
          padding: 15px 10px;
          z-index: 10;
        }

        .story-progress-track {
          height: 3px;
          flex: 1;
          background: rgba(255,255,255,0.2);
          border-radius: 10px;
          overflow: hidden;
        }

        .story-progress-bar {
          height: 100%;
          background: white;
          border-radius: 10px;
        }

        .story-header {
          padding: 10px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          z-index: 10;
        }

        .story-user-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .story-avatar-ring {
          width: 44px;
          height: 44px;
          border-radius: 16px;
          border: 2px solid white;
          padding: 2px;
          overflow: hidden;
        }

        .story-avatar-ring img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; }
        .avatar-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--primary); border-radius: 12px; font-weight: 800; }

        .story-meta { display: flex; flexDirection: column; }
        .story-username-text { font-weight: 700; font-size: 0.95rem; }
        .story-time-text { font-size: 0.75rem; opacity: 0.6; }

        .story-icon-btn {
          background: rgba(255,255,255,0.1);
          border: none;
          color: white;
          padding: 8px;
          border-radius: 50%;
          cursor: pointer;
          backdrop-filter: blur(10px);
          margin-left: 10px;
        }

        .story-content-main {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          perspective: 1000px;
        }

        .story-media-box {
          width: 100%;
          height: 90%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 10px;
        }

        .story-media-content {
          max-width: 100%;
          max-height: 100%;
          border-radius: 30px;
          box-shadow: 0 30px 60px rgba(0,0,0,0.5);
          object-fit: contain;
        }

        .story-audio-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 30px;
          text-align: center;
        }

        .audio-visualizer-orb {
          width: 220px;
          height: 220px;
          border-radius: 60px;
          background: linear-gradient(135deg, #6366f1, #ec4899);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 20px 50px rgba(99, 102, 241, 0.4);
          animation: orb-pulse 2s infinite ease-in-out;
        }

        @keyframes orb-pulse {
          0% { transform: scale(1); box-shadow: 0 20px 50px rgba(99, 102, 241, 0.4); }
          50% { transform: scale(1.05); box-shadow: 0 20px 80px rgba(99, 102, 241, 0.6); }
          100% { transform: scale(1); box-shadow: 0 20px 50px rgba(99, 102, 241, 0.4); }
        }

        .story-text-content {
          font-size: 2.2rem;
          font-weight: 800;
          padding: 40px;
          line-height: 1.3;
          text-align: center;
          text-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }

        .story-nav-zone { position: absolute; top: 0; bottom: 0; z-index: 5; }
        .story-nav-zone.left { left: 0; width: 30%; }
        .story-nav-zone.right { right: 0; width: 70%; }

        .story-footer {
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
        }

        .story-views-btn {
          background: rgba(255,255,255,0.15);
          border: 1px solid rgba(255,255,255,0.1);
          color: white;
          padding: 12px 24px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 600;
          backdrop-filter: blur(10px);
        }

        .story-reply-form { width: 100%; }
        .reply-input-wrapper {
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 30px;
          padding: 6px 15px;
          display: flex;
          align-items: center;
          gap: 12px;
          backdrop-filter: blur(20px);
        }

        .reply-input-wrapper input {
          flex: 1;
          background: transparent;
          border: none;
          color: white;
          padding: 10px 0;
          font-size: 0.95rem;
          outline: none;
        }

        .reply-input-wrapper button {
          background: var(--primary);
          border: none;
          color: white;
          padding: 8px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .seen-by-sheet {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: #1a1a1a;
          border-radius: 30px 30px 0 0;
          max-height: 70%;
          display: flex;
          flex-direction: column;
          z-index: 100;
          box-shadow: 0 -20px 60px rgba(0,0,0,0.8);
        }

        .sheet-handle {
          width: 40px;
          height: 5px;
          background: rgba(255,255,255,0.2);
          border-radius: 10px;
          margin: 15px auto;
        }

        .sheet-header {
          padding: 0 20px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .sheet-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }

        .viewer-item {
          display: flex;
          align-items: center;
          gap: 15px;
          margin-bottom: 20px;
        }

        .viewer-avatar { width: 44px; height: 44px; border-radius: 14px; overflow: hidden; background: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: 800; }
        .viewer-avatar img { width: 100%; height: 100%; object-fit: cover; }
        
        .viewer-info { display: flex; flex-direction: column; }
        .viewer-name { font-weight: 700; font-size: 0.95rem; }
        .viewer-time { font-size: 0.75rem; opacity: 0.5; }
      `}</style>
    </div>
  );
};

export default StoryViewer;
