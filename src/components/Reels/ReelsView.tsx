import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Heart, MessageCircle, Share2, Music, 
  Plus, ArrowLeft, Play, Volume2, VolumeX, Send
} from 'lucide-react';
import { type Reel, subscribeToReels, likeReel, unlikeReel, incrementView, addReelComment, subscribeToReelComments, type ReelComment } from '../../services/reelsService';
import ReelsUpload from './ReelsUpload';
import { useAuth } from '../../context/AuthContext';

interface ReelsViewProps {
  onBack: () => void;
}

const ReelsView: React.FC<ReelsViewProps> = ({ onBack }) => {
  const [reels, setReels] = useState<Reel[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeToReels((data) => {
      setReels(data);
    });
    return () => unsub();
  }, []);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const scrollPos = containerRef.current.scrollTop;
    const height = containerRef.current.clientHeight;
    const index = Math.round(scrollPos / height);
    if (index !== currentIndex) {
      setCurrentIndex(index);
    }
  };

  return (
    <div className="reels-container">
      <div className="reels-feed-wrapper">
        {/* Top Header */}
        <div className="reels-header glass">
          <button className="back-btn" onClick={onBack}><ArrowLeft size={24} /></button>
          <h2>Reels</h2>
          <button className="upload-trigger" onClick={() => setShowUpload(true)}>
            <Plus size={24} />
          </button>
        </div>

        {/* Main Video Feed */}
        <div 
          ref={containerRef}
          className="reels-feed"
          onScroll={handleScroll}
          style={{ scrollSnapType: 'y mandatory' }}
        >
          {reels.length > 0 ? (
            reels.map((reel, index) => (
              <ReelItem 
                key={reel.id} 
                reel={reel} 
                isActive={index === currentIndex} 
              />
            ))
          ) : (
            <div className="empty-reels">
              <p>No reels yet. Be the first to share! 🎬</p>
              <button className="btn-primary" onClick={() => setShowUpload(true)}>Create Reel</button>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showUpload && (
          <motion.div 
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            className="upload-overlay"
          >
            <ReelsUpload onClose={() => setShowUpload(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .reels-container { 
          height: 100%; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          background: rgba(0, 0, 0, 0.4); 
          position: relative; 
          color: white; 
          backdrop-filter: blur(8px);
        }
        .reels-feed-wrapper { 
          width: 100%; 
          max-width: 420px; 
          height: 95%; 
          border-radius: 24px; 
          overflow: hidden; 
          position: relative; 
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); 
          border: 1px solid rgba(255, 255, 255, 0.15); 
          background: #000; 
          display: flex; 
          flex-direction: column; 
        }
        @media (max-width: 768px) {
          .reels-feed-wrapper {
            max-width: 100%;
            height: 100%;
            border-radius: 0;
            border: none;
          }
        }
        .reels-header { position: absolute; top: 0; left: 0; right: 0; z-index: 100; padding: 1.5rem; display: flex; align-items: center; justify-content: space-between; background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent); }
        .reels-header h2 { font-size: 1.5rem; font-weight: 800; }
        
        .reels-feed { 
          flex: 1; 
          overflow-y: scroll; 
          scroll-snap-type: y mandatory; 
          height: 100%; 
          scrollbar-width: none; 
          -ms-overflow-style: none; 
        }
        .reels-feed::-webkit-scrollbar { 
          display: none; 
        }
        .reel-item { height: 100%; scroll-snap-align: start; position: relative; display: flex; align-items: center; justify-content: center; background: #000; }
        
        .empty-reels { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.5rem; }
        
        .upload-overlay { position: fixed; inset: 0; z-index: 2000; background: var(--bg-dark); }
        
        /* Glassy elements for Reels */
        .reels-glass { background: rgba(0, 0, 0, 0.3); backdrop-filter: blur(20px); border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.1); }
      `}</style>
    </div>
  );
};

const ReelItem: React.FC<{ reel: Reel; isActive: boolean }> = ({ reel, isActive }) => {
  const { user, profile } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [liked, setLiked] = useState(() => {
    const likedReels = JSON.parse(localStorage.getItem('liked_reels') || '{}');
    return !!likedReels[reel.id];
  });
  const [showComments, setShowComments] = useState(false);
  const [commentsCount, setCommentsCount] = useState(0);

  useEffect(() => {
    const unsub = subscribeToReelComments(reel.id, (data) => {
      setCommentsCount(data.length);
    });
    return () => unsub();
  }, [reel.id]);

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/#reel-${reel.id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      alert("Reel link copied to clipboard!");
    }).catch(() => {
      alert("Failed to copy link.");
    });
  };

  useEffect(() => {
    if (reel.videoUrl.startsWith('data:')) {
      fetch(reel.videoUrl)
        .then(res => res.blob())
        .then(blob => {
          setVideoSrc(URL.createObjectURL(blob));
        })
        .catch(err => console.error("Error converting base64 to blob:", err));
    } else {
      setVideoSrc(reel.videoUrl);
    }
  }, [reel.videoUrl]);

  useEffect(() => {
    if (isActive && videoSrc) {
      if (videoRef.current) {
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            setPlaying(true);
            incrementView(reel.id);
          }).catch((error) => {
            console.warn("Autoplay prevented:", error);
            setPlaying(false);
          });
        }
      }
    } else {
      videoRef.current?.pause();
      setPlaying(false);
    }
  }, [isActive, reel.id, videoSrc]);

  const togglePlay = () => {
    if (playing) {
      videoRef.current?.pause();
    } else {
      videoRef.current?.play();
    }
    setPlaying(!playing);
  };

  const handleLike = () => {
    const likedReels = JSON.parse(localStorage.getItem('liked_reels') || '{}');
    if (liked) {
      unlikeReel(reel.id);
      likedReels[reel.id] = false;
      setLiked(false);
    } else {
      likeReel(reel.id);
      likedReels[reel.id] = true;
      setLiked(true);
    }
    localStorage.setItem('liked_reels', JSON.stringify(likedReels));
  };

  return (
    <div className="reel-item">
      {videoSrc ? (
        <video 
          ref={videoRef}
          src={videoSrc}
          loop
          playsInline
          muted={muted}
          className="reel-video"
          onClick={togglePlay}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
        <div className="loading-reel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div className="spinner-small" />
        </div>
      )}

      {/* Side Actions */}
      <div className="reel-actions">
        <button className={`action-btn ${liked ? 'active' : ''}`} onClick={handleLike}>
          <Heart fill={liked ? '#ff2d55' : 'transparent'} color={liked ? '#ff2d55' : 'white'} />
          <span>{reel.likes}</span>
        </button>
        <button className="action-btn" onClick={() => setShowComments(true)}>
          <MessageCircle />
          <span>{commentsCount}</span>
        </button>
        <button className="action-btn" onClick={() => setMuted(!muted)}>
          {muted ? <VolumeX /> : <Volume2 />}
        </button>
        <button className="action-btn" onClick={handleShare}>
          <Share2 />
        </button>
      </div>

      <AnimatePresence>
        {showComments && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            className="comments-overlay glass"
          >
            <ReelCommentsPanel 
              reelId={reel.id} 
              onClose={() => setShowComments(false)} 
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Overlay */}
      <div className="reel-info-overlay">
        <div className="creator-info">
          <div className="avatar">
            <img src={reel.creatorAvatar} alt={reel.creatorName} />
          </div>
          <span className="username">@{reel.creatorName}</span>
          <button className="follow-btn">Follow</button>
        </div>
        <p className="caption">{reel.caption}</p>
        <div className="music-tag">
          <Music size={14} />
          <span>Original Audio - {reel.creatorName}</span>
        </div>
      </div>

      {!playing && (
        <div className="play-pause-indicator" onClick={togglePlay}>
          <Play size={64} fill="white" />
        </div>
      )}

      <style>{`
        .reel-video { width: 100%; height: 100%; }
        .reel-actions { position: absolute; right: 1rem; bottom: 6rem; display: flex; flex-direction: column; gap: 1.5rem; align-items: center; z-index: 5; }
        .action-btn { background: transparent; color: white; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; font-size: 0.8rem; }
        .action-btn.active { color: #ff2d55; }
        
        .reel-info-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 2rem 1.5rem; background: linear-gradient(to top, rgba(0,0,0,0.8), transparent); z-index: 4; }
        .creator-info { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
        .creator-info .avatar { width: 40px; height: 40px; border-radius: 50%; overflow: hidden; border: 2px solid white; }
        .creator-info .avatar img { width: 100%; height: 100%; object-fit: cover; }
        .creator-info .username { font-weight: 700; }
        .follow-btn { border: 1px solid white; border-radius: 6px; padding: 4px 12px; font-size: 0.8rem; font-weight: 600; }
        
        .caption { font-size: 0.95rem; margin-bottom: 1rem; line-height: 1.4; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
        .music-tag { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
        
        .play-pause-indicator { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2); z-index: 3; }

        .comments-overlay {
          position: absolute;
          inset: 0;
          top: auto;
          height: 65%;
          background: rgba(10, 10, 10, 0.95);
          backdrop-filter: blur(25px);
          border-top-left-radius: 24px;
          border-top-right-radius: 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.15);
          z-index: 100;
        }
        .comments-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 1.5rem;
          color: white;
        }
        .comments-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          padding-bottom: 0.75rem;
          margin-bottom: 1rem;
        }
        .comments-header h4 { font-size: 1.1rem; font-weight: 700; margin: 0; }
        .close-comments-btn { background: transparent; border: none; color: rgba(255,255,255,0.6); font-size: 1.5rem; cursor: pointer; line-height: 1; }
        .close-comments-btn:hover { color: white; }
        
        .comments-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 1rem;
          padding-right: 0.5rem;
        }
        .comments-list::-webkit-scrollbar { width: 4px; }
        .comments-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        
        .comment-item { display: flex; gap: 0.75rem; align-items: flex-start; text-align: left; }
        .comment-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.2); }
        .comment-body { display: flex; flex-direction: column; gap: 0.2rem; align-items: flex-start; }
        .comment-author { font-size: 0.85rem; font-weight: 700; color: #818cf8; }
        .comment-text { font-size: 0.9rem; margin: 0; color: rgba(255,255,255,0.9); line-height: 1.4; word-break: break-word; text-align: left; }
        .no-comments { height: 100%; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.4); font-size: 0.9rem; }
        
        .comment-form { display: flex; gap: 0.75rem; align-items: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1rem; }
        .comment-form input { flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 50px; padding: 0.75rem 1.25rem; color: white; font-size: 0.9rem; outline: none; transition: border-color 0.2s; }
        .comment-form input:focus { border-color: #818cf8; }
        .comment-form button { background: #818cf8; border: none; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; cursor: pointer; transition: transform 0.2s, opacity 0.2s; }
        .comment-form button:hover { transform: scale(1.05); }
        .comment-form button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
      `}</style>
    </div>
  );
};

const ReelCommentsPanel: React.FC<{ reelId: string; onClose: () => void }> = ({ reelId, onClose }) => {
  const { profile } = useAuth();
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    const unsub = subscribeToReelComments(reelId, (data) => {
      setComments(data);
    });
    return () => unsub();
  }, [reelId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !profile) return;
    try {
      await addReelComment(reelId, profile.username, profile.avatar || '', text.trim());
      setText('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="comments-panel">
      <div className="comments-header">
        <h4>Comments ({comments.length})</h4>
        <button onClick={onClose} className="close-comments-btn">×</button>
      </div>
      <div className="comments-list">
        {comments.length > 0 ? (
          comments.map(c => (
            <div key={c.id} className="comment-item">
              <img src={c.authorAvatar || 'https://via.placeholder.com/150'} alt={c.authorName} className="comment-avatar" />
              <div className="comment-body">
                <span className="comment-author">@{c.authorName}</span>
                <p className="comment-text">{c.text}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="no-comments">No comments yet. Write the first! 💬</div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="comment-form">
        <input 
          type="text" 
          placeholder="Add a comment..." 
          value={text} 
          onChange={e => setText(e.target.value)} 
        />
        <button type="submit" disabled={!text.trim()}><Send size={16} /></button>
      </form>
    </div>
  );
};

export default ReelsView;
