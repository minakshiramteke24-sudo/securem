import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Music, Type, Image as ImageIcon, Link as LinkIcon, Shield, Send, Sparkles, ChevronLeft, Upload, FileAudio } from 'lucide-react';

interface StoryCreatorProps {
  onClose: () => void;
  onPost: (type: 'text' | 'image' | 'video' | 'audio', content: string, musicData?: any) => Promise<void>;
  initialType?: 'text' | 'image' | 'video' | 'audio' | null;
}

const StoryCreator: React.FC<StoryCreatorProps> = ({ onClose, onPost, initialType = null }) => {
  const [step, setStep] = useState<'options' | 'input' | 'music-choice' | 'music-meta' | 'preview' | 'posting'>(initialType === 'audio' ? 'music-choice' : initialType ? 'input' : 'options');
  const [storyType, setStoryType] = useState<'text' | 'image' | 'video' | 'audio' | null>(initialType);
  const [content, setContent] = useState("");
  const [musicMetadata, setMusicMetadata] = useState({ title: "", artist: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const type = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image';
      setStoryType(type);
      setContent(base64);
      
      if (type === 'audio') {
        setStep('music-meta');
      } else {
        setStep('preview');
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePost = async () => {
    setStep('posting');
    try {
      await onPost(storyType!, content, (musicMetadata.title || musicMetadata.artist) ? musicMetadata : undefined);
      onClose();
    } catch (err) {
      alert("Failed to post story");
      setStep('preview');
    }
  };

  const modalVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95 }
  };

  return createPortal(
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at center, #1e1b4b 0%, #000 100%)',
      backdropFilter: 'blur(20px)',
      padding: '20px'
    }}>
      <div style={{ 
        position: 'absolute', 
        inset: 0, 
        opacity: 0.1, 
        backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")',
        pointerEvents: 'none' 
      }} />
      
      <button 
        onClick={onClose} 
        style={{ 
          position: 'absolute', 
          top: '30px', 
          right: '30px', 
          background: 'rgba(255,255,255,0.1)', 
          border: 'none', 
          color: 'white', 
          padding: '12px', 
          borderRadius: '50%', 
          cursor: 'pointer', 
          zIndex: 10001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(10px)'
        }}
        className="hover-scale"
      >
        <X size={24} />
      </button>

      <AnimatePresence mode="wait">
        {step === 'options' && (
          <motion.div key="options" variants={modalVariants} initial="hidden" animate="visible" exit="exit" style={{ width: '100%', maxWidth: '800px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '0.5rem', background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Create a Story</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '3rem', fontSize: '1.1rem' }}>Share a secure moment with your contacts</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
              {[
                { type: 'text', icon: <Type size={40} />, label: 'Text', desc: 'Share your thoughts', color: '#6366f1' },
                { type: 'media', icon: <ImageIcon size={40} />, label: 'Media', desc: 'Photos or Videos', color: '#ec4899' },
                { type: 'audio', icon: <Music size={40} />, label: 'Music', desc: 'Share a song link', color: '#10b981' }
              ].map((opt) => (
                <motion.button
                  key={opt.type}
                  whileHover={{ y: -10, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    if (opt.type === 'media') {
                      fileInputRef.current?.click();
                    } else if (opt.type === 'audio') {
                      setStoryType('audio');
                      setStep('music-choice');
                    } else {
                      setStoryType('text');
                      setStep('input');
                    }
                  }}
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '32px', padding: '3rem 2rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', transition: 'all 0.3s ease' }}
                >
                  <div style={{ padding: '20px', borderRadius: '24px', background: `${opt.color}20`, color: opt.color }}>{opt.icon}</div>
                  <div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white', marginBottom: '0.5rem' }}>{opt.label}</div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{opt.desc}</div>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'music-choice' && (
          <motion.div key="music-choice" variants={modalVariants} initial="hidden" animate="visible" exit="exit" style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '2rem' }}>Music Source</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                onClick={() => setStep('input')}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '24px', padding: '2.5rem', cursor: 'pointer', color: 'white' }}
              >
                <LinkIcon size={40} style={{ marginBottom: '1rem', color: 'var(--primary)' }} />
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>Paste Link</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>YouTube / Spotify</div>
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                onClick={() => fileInputRef.current?.click()}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '24px', padding: '2.5rem', cursor: 'pointer', color: 'white' }}
              >
                <Upload size={40} style={{ marginBottom: '1rem', color: '#10b981' }} />
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>Upload File</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>MP3 / WAV</div>
              </motion.button>
            </div>
            <button onClick={() => setStep('options')} style={{ marginTop: '2rem', color: 'var(--text-muted)' }}>Back</button>
          </motion.div>
        )}

        {step === 'input' && (
          <motion.div key="input" variants={modalVariants} initial="hidden" animate="visible" exit="exit" style={{ width: '100%', maxWidth: '600px' }}>
             <button onClick={() => setStep(storyType === 'audio' ? 'music-choice' : 'options')} style={{ background: 'transparent', color: 'white', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', opacity: 0.6 }}>
               <ChevronLeft size={20} /> Back
             </button>
             
             <div className="glass" style={{ padding: '3rem', borderRadius: '40px', background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
               <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '2rem' }}>
                 {storyType === 'text' ? 'Write something...' : 'Song Link'}
               </h2>
               
               {storyType === 'text' ? (
                 <textarea 
                   autoFocus
                   placeholder="What's on your mind?"
                   value={content}
                   onChange={(e) => setContent(e.target.value)}
                   style={{ width: '100%', height: '200px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '20px', padding: '1.5rem', color: 'white', fontSize: '1.25rem', resize: 'none', marginBottom: '2rem', outline: 'none' }}
                 />
               ) : (
                 <div style={{ marginBottom: '2rem' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '20px', padding: '1rem 1.5rem' }}>
                     <LinkIcon size={24} color="var(--primary)" />
                     <input 
                       autoFocus
                       type="text" 
                       placeholder="Paste YouTube or Music Link"
                       value={content}
                       onChange={(e) => setContent(e.target.value)}
                       style={{ background: 'transparent', border: 'none', padding: '0.5rem 0', color: 'white', width: '100%', outline: 'none', fontSize: '1.1rem' }}
                     />
                   </div>
                 </div>
               )}
               
               <button 
                 onClick={() => setStep(storyType === 'audio' ? 'music-meta' : 'preview')}
                 disabled={!content.trim()}
                 className="btn-primary" 
                 style={{ width: '100%', padding: '1.25rem', fontSize: '1.1rem', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
               >
                 Next <Sparkles size={18} />
               </button>
             </div>
          </motion.div>
        )}

        {step === 'music-meta' && (
          <motion.div key="music-meta" variants={modalVariants} initial="hidden" animate="visible" exit="exit" style={{ width: '100%', maxWidth: '600px' }}>
            <div className="glass" style={{ padding: '3rem', borderRadius: '40px', background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
               <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '2rem' }}>Song Details</h2>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
                 <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '20px', padding: '1rem 1.5rem' }}>
                   <label style={{ display: 'block', fontSize: '0.75rem', opacity: 0.5, marginBottom: '5px' }}>SONG TITLE</label>
                   <input 
                    autoFocus
                    type="text" 
                    placeholder="e.g. My Favorite Song"
                    value={musicMetadata.title}
                    onChange={(e) => setMusicMetadata({...musicMetadata, title: e.target.value})}
                    style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', outline: 'none', fontSize: '1.1rem' }}
                   />
                 </div>
                 <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '20px', padding: '1rem 1.5rem' }}>
                   <label style={{ display: 'block', fontSize: '0.75rem', opacity: 0.5, marginBottom: '5px' }}>ARTIST NAME</label>
                   <input 
                    type="text" 
                    placeholder="e.g. The Artist"
                    value={musicMetadata.artist}
                    onChange={(e) => setMusicMetadata({...musicMetadata, artist: e.target.value})}
                    style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', outline: 'none', fontSize: '1.1rem' }}
                   />
                 </div>
               </div>
               <button 
                 onClick={() => setStep('preview')}
                 className="btn-primary" 
                 style={{ width: '100%', padding: '1.25rem', fontSize: '1.1rem', borderRadius: '18px' }}
               >
                 Generate Preview
               </button>
            </div>
          </motion.div>
        )}

        {step === 'preview' && (
          <motion.div key="preview" variants={modalVariants} initial="hidden" animate="visible" exit="exit" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Story Preview</h2>
              <p style={{ color: 'var(--text-muted)' }}>This is how your story will appear to others</p>
            </div>

            {/* PREVIEW CONTAINER (PHONE MOCKUP) */}
            <div style={{ 
              width: '350px', 
              height: '600px', 
              borderRadius: '50px', 
              background: '#000', 
              border: '8px solid #333', 
              position: 'relative', 
              overflow: 'hidden',
              boxShadow: '0 50px 100px rgba(0,0,0,0.6)'
            }}>
              {/* Fake UI Overlay */}
              <div style={{ position: 'absolute', top: '20px', left: '15px', right: '15px', display: 'flex', gap: '4px', zIndex: 10 }}>
                <div style={{ flex: 1, height: '2px', background: 'rgba(255,255,255,0.8)', borderRadius: '2px' }} />
                <div style={{ flex: 1, height: '2px', background: 'rgba(255,255,255,0.3)', borderRadius: '2px' }} />
              </div>
              <div style={{ position: 'absolute', top: '40px', left: '20px', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 10 }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'var(--primary)', border: '1px solid white' }} />
                <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>You</div>
              </div>

              {/* Story Content */}
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                {storyType === 'text' ? (
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, textAlign: 'center', lineHeight: 1.4 }}>{content}</div>
                ) : storyType === 'image' ? (
                  <img src={content} style={{ maxWidth: '100%', maxHeight: '80%', borderRadius: '15px' }} />
                ) : storyType === 'video' ? (
                  <video src={content} autoPlay muted style={{ maxWidth: '100%', maxHeight: '80%', borderRadius: '15px' }} />
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '120px', height: '120px', borderRadius: '24px', background: 'linear-gradient(45deg, var(--primary), var(--accent))', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileAudio size={48} color="white" />
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{musicMetadata.title || "Secure Track"}</div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '5px' }}>{musicMetadata.artist || "Encrypted Artist"}</div>
                  </div>
                )}
              </div>
              
              <div style={{ position: 'absolute', bottom: '30px', left: 0, right: 0, textAlign: 'center', fontSize: '0.6rem', opacity: 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                <Shield size={10} /> End-to-End Encrypted
              </div>
            </div>

            <div style={{ display: 'flex', gap: '15px', width: '100%', maxWidth: '350px' }}>
              <button onClick={() => setStep('options')} style={{ flex: 1, padding: '1rem', borderRadius: '15px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)' }}>Cancel</button>
              <button onClick={handlePost} className="btn-primary" style={{ flex: 2, padding: '1rem', borderRadius: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                Post Story <Send size={18} />
              </button>
            </div>
          </motion.div>
        )}

        {step === 'posting' && (
          <motion.div key="posting" variants={modalVariants} initial="hidden" animate="visible" exit="exit" style={{ textAlign: 'center' }}>
            <div style={{ position: 'relative', width: '120px', height: '120px', margin: '0 auto 2rem' }}>
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid rgba(99, 102, 241, 0.1)', borderTopColor: 'var(--primary)' }}
              />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                <Send size={40} />
              </div>
            </div>
            <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>Sharing your story...</h2>
            <p style={{ color: 'var(--text-muted)' }}>Encrypting and delivering securely</p>
          </motion.div>
        )}
      </AnimatePresence>

      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept="image/*,video/*,audio/*"
        onChange={handleFileSelect}
      />
    </div>,
    document.body
  );
};

export default StoryCreator;
