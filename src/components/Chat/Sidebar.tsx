import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, User as UserIcon, Check, Phone, Video, Eraser, UserMinus, Settings, LogOut, Plus } from "lucide-react";
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

  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [creatorType, setCreatorType] = useState<'text' | 'image' | 'video' | 'audio' | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [stories, setStories] = useState<Story[]>([]);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [isPostingStory, setIsPostingStory] = useState(false);

  // Menu states
  const [profileMenuOpen, setProfileMenuOpen] = useState<{ x: number, y: number } | null>(null);
  const [chatMenuConfig, setChatMenuConfig] = useState<{ x: number, y: number, chatId: string, recipientName: string } | null>(null);

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const chatMenuRef = useRef<HTMLDivElement>(null);

  // Theme detection for explicit colors
  const [isDarkMode, setIsDarkMode] = useState(true);
  useEffect(() => {
    const checkTheme = () => {
      setIsDarkMode(document.documentElement.getAttribute('data-theme') !== 'light');
    };
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true });
    checkTheme();
    return () => observer.disconnect();
  }, []);

  const dotColor = isDarkMode ? "#ffffff" : "#1c1e21";

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

  const toggleProfileMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setProfileMenuOpen({ x: rect.right, y: rect.bottom });
  };

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
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsCreatorOpen(true)}
              style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)', padding: '8px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Create Story"
            >
              <Plus size={20} />
            </motion.button>
            <button
              onClick={toggleProfileMenu}
              className={`dots-btn ${profileMenuOpen ? 'active' : ''}`}
              title="More options"
              style={{ fontSize: '28px', fontWeight: 'bold', color: dotColor, lineHeight: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ⋮
            </button>
          </div>
        </div>

        <div className="search-bar">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search users or chats..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </motion.div>

      {/* STORIES REEL */}
      {!searchTerm && (
        <div className="stories-container">
          <div className="story-item add-story" onClick={() => setIsCreatorOpen(true)}>
            <div className="story-ring">
              <div className="avatar">
                {profile?.avatar ? <img src={profile.avatar} alt="Me" /> : profile?.username?.[0].toUpperCase()}
              </div>
              <div className="plus-icon">
                {isPostingStory ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><Plus size={10} /></motion.div> : <Plus size={12} strokeWidth={4} />}
              </div>
            </div>
            <span className="story-username">My Story</span>
          </div>

          <AnimatePresence>
            {isCreatorOpen && (
              <StoryCreator
                initialType={creatorType}
                onClose={() => { setIsCreatorOpen(false); setCreatorType(null); }}
                onPost={async (type, content, musicData) => {
                  if (!user || !profile) return;
                  setIsPostingStory(true);
                  try {
                    await postStory(user.uid, profile.username || "Secure User", profile.avatar, type, content, musicData);
                  } finally {
                    setIsPostingStory(false);
                  }
                }}
              />
            )}
          </AnimatePresence>

          {stories.map((story, idx) => (
            <motion.div
              key={story.id}
              className="story-item"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setActiveStoryIndex(idx)}
            >
              <div className="story-ring active">
                <div className="avatar">
                  {story.avatar ? <img src={story.avatar} alt={story.username} /> : story.username[0].toUpperCase()}
                </div>
              </div>
              <span className="story-username">{story.username}</span>
            </motion.div>
          ))}
        </div>
      )}

      {/* CHAT LIST / SEARCH RESULTS */}
      <div className="sidebar-content">
        <AnimatePresence mode="wait">
          {searchTerm.length >= 2 ? (
            <motion.div
              key="search"
              className="search-results"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              <p className="section-label">Global Search</p>
              {searchResults.map((u) => (
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
              {searchResults.length === 0 && <div className="no-results">No users found</div>}
            </motion.div>
          ) : (
            <motion.div
              key="chats"
              className="chat-list"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <p className="section-label">Recent Conversations</p>
              {recentChats.length > 0 ? (
                recentChats.map((chat) => (
                  <motion.div
                    key={chat.id}
                    variants={itemVariants}
                    className={`chat-item-container ${chat.isUnread ? 'unread' : ''}`}
                    onClick={() => onSelectChat(chat.id, chat.recipient)}
                    whileHover={{ x: 5, background: "rgba(var(--primary-rgb), 0.05)" }}
                  >
                    <div className="chat-item-main">
                      <div className="avatar-wrapper">
                        <div className="avatar" style={{ background: chat.recipient?.username?.toLowerCase().includes('minakshi') ? '#9333ea' : 'var(--primary)' }}>
                          {chat.recipient?.avatar ? (
                            <img src={chat.recipient.avatar} alt="Avatar" />
                          ) : (
                            chat.recipient?.username?.[0]?.toUpperCase() || "?"
                          )}
                        </div>
                        {chat.isUnread && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="unread-dot" />}
                      </div>
                      <div className="chat-info">
                        <p className="username">{chat.recipient?.username || "Secure User"}</p>
                        <p className="last-message">{chat.lastMessage || "End-to-end encrypted"}</p>
                      </div>
                    </div>

                    <div className="chat-meta">
                      <span className="time">{formatTime(chat.updatedAt)}</span>
                      <button
                        className="dots-btn small"
                        onClick={(e) => openChatMenu(e, chat.id, chat.recipient?.username || "")}
                        title="Chat options"
                        style={{ fontSize: '22px', fontWeight: 'bold', color: dotColor, lineHeight: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        ⋮
                      </button>
                    </div>
                  </motion.div>
                ))
              ) : chatsLoading ? (
                null
              ) : (
                <div className="no-chats">No conversations yet</div>
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
        SECUREM v2.2.7 • Build 1749
      </div>

    </aside>
  );
};

export default Sidebar;
