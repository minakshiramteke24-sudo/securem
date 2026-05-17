import React, { useState, useRef } from 'react';
import { X, Upload, Save, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { uploadReel } from '../../services/reelsService';

interface ReelsUploadProps {
  onClose: () => void;
}

const ReelsUpload: React.FC<ReelsUploadProps> = ({ onClose }) => {
  const { user, profile } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type.startsWith('video/')) {
      if (selected.size > 5 * 1024 * 1024) {
        alert("Video must be less than 5MB to use the bucket-less transfer system.");
        return;
      }
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    } else {
      alert("Please select a valid video file.");
    }
  };

  const handleUpload = async () => {
    if (!user || !profile || !file) return;
    
    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result as string;
        try {
          await uploadReel(user.uid, profile.username, profile.avatar || '', base64Data, caption);
          setIsSuccess(true);
          setTimeout(() => onClose(), 2000);
        } catch (err: any) {
          alert(`Upload failed: ${err.message}`);
          setIsUploading(false);
        }
      };
      reader.onerror = () => {
        alert("Failed to read video file");
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
      setIsUploading(false);
    }
  };

  return (
    <div className="reels-upload-container glass">
      <div className="upload-header">
        <button onClick={onClose} className="close-btn"><X size={24} /></button>
        <h3>Create Reel</h3>
        <div style={{ width: 24 }} />
      </div>

      <div className="upload-content">
        {!preview ? (
          <div className="drop-zone" onClick={() => fileInputRef.current?.click()}>
            <div className="icon-circle">
              <Upload size={32} />
            </div>
            <h4>Select Video</h4>
            <p>MP4, WebM or MOV (Max 5MB)</p>
            <button className="btn-primary">Browse Files</button>
            <input 
              ref={fileInputRef}
              type="file" 
              accept="video/*" 
              hidden 
              onChange={handleFileChange}
            />
          </div>
        ) : (
          <div className="upload-preview-grid">
            <div className="video-preview">
              <video src={preview} controls muted />
              <button className="change-btn" onClick={() => setPreview(null)}>Change Video</button>
            </div>
            
            <div className="upload-meta">
              <div className="form-group">
                <label>Caption</label>
                <textarea 
                  placeholder="What's happening? #securem #reels"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
              </div>

              <div className="upload-footer">
                <button 
                  className="btn-primary upload-btn" 
                  onClick={handleUpload}
                  disabled={isUploading || isSuccess}
                >
                  {isUploading ? (
                    <div className="spinner-small" />
                  ) : isSuccess ? (
                    <><CheckCircle size={18} /> Uploaded!</>
                  ) : (
                    <><Save size={18} /> Share Reel</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .reels-upload-container { height: 100%; display: flex; flex-direction: column; background: var(--bg-dark); }
        .upload-header { padding: 1.5rem; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); }
        .upload-content { flex: 1; display: flex; align-items: center; justify-content: center; padding: 2rem; }
        
        .drop-zone { width: 100%; max-width: 400px; padding: 3rem; border: 2px dashed var(--border); border-radius: 24px; display: flex; flex-direction: column; align-items: center; gap: 1rem; cursor: pointer; transition: all 0.2s; }
        .drop-zone:hover { border-color: var(--primary); background: rgba(var(--primary-rgb), 0.05); }
        .icon-circle { width: 80px; height: 80px; border-radius: 50%; background: var(--glass); display: flex; align-items: center; justify-content: center; color: var(--primary); margin-bottom: 1rem; }
        
        .upload-preview-grid { display: grid; grid-template-columns: 1fr 1.2fr; gap: 2rem; width: 100%; max-width: 900px; height: 100%; max-height: 600px; }
        
        .video-preview { position: relative; border-radius: 16px; overflow: hidden; background: #000; display: flex; flex-direction: column; }
        .video-preview video { width: 100%; flex: 1; object-fit: contain; }
        .change-btn { padding: 0.75rem; background: rgba(255,255,255,0.1); color: white; font-size: 0.8rem; font-weight: 600; }
        
        .upload-meta { display: flex; flex-direction: column; gap: 1.5rem; }
        .upload-meta textarea { width: 100%; height: 150px; background: var(--glass); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; color: white; resize: none; font-size: 1rem; }
        .upload-btn { width: 100%; padding: 1rem; height: 54px; }
      `}</style>
    </div>
  );
};

export default ReelsUpload;
