import React, { useState, useRef } from 'react';
import { 
  User, Shield, Palette, Settings as SettingsIcon, 
  Camera, ChevronRight, LogOut, Trash2, Moon, Sun, 
  Save, ArrowLeft
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { 
  updateUserSettings, 
  uploadProfilePicture, 
  removeProfilePicture,
  type UserSettings 
} from '../../services/settingsService';
import { updateUserProfile } from '../../services/userService';
import { auth } from '../../services/firebase';

interface SettingsPageProps {
  onClose: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onClose }) => {
  const { user, profile, settings } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'privacy' | 'appearance' | 'account'>('profile');
  const [isUpdating, setIsUpdating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local state for editing
  const [editProfile, setEditProfile] = useState({
    username: profile?.username || '',
    displayName: profile?.username || '',
    bio: (profile as any)?.bio || '',
    status: (profile as any)?.status || 'Hey there! I am using Securem.'
  });

  const handleUpdateProfile = async () => {
    if (!user || isUpdating) return;
    setIsUpdating(true);
    try {
      await updateUserProfile(user.uid, editProfile);
      alert("Profile updated successfully!");
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert("Please select a valid image file.");
      return;
    }

    setIsUpdating(true);
    try {
      console.log("[Settings] Starting avatar upload...");
      const url = await uploadProfilePicture(user.uid, file);
      console.log("[Settings] Upload success, URL:", url);
    } catch (err: any) {
      console.error("[Settings] Upload error:", err);
      if (err.message.includes('storage/unauthorized')) {
        alert("Upload failed: Firebase Storage permissions denied. Please ensure Storage is enabled in your Firebase console.");
      } else {
        alert(`Upload failed: ${err.message}`);
      }
    } finally {
      setIsUpdating(false);
      // Reset input so same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleTogglePrivacy = async (key: keyof UserSettings['privacy'], value: any) => {
    if (!user) return;
    await updateUserSettings(user.uid, {
      privacy: { ...settings.privacy, [key]: value }
    });
  };

  const handleToggleAppearance = async (key: keyof UserSettings['appearance'], value: any) => {
    if (!user) return;
    await updateUserSettings(user.uid, {
      appearance: { ...settings.appearance, [key]: value }
    });

    if (key === 'theme') {
      document.documentElement.setAttribute('data-theme', value);
    }
    if (key === 'glassmorphism') {
      document.documentElement.setAttribute('data-glass', value.toString());
    }
    if (key === 'fontSize') {
      document.documentElement.setAttribute('data-font-size', value);
    }
  };

  const renderSidebarItem = (id: typeof activeTab, label: string, icon: React.ReactNode) => (
    <button 
      onClick={() => setActiveTab(id)}
      className={`settings-nav-item ${activeTab === id ? 'active' : ''}`}
    >
      {icon}
      <span>{label}</span>
      <ChevronRight size={16} className="chevron" />
    </button>
  );

  return (
    <div className="settings-overlay glass animate-fade">
      <div className="settings-container glass animate-scale">
        {/* SETTINGS SIDEBAR (Desktop) */}
        <aside className="settings-sidebar">
          <div className="settings-header">
            <button onClick={onClose} className="back-btn"><ArrowLeft size={20} /></button>
            <h2>Settings</h2>
          </div>
          
          <div className="settings-user-card" onClick={() => setActiveTab('profile')}>
            <div className="avatar">
              {profile?.avatar ? <img src={profile.avatar} alt="Avatar" /> : (profile?.username?.[0]?.toUpperCase() || <User size={24} />)}
            </div>
            <div className="info">
              <p className="name">{profile?.username || "Secure User"}</p>
              <p className="status">{(profile as any)?.status || 'Online'}</p>
            </div>
          </div>

          <nav className="settings-nav">
            {renderSidebarItem('profile', 'Profile', <User size={20} />)}
            {renderSidebarItem('privacy', 'Privacy', <Shield size={20} />)}
            {renderSidebarItem('appearance', 'Appearance', <Palette size={20} />)}
            {renderSidebarItem('account', 'Account', <SettingsIcon size={20} />)}
          </nav>

          <div className="settings-footer">
            <button className="logout-btn" onClick={() => auth.signOut()}>
              <LogOut size={20} /> <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* SETTINGS CONTENT */}
        <main className="settings-main">
          {/* MOBILE HEADER */}
          <div className="mobile-settings-header">
             <button onClick={onClose}><ArrowLeft size={24} /></button>
             <h3>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
          </div>

          <div className="settings-content-area">
            {activeTab === 'profile' && (
              <div className="settings-section">
                <div className="profile-photo-edit">
                  <div className="avatar-large">
                    {isUpdating ? (
                      <div className="avatar-loading">
                        <div className="spinner-small" />
                      </div>
                    ) : profile?.avatar ? (
                      <img src={profile.avatar} alt="Avatar" />
                    ) : (
                      <span>{profile?.username?.[0]?.toUpperCase() || <User size={48} />}</span>
                    )}
                    {!isUpdating && (
                      <button className="edit-overlay" onClick={() => fileInputRef.current?.click()}>
                        <Camera size={24} />
                      </button>
                    )}
                  </div>
                  <input 
                    type="file" 
                    hidden 
                    ref={fileInputRef} 
                    accept="image/*" 
                    onChange={handleAvatarUpload} 
                  />
                  <div className="actions">
                    <button className="btn-text" onClick={() => fileInputRef.current?.click()}>Change Photo</button>
                    {profile?.avatar && <button className="btn-text danger" onClick={() => user && removeProfilePicture(user.uid)}>Remove</button>}
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Username</label>
                    <input 
                      type="text" 
                      value={editProfile.username} 
                      onChange={e => setEditProfile({...editProfile, username: e.target.value})} 
                    />
                  </div>
                  <div className="form-group">
                    <label>About / Bio</label>
                    <textarea 
                      value={editProfile.bio} 
                      onChange={e => setEditProfile({...editProfile, bio: e.target.value})}
                      placeholder="Write something about yourself..."
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <input 
                      type="text" 
                      value={editProfile.status} 
                      onChange={e => setEditProfile({...editProfile, status: e.target.value})} 
                    />
                  </div>
                </div>
                
                <button className="btn-primary" onClick={handleUpdateProfile} disabled={isUpdating} style={{ width: "100%" }}>
                  {isUpdating ? 'Saving...' : <><Save size={18} /> Save Changes</>}
                </button>
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="settings-section">
                <div className="settings-list">
                  <div className="list-item toggle">
                    <div className="item-info">
                      <p className="title">Stealth Mode</p>
                      <p className="desc">Hide your online status and last seen from everyone</p>
                    </div>
                    <label className="switch">
                      <input 
                        type="checkbox" 
                        checked={settings.privacy.stealthMode || false} 
                        onChange={e => handleTogglePrivacy('stealthMode' as any, e.target.checked)} 
                      />
                      <span className="slider"></span>
                    </label>
                  </div>

                  <div className="list-item">
                    <div className="item-info">
                      <p className="title">Last Seen</p>
                      <p className="desc">Who can see when you were last online</p>
                    </div>
                    <select 
                      disabled={settings.privacy.stealthMode}
                      value={settings.privacy.lastSeen} 
                      onChange={e => handleTogglePrivacy('lastSeen', e.target.value)}
                    >
                      <option value="everyone">Everyone</option>
                      <option value="contacts">Contacts Only</option>
                      <option value="nobody">Nobody</option>
                    </select>
                  </div>

                  <div className="list-item">
                    <div className="item-info">
                      <p className="title">Profile Photo</p>
                      <p className="desc">Who can see your profile photo</p>
                    </div>
                    <select 
                      value={settings.privacy.profilePhoto} 
                      onChange={e => handleTogglePrivacy('profilePhoto', e.target.value)}
                    >
                      <option value="everyone">Everyone</option>
                      <option value="contacts">Contacts Only</option>
                      <option value="nobody">Nobody</option>
                    </select>
                  </div>

                  <div className="list-item toggle">
                    <div className="item-info">
                      <p className="title">Read Receipts</p>
                      <p className="desc">If turned off, you won't send or receive read receipts</p>
                    </div>
                    <label className="switch">
                      <input 
                        type="checkbox" 
                        checked={settings.privacy.readReceipts} 
                        onChange={e => handleTogglePrivacy('readReceipts', e.target.checked)} 
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="settings-section">
                <div className="settings-grid">
                  <div className="theme-card-group">
                    <label className="group-label" style={{ display: "block", marginBottom: "1rem", color: "var(--text-muted)", fontSize: "0.9rem", fontWeight: 600 }}>Theme</label>
                    <div className="theme-options">
                      <button 
                        className={`theme-btn ${settings.appearance.theme === 'light' ? 'active' : ''}`}
                        onClick={() => handleToggleAppearance('theme', 'light')}
                      >
                        <Sun size={24} /> <span>Light</span>
                      </button>
                      <button 
                        className={`theme-btn ${settings.appearance.theme === 'dark' ? 'active' : ''}`}
                        onClick={() => handleToggleAppearance('theme', 'dark')}
                      >
                        <Moon size={24} /> <span>Dark</span>
                      </button>
                    </div>
                  </div>

                  <div className="appearance-list">
                    <div className="list-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem' }}>
                      <div className="item-info">
                        <p className="title">Chat Wallpaper</p>
                        <p className="desc">Personalize your conversation background</p>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', width: '100%' }}>
                        {[
                          'default', '#1a1a1a', '#0f172a', '#1e1b4b', '#134e4a', 
                          '#4c1d95', '#701a75', '#450a0a', '#064e3b', '#1e293b'
                        ].map(color => (
                          <button
                            key={color}
                            onClick={() => handleToggleAppearance('wallpaper' as any, color)}
                            style={{ 
                              width: '100%', 
                              paddingBottom: '100%', 
                              background: color === 'default' ? 'var(--bg-dark)' : color,
                              borderRadius: '12px',
                              border: (settings.appearance as any).wallpaper === color ? '3px solid var(--primary)' : '1px solid var(--border)',
                              position: 'relative'
                            }}
                            title={color}
                          >
                            {color === 'default' && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'var(--text-main)' }}>DEF</span>}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="list-item toggle">
                      <div className="item-info">
                        <p className="title">Glassmorphism</p>
                        <p className="desc">Enable premium frosted glass effects</p>
                      </div>
                      <label className="switch">
                        <input 
                          type="checkbox" 
                          checked={settings.appearance.glassmorphism} 
                          onChange={e => handleToggleAppearance('glassmorphism', e.target.checked)} 
                        />
                        <span className="slider"></span>
                      </label>
                    </div>

                    <div className="list-item">
                      <div className="item-info">
                        <p className="title">Font Size</p>
                      </div>
                      <select 
                        value={settings.appearance.fontSize} 
                        onChange={e => handleToggleAppearance('fontSize', e.target.value)}
                      >
                        <option value="small">Small</option>
                        <option value="medium">Medium</option>
                        <option value="large">Large</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="settings-section">
                <div className="account-info-card glass">
                   <div className="info-row">
                      <span className="label">Email</span>
                      <span className="value">{user?.email}</span>
                   </div>
                   <div className="info-row">
                      <span className="label">Joined</span>
                      <span className="value">{new Date(user?.metadata.creationTime || '').toLocaleDateString()}</span>
                   </div>
                </div>

                <div className="danger-zone">
                  <h3>Danger Zone</h3>
                  <p>Actions performed here cannot be undone.</p>
                  <button className="btn-secondary danger" onClick={() => alert("Deleting account...")} style={{ width: "100%" }}>
                    <Trash2 size={18} /> Delete Account
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <style>{`
        .settings-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); z-index: 5000; display: flex; align-items: center; justify-content: center; padding: 2rem; }
        .settings-container { width: 100%; max-width: 1000px; height: 85vh; background: var(--bg-dark); border-radius: 24px; border: 1px solid var(--border); display: flex; overflow: hidden; box-shadow: 0 30px 60px -12px rgba(0,0,0,0.5); }
        
        .settings-sidebar { width: 320px; border-right: 1px solid var(--border); background: rgba(var(--primary-rgb), 0.02); display: flex; flex-direction: column; }
        .settings-header { padding: 1.5rem; display: flex; align-items: center; gap: 1rem; color: var(--text-main); }
        .settings-header h2 { font-size: 1.5rem; font-weight: 800; }
        .back-btn { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: var(--glass); color: var(--text-main); }
        
        .settings-user-card { margin: 0 1rem 1.5rem; padding: 1.25rem; border-radius: 16px; background: var(--glass); cursor: pointer; display: flex; align-items: center; gap: 1rem; transition: all 0.2s; border: 1px solid var(--border); color: var(--text-main); }
        .settings-user-card:hover { border-color: var(--primary); transform: translateY(-2px); }
        .settings-user-card .avatar { width: 56px; height: 56px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: bold; overflow: hidden; color: white; }
        .settings-user-card .avatar img { width: 100%; height: 100%; object-fit: cover; }
        .settings-user-card .info .name { font-weight: 700; font-size: 1.1rem; }
        .settings-user-card .info .status { font-size: 0.8rem; color: var(--text-muted); }

        .settings-nav { flex: 1; padding: 0 1rem; }
        .settings-nav-item { width: 100%; display: flex; align-items: center; gap: 1rem; padding: 1rem; border-radius: 12px; color: var(--text-muted); transition: all 0.2s; margin-bottom: 0.5rem; background: transparent; cursor: pointer; }
        .settings-nav-item:hover { background: var(--glass); color: var(--text-main); }
        .settings-nav-item.active { background: var(--primary); color: white; box-shadow: 0 4px 15px rgba(var(--primary-rgb), 0.3); }
        .settings-nav-item .chevron { margin-left: auto; opacity: 0; transition: all 0.2s; }
        .settings-nav-item:hover .chevron { opacity: 0.5; transform: translateX(4px); }

        .settings-footer { padding: 1.5rem; border-top: 1px solid var(--border); }
        .logout-btn { width: 100%; display: flex; align-items: center; gap: 1rem; padding: 1rem; color: #ef4444; border-radius: 12px; transition: all 0.2s; background: transparent; cursor: pointer; font-weight: 600; }
        .logout-btn:hover { background: rgba(239, 68, 68, 0.1); }

        .settings-main { flex: 1; display: flex; flex-direction: column; background: var(--bg-dark); overflow: hidden; }
        .mobile-settings-header { display: none; }
        .settings-content-area { flex: 1; overflow-y: auto; padding: 3rem; color: var(--text-main); }

        .settings-section { max-width: 600px; margin: 0 auto; animation: slideUp 0.4s cubic-bezier(0,0,0.2,1); }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

        .profile-photo-edit { display: flex; flex-direction: column; align-items: center; gap: 1.5rem; margin-bottom: 3rem; }
        .avatar-large { position: relative; width: 120px; height: 120px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 3rem; font-weight: bold; overflow: hidden; color: white; border: 4px solid var(--border); }
        .avatar-large img { width: 100%; height: 100%; object-fit: cover; }
        .edit-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.2s; cursor: pointer; border: none; color: white; }
        .avatar-large:hover .edit-overlay { opacity: 1; }
        .btn-text { background: transparent; color: var(--primary); font-weight: 600; padding: 0.5rem 1rem; }
        .btn-text.danger { color: #ef4444; }
        
        .form-grid { display: flex; flex-direction: column; gap: 1.5rem; margin-bottom: 2rem; }
        .form-group label { display: block; font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.5rem; }
        .form-group input, .form-group textarea { width: 100%; background: var(--glass); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; color: var(--text-main); font-size: 1rem; font-family: inherit; }
        .form-group textarea { height: 100px; resize: none; }

        .settings-list { display: flex; flex-direction: column; gap: 1rem; }
        .list-item { display: flex; align-items: center; justify-content: space-between; padding: 1.5rem; border-radius: 16px; background: var(--glass); border: 1px solid var(--border); }
        .list-item .item-info .title { font-weight: 700; font-size: 1.1rem; margin-bottom: 0.25rem; color: var(--text-main); }
        .list-item .item-info .desc { font-size: 0.85rem; color: var(--text-muted); }
        .list-item select { background: var(--bg-dark); color: var(--text-main); padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid var(--border); }

        .theme-options { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem; }
        .theme-btn { padding: 2rem; border-radius: 20px; background: var(--glass); border: 2px solid transparent; display: flex; flex-direction: column; align-items: center; gap: 1rem; transition: all 0.2s; color: var(--text-main); cursor: pointer; }
        .theme-btn:hover { border-color: var(--border); }
        .theme-btn.active { border-color: var(--primary); background: rgba(var(--primary-rgb), 0.1); color: var(--primary); }
        .theme-btn span { font-weight: 600; }

        .account-info-card { padding: 2rem; border-radius: 20px; margin-bottom: 2rem; }
        .info-row { display: flex; justify-content: space-between; padding: 1rem 0; border-bottom: 1px solid var(--border); }
        .info-row:last-child { border: none; }
        .info-row .label { color: var(--text-muted); font-size: 0.9rem; }
        .info-row .value { font-weight: 600; color: var(--text-main); }

        .danger-zone { margin-top: 3rem; padding: 2rem; border-radius: 20px; background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.2); }
        .danger-zone h3 { color: #ef4444; margin-bottom: 0.5rem; }
        .danger-zone p { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem; }

        /* Mobile Adjustments */
        @media (max-width: 768px) {
          .settings-overlay { padding: 0; }
          .settings-container { height: 100vh; border-radius: 0; border: none; }
          .settings-sidebar { display: none; }
          .settings-main { display: flex; }
          .mobile-settings-header { display: flex; align-items: center; gap: 1.5rem; padding: 1.5rem; background: var(--bg-dark); border-bottom: 1px solid var(--border); color: var(--text-main); }
          .settings-content-area { padding: 1.5rem; }
        }

        /* Switch Toggle */
        .switch { position: relative; display: inline-block; width: 50px; height: 26px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; inset: 0; background-color: var(--border); transition: .4s; border-radius: 34px; }
        .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: var(--primary); }
        input:checked + .slider:before { transform: translateX(24px); }
      `}</style>
    </div>
  );
};

export default SettingsPage;
