import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, MessageCircle, User as UserIcon, Check, 
  Phone, Video, Eraser, UserMinus, Settings, LogOut
} from 'lucide-react';
import { useAuth } from "../../context/AuthContext";
import { searchUsers, type UserProfile } from "../../services/userService";
import { subscribeToChats, deleteLocalChat, clearChatMessages } from "../../services/chatService";
import { subscribeToActiveStories, postStory, type Story } from "../../services/storyService";
import { auth } from "../../services/firebase";
import StoryViewer from "./StoryViewer";
import StoryCreator from "./StoryCreator";

interface SidebarProps {
  onSelectChat: (chatId: string, recipient: UserProfile) => void;
  onInitiateCall: (callData: any) => void;
  onShowSettings: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onSelectChat, onInitiateCall, onShowSettings }) => {
  const { user, profile } = useAuth();

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [stories, setStories] = useState<Story[]>([]);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [isPostingStory, setIsPostingStory] = useState(false);
  const [activeTab, setActiveTab] = useState<'chats' | 'stories'>('chats');

  // Menu states
  const [profileMenuOpen, setProfileMenuOpen] = useState<{ x: number, y: number } | null>(null);
  const [chatMenuConfig, setChatMenuConfig] = useState<{ x: number, y: number, chatId: string, recipientName: string } | null>(null);

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const chatMenuRef = useRef<HTMLDivElement>(null);





  useEffect(() => {
    if (user) {
      setChatsLoading(true);
      const unsubscribe = subscribeToChats(user.uid, (chats) => {
        setRecentChats(chats);
        setChatsLoading(false);
      });

      const unsubscribeStories = subscribeToActiveStories((activeStories) => {
        setStories(activeStories);
      });

      return () => {
        unsubscribe();
        unsubscribeStories();
      };
    }
  }, [user]);

  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (searchTerm.length >= 2) {
        const results = await searchUsers(searchTerm);
        setSearchResults(results.filter(u => u.uid !== user?.uid));
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [searchTerm, user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(null);
      }
      if (chatMenuRef.current && !chatMenuRef.current.contains(event.target as Node)) {
        setChatMenuConfig(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);



  const openChatMenu = (e: React.MouseEvent, chatId: string, recipientName: string) => {
    e.stopPropagation();
    e.preventDefault();
    setChatMenuConfig({ x: e.clientX, y: e.clientY, chatId, recipientName });
  };

  const formatTime = (ts: any) => {
    if (!ts) return "";
    const date = new Date(ts);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleStartCall = async (chatId: string, recipient: UserProfile, type: 'audio' | 'video') => {
    if (!user) return;
    try {
      const callData = {
        chatId: chatId || "direct",
        callerId: user.uid,
        recipientId: recipient.uid,
        recipientUsername: recipient.username,
        recipientAvatar: recipient.avatar,
        type,
        status: 'init',
        timestamp: Date.now()
      };
      onInitiateCall(callData);
    } catch (err: any) {
      alert(`Call Error: ${err.message}`);
    }
  };

  // Animation Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  };

  const dropdownVariants = {
    hidden: { opacity: 0, scale: 0.95, y: -10 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 20 } },
    exit: { opacity: 0, scale: 0.95, y: -10 }
  };

  const filteredRecentChats = recentChats.filter(chat => 
    chat.recipient.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (chat.lastMessage && chat.lastMessage.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <aside className="sidebar">
      {/* HEADER */}
      <motion.div
        className="sidebar-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="header-top">
          <motion.div
            className="user-profile"
            onClick={onShowSettings}
            style={{ cursor: 'pointer' }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="avatar" style={{ background: "var(--primary)" }}>
              {profile?.avatar ? <img src={profile.avatar} alt="Avatar" /> : (profile?.username ? profile.username[0].toUpperCase() : <UserIcon size={20} />)}
            </div>
            <div className="user-info">
              <p className="username">{profile?.username || "Secure User"}</p>
              <p className="status" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Check size={10} /> Online</p>
            </div>
          </motion.div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setIsPostingStory(true)}
              style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
              title="Create Story"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <button
              onClick={onShowSettings}
              className={`dots-btn ${profileMenuOpen ? 'active' : ''}`}
              title="Settings"
              style={{ background: 'rgba(255, 255, 255, 0.05)', color: '#ffffff', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255, 255, 255, 0.1)', cursor: 'pointer' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="search-bar" style={{ position: 'relative', marginTop: '1rem' }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search users or chats..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ 
              paddingLeft: '44px',
              height: '42px',
              borderRadius: '14px',
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border)',
              fontSize: '0.9rem'
            }}
          />
        </div>
      </motion.div>

      {/* TAB SWITCHER */}
      <div className="tab-switcher-premium">
        <button 
          className={`tab-btn ${activeTab === 'chats' ? 'active' : ''}`}
          onClick={() => setActiveTab('chats')}
        >
          <MessageCircle size={18} />
          <span>Chats</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'stories' ? 'active' : ''}`}
          onClick={() => setActiveTab('stories')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>Stories</span>
        </button>
        <div className={`tab-indicator ${activeTab}`} />
      </div>

      <AnimatePresence>
        {isPostingStory && (
          <StoryCreator 
            onClose={() => setIsPostingStory(false)}
            onPost={async (type, content, musicData) => {
              if (user) {
                await postStory(user.uid, user.displayName || "Secure User", user.photoURL || undefined, type, content, musicData);
                setIsPostingStory(false);
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* STORY TAB CONTENT */}
      <div className="sidebar-content">
        <AnimatePresence mode="wait">
          {searchTerm.length > 0 ? (
            <motion.div
              key="search"
              className="search-results"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              {filteredRecentChats.length > 0 && (
                <>
                  <p className="section-label">Your Conversations</p>
                  {filteredRecentChats.map((chat) => (
                    <motion.div
                      key={chat.id}
                      variants={itemVariants}
                      className="chat-item-container"
                      onClick={() => { onSelectChat(chat.id, chat.recipient); setSearchTerm(""); }}
                      whileHover={{ x: 5, background: "rgba(255, 255, 255, 0.03)" }}
                    >
                      <div className="avatar" style={{ background: chat.recipient.username?.toLowerCase().includes('minakshi') ? '#9333ea' : 'var(--primary)' }}>
                        {chat.recipient.avatar ? <img src={chat.recipient.avatar} alt="Avatar" /> : chat.recipient.username[0].toUpperCase()}
                      </div>
                      <div className="chat-info">
                        <p className="username">{chat.recipient.username}</p>
                        <p className="last-message">{chat.lastMessage || "Start a conversation"}</p>
                      </div>
                    </motion.div>
                  ))}
                </>
              )}

              {searchTerm.length >= 2 && (
                <>
                  <p className="section-label" style={{ marginTop: '1rem' }}>Global Search</p>
                  {searchResults.filter(u => !recentChats.some(c => c.recipient.uid === u.uid)).map((u) => (
                    <motion.div
                      key={u.uid}
                      variants={itemVariants}
                      className="chat-item-container"
                      onClick={() => { onSelectChat("", u); setSearchTerm(""); }}
                      whileHover={{ x: 5, background: "rgba(var(--primary-rgb), 0.05)" }}
                    >
                      <div className="avatar" style={{ background: u.username?.toLowerCase().includes('minakshi') ? '#9333ea' : 'var(--primary)' }}>
                        {u?.avatar ? <img src={u.avatar} alt="Avatar" /> : (u?.username?.[0]?.toUpperCase() || "?")}
                      </div>
                      <div className="chat-info">
                        <p className="username">{u?.username || "Secure User"}</p>
                        <p className="last-message" style={{ fontSize: "0.85rem", opacity: 0.7 }}>
                          {u?.status || u?.bio || "Available"}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                  {searchResults.length === 0 && filteredRecentChats.length === 0 && <div className="no-results">No users or chats found</div>}
                </>
              )}
            </motion.div>
          ) : activeTab === 'stories' ? (
            <motion.div
              key="story-feed"
              className="story-feed-vertical"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <p className="section-label">My Status</p>
              <div className="story-list-item mine" onClick={() => setIsPostingStory(true)}>
                <div className="avatar-wrapper">
                  <div className="avatar" style={{ border: '2px dashed var(--primary)', background: 'rgba(var(--primary-rgb), 0.1)' }}>
                    {user?.photoURL ? <img src={user.photoURL} alt="" /> : user?.displayName?.[0]}
                    <div className="add-badge">+</div>
                  </div>
                </div>
                <div className="story-info">
                  <p className="username">Post to Story</p>
                  <p className="subtitle">Tap to share a moment</p>
                </div>
              </div>

              <p className="section-label">Recent Updates</p>
              {Object.values(stories.reduce((acc: any, s) => {
                if (!acc[s.uid]) acc[s.uid] = [];
                acc[s.uid].push(s);
                return acc;
              }, {})).map((userStories: any) => {
                const latest = userStories[0];
                const isMe = latest.uid === user?.uid;

                return (
                  <div key={latest.uid} className="story-list-item" onClick={() => setActiveStoryIndex(stories.findIndex(s => s.uid === latest.uid))}>
                    <div className="avatar-wrapper">
                      <div className={`avatar active-ring ${isMe ? 'mine-ring' : ''}`}>
                        {latest.avatar ? <img src={latest.avatar} alt="" /> : latest.username[0]}
                      </div>
                    </div>
                    <div className="story-info">
                      <p className="username">{isMe ? "My Story" : latest.username}</p>
                      <p className="subtitle">{userStories.length} updates • {isMe ? "View your status" : "Secure Story"}</p>
                    </div>
                  </div>
                );
              })}
              {stories.length === 0 && <div className="no-results">No stories yet. Be the first to share!</div>}
            </motion.div>
          ) : (
            <motion.div
              key="chats"
              className="recent-chats"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              <p className="section-label">Recent Conversations</p>
              {!chatsLoading ? (
                recentChats.length > 0 ? recentChats.map((chat) => (
                  <motion.div
                    key={chat.id}
                    variants={itemVariants}
                    className={`chat-item-container ${chat.isUnread ? "unread" : ""}`}
                    onClick={() => onSelectChat(chat.id, chat.recipient)}
                    onContextMenu={(e) => openChatMenu(e, chat.id, chat.recipient.username)}
                    whileHover={{ x: 5, background: "rgba(255, 255, 255, 0.03)" }}
                  >
                    <div className="avatar-wrapper">
                      <div className="avatar" style={{ background: chat.recipient.username?.toLowerCase().includes('minakshi') ? '#9333ea' : 'var(--primary)' }}>
                        {chat.recipient.avatar ? <img src={chat.recipient.avatar} alt="Avatar" /> : chat.recipient.username[0].toUpperCase()}
                      </div>
                      {chat.recipient.status === 'online' && <div className="online-indicator" />}
                    </div>
                    <div className="chat-info">
                      <div className="chat-info-top">
                        <p className="username">{chat.recipient.username}</p>
                        <span className="time">{formatTime(chat.updatedAt)}</span>
                      </div>
                      <div className="chat-info-bottom">
                        <p className="last-message">
                          {chat.lastMessage || "Start a conversation"}
                        </p>
                        {chat.isUnread && <div className="unread-badge" />}
                      </div>
                    </div>
                  </motion.div>
                )) : (
                  <div className="no-chats">No conversations yet</div>
                )
              ) : (
                <div className="skeleton-container">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="skeleton-chat-item">
                      <div className="skeleton-avatar" />
                      <div className="skeleton-info">
                        <div className="skeleton-line short" />
                        <div className="skeleton-line long" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* PROFILE DROPDOWN */}
      <AnimatePresence>
        {profileMenuOpen && (
          <motion.div
            ref={profileMenuRef}
            className="fixed-dropdown glass"
            style={{ top: profileMenuOpen.y + 10, left: profileMenuOpen.x - 180, zIndex: 1000 }}
            variants={dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="dropdown-item" onClick={() => { onShowSettings(); setProfileMenuOpen(null); }}>
              <UserIcon size={14} /> <span>Profile</span>
            </div>
            <div className="dropdown-item" onClick={() => { onShowSettings(); setProfileMenuOpen(null); }}>
              <Settings size={14} /> <span>Settings</span>
            </div>
            <div className="dropdown-item danger" onClick={() => { auth.signOut(); setProfileMenuOpen(null); }}>
              <LogOut size={14} /> <span>Sign Out</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CHAT ITEM DROPDOWN */}
      <AnimatePresence>
        {chatMenuConfig && (
          <motion.div
            ref={chatMenuRef}
            className="fixed-dropdown glass"
            style={{ top: chatMenuConfig.y, left: chatMenuConfig.x - 180, zIndex: 1000 }}
            variants={dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="dropdown-header">{chatMenuConfig.recipientName}</div>
            <div className="dropdown-item" onClick={() => {
              const chat = recentChats.find(c => c.id === chatMenuConfig.chatId);
              if (chat) handleStartCall(chatMenuConfig.chatId, chat.recipient, 'audio');
              setChatMenuConfig(null);
            }}>
              <Phone size={14} /> <span>Voice Call</span>
            </div>
            <div className="dropdown-item" onClick={() => {
              const chat = recentChats.find(c => c.id === chatMenuConfig.chatId);
              if (chat) handleStartCall(chatMenuConfig.chatId, chat.recipient, 'video');
              setChatMenuConfig(null);
            }}>
              <Video size={14} /> <span>Video Call</span>
            </div>
            <div className="dropdown-item danger" onClick={() => { if (window.confirm("Clear all messages?")) clearChatMessages(chatMenuConfig.chatId, user!.uid); setChatMenuConfig(null); }}>
              <Eraser size={14} /> <span>Clear Chat</span>
            </div>
            <div className="dropdown-item danger" style={{ marginTop: "4px", borderTop: "1px solid var(--border)", paddingTop: "8px" }} onClick={() => { if (window.confirm("Unfriend and remove chat?")) deleteLocalChat(user!.uid, chatMenuConfig.chatId); setChatMenuConfig(null); }}>
              <UserMinus size={14} /> <span>Unfriend</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* STORY VIEWER OVERLAY */}
      {activeStoryIndex !== null && (
        <StoryViewer
          stories={stories}
          initialIndex={activeStoryIndex}
          onClose={() => setActiveStoryIndex(null)}
        />
      )}

      {/* VERSION BADGE */}
      <div style={{ padding: '1rem', textAlign: 'center', opacity: 0.3, fontSize: '0.65rem', borderTop: '1px solid var(--border)' }}>
        SECUREM v2.5.0 • Build 1800
      </div>

      <style>{`
        .story-bar-premium {
          display: flex;
          gap: 1rem;
          padding: 1.25rem;
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          margin-bottom: 1rem;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .story-bar-premium::-webkit-scrollbar { display: none; }

        .story-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          min-width: 75px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .story-ring {
          position: relative;
          padding: 3px;
          border-radius: 24px;
          background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }

        .story-ring.mine {
          background: rgba(255, 255, 255, 0.05);
          border: 2px dashed rgba(255, 255, 255, 0.15);
          padding: 2px;
        }

        .story-ring.active {
          animation: ring-pulse 2.5s infinite ease-in-out;
        }

        @keyframes ring-pulse {
          0% { box-shadow: 0 0 0 0 rgba(220, 39, 67, 0.4); transform: scale(1); }
          50% { box-shadow: 0 0 0 10px rgba(220, 39, 67, 0); transform: scale(1.02); }
          100% { box-shadow: 0 0 0 0 rgba(220, 39, 67, 0); transform: scale(1); }
        }

        .avatar {
          width: 56px;
          height: 56px;
          border-radius: 20px;
          background: var(--bg-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 1.2rem;
          border: 3px solid var(--bg-dark);
          overflow: hidden;
          position: relative;
        }

        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .add-icon {
          position: absolute;
          bottom: -2px;
          right: -2px;
          background: var(--primary);
          color: white;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          border: 3px solid var(--bg-dark);
          font-weight: bold;
        }

        .story-username {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--text-muted);
          width: 70px;
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          opacity: 0.8;
        }

        /* TAB SWITCHER */
        .tab-switcher-premium {
          display: flex;
          padding: 8px;
          margin: 0 1rem 1rem;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 16px;
          position: relative;
          gap: 4px;
        }

        .tab-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          z-index: 2;
          transition: color 0.3s ease;
        }

        .tab-btn.active { color: white; }

        .tab-indicator {
          position: absolute;
          top: 8px;
          bottom: 8px;
          width: calc(50% - 6px);
          background: var(--primary);
          border-radius: 12px;
          z-index: 1;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .tab-indicator.stories { transform: translateX(100%); }

        /* VERTICAL STORY FEED */
        .story-feed-vertical {
          padding: 0 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .story-list-item {
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 12px;
          border-radius: 20px;
          cursor: pointer;
          transition: background 0.3s ease;
        }

        .story-list-item:hover { background: rgba(255,255,255,0.03); }

        .story-list-item .avatar {
          width: 52px;
          height: 52px;
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          position: relative;
        }

        .story-list-item .active-ring {
          padding: 2px;
          border: 2px solid var(--primary);
        }

        .story-list-item .mine-ring {
          border-color: #3b82f6;
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.3);
        }

        .add-badge {
          position: absolute;
          bottom: -2px;
          right: -2px;
          background: var(--primary);
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          border: 2px solid var(--bg-dark);
        }

        .story-info { display: flex; flex-direction: column; gap: 2px; }
        .story-info .username { font-weight: 700; font-size: 0.95rem; margin: 0; }
        .story-info .subtitle { font-size: 0.75rem; color: var(--text-muted); margin: 0; }

        /* SKELETON LOADING */
        .skeleton-container {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0 1rem;
        }

        .skeleton-chat-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 12px;
          border-radius: 20px;
          background: rgba(255,255,255,0.02);
          overflow: hidden;
          position: relative;
        }

        .skeleton-avatar {
          width: 48px;
          height: 48px;
          border-radius: 16px;
          background: rgba(255,255,255,0.05);
        }

        .skeleton-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .skeleton-line {
          height: 12px;
          border-radius: 6px;
          background: rgba(255,255,255,0.05);
          position: relative;
          overflow: hidden;
        }

        .skeleton-line.short { width: 40%; }
        .skeleton-line.long { width: 80%; }

        .skeleton-chat-item::after,
        .skeleton-line::after {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
          animation: skeleton-shimmer 1.5s infinite linear;
        }

        @keyframes skeleton-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </aside>
  );
};

export default Sidebar;
