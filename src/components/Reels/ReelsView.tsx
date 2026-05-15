import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Heart, MessageCircle, Share2, Music, 
  Plus, ArrowLeft, Play, Volume2, VolumeX 
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { type Reel, subscribeToReels, likeReel, incrementView } from '../../services/reelsService';
import ReelsUpload from './ReelsUpload';

interface ReelsViewProps {
  onBack: () => void;
}

const ReelsView: React.FC<ReelsViewProps> = ({ onBack }) => {
  const { profile } = useAuth();
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
        .reels-container { height: 100%; display: flex; flex-direction: column; background: #000; position: relative; color: white; }
        .reels-header { position: absolute; top: 0; left: 0; right: 0; z-index: 100; padding: 1.5rem; display: flex; align-items: center; justify-content: space-between; background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent); }
        .reels-header h2 { font-size: 1.5rem; font-weight: 800; }
        
        .reels-feed { flex: 1; overflow-y: scroll; scroll-snap-type: y mandatory; height: 100%; }
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (isActive) {
      videoRef.current?.play().catch(() => {});
      setPlaying(true);
      incrementView(reel.id);
    } else {
      videoRef.current?.pause();
      setPlaying(false);
    }
  }, [isActive, reel.id]);

  const togglePlay = () => {
    if (playing) {
      videoRef.current?.pause();
    } else {
      videoRef.current?.play();
    }
    setPlaying(!playing);
  };

  const handleLike = () => {
    if (!liked) {
      likeReel(reel.id);
      setLiked(true);
    }
  };

  return (
    <div className="reel-item">
      <video 
        ref={videoRef}
        src={reel.videoUrl}
        loop
        playsInline
        muted={muted}
        className="reel-video"
        onClick={togglePlay}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />

      {/* Side Actions */}
      <div className="reel-actions">
        <button className={`action-btn ${liked ? 'active' : ''}`} onClick={handleLike}>
          <Heart fill={liked ? '#ff2d55' : 'transparent'} color={liked ? '#ff2d55' : 'white'} />
          <span>{reel.likes + (liked ? 1 : 0)}</span>
        </button>
        <button className="action-btn">
          <MessageCircle />
          <span>8</span>
        </button>
        <button className="action-btn" onClick={() => setMuted(!muted)}>
          {muted ? <VolumeX /> : <Volume2 />}
        </button>
        <button className="action-btn">
          <Share2 />
        </button>
      </div>

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
      `}</style>
    </div>
  );
};

export default ReelsView;
