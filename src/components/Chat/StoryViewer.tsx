import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Trash2 } from 'lucide-react';
import { type Story, deleteStory } from '../../services/storyService';
import { useAuth } from '../../context/AuthContext';

interface StoryViewerProps {
  stories: Story[];
  initialIndex: number;
  onClose: () => void;
}

const StoryViewer: React.FC<StoryViewerProps> = ({ stories, initialIndex, onClose }) => {
  const { user } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);

  const currentStory = stories[currentIndex];

  const handleDelete = async () => {
    if (window.confirm("Delete this story?")) {
      await deleteStory(currentStory.id);
      onClose();
    }
  };

  useEffect(() => {
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
  }, [currentIndex]);

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

  if (!currentStory) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 20000,
      background: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white'
    }}>
      {/* Progress Bars */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '10px',
        right: '10px',
        display: 'flex',
        gap: '5px',
        zIndex: 10
      }}>
        {stories.map((_, idx) => (
          <div key={idx} style={{
            height: '3px',
            flex: 1,
            background: 'rgba(255,255,255,0.3)',
            borderRadius: '10px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: idx === currentIndex ? `${progress}%` : idx < currentIndex ? '100%' : '0%',
              background: 'white',
              transition: idx === currentIndex ? 'none' : 'width 0.3s'
            }} />
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{
        position: 'absolute',
        top: '40px',
        left: '20px',
        right: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', overflow: 'hidden', border: '2px solid white' }}>
            {currentStory.avatar ? <img src={currentStory.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary)' }}>{currentStory.username[0]}</div>}
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>{currentStory.username}</p>
            <p style={{ margin: 0, fontSize: '0.7rem', opacity: 0.7 }}>Secure Story</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {user?.uid === currentStory.uid && (
            <button
              onClick={handleDelete}
              style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', opacity: 0.7 }}
              title="Delete Story"
            >
              <Trash2 size={24} />
            </button>
          )}
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', opacity: 0.7 }}
          >
            <X size={30} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStory.id}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            style={{ width: '100%', maxWidth: '500px', textAlign: 'center' }}
          >
            {currentStory.type === 'image' ? (
              <img src={currentStory.content} alt="" style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '20px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }} />
            ) : currentStory.type === 'video' ? (
              <video
                src={currentStory.content}
                autoPlay
                playsInline
                onEnded={handleNext}
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '20px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}
              />
            ) : currentStory.type === 'audio' ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                <div style={{
                  width: '200px',
                  height: '200px',
                  borderRadius: '30px',
                  background: 'linear-gradient(45deg, var(--primary), var(--accent))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 10px 30px rgba(var(--primary-rgb), 0.3)'
                }}>
                  <Shield size={80} color="white" />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{currentStory.musicData?.title || "Secure Track"}</h2>
                  <p style={{ margin: '5px 0 0 0', opacity: 0.7 }}>{currentStory.musicData?.artist || "Encrypted Artist"}</p>
                </div>
                <audio src={currentStory.content} autoPlay onEnded={handleNext} />
              </div>
            ) : (
              <div style={{ fontSize: '2rem', fontWeight: 700, padding: '40px', lineHeight: 1.4 }}>
                {currentStory.content}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div
        onClick={handlePrev}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', cursor: 'pointer', zIndex: 5 }}
      />
      <div
        onClick={handleNext}
        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '70%', cursor: 'pointer', zIndex: 5 }}
      />

      {/* Footer Encryption Badge */}
      <div style={{ position: 'absolute', bottom: '40px', display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.5, fontSize: '0.75rem' }}>
        <Shield size={14} />
        <span>End-to-End Encrypted Story</span>
      </div>
    </div>
  );
};

export default StoryViewer;
