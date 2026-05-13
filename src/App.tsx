import React, { useState, useEffect, Suspense, lazy } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "./context/AuthContext";
import { useCrypto } from "./context/CryptoContext";
import { type UserProfile, getUserProfile } from "./services/userService";
import { auth } from "./services/firebase";
import { ShieldAlert, Lock } from "lucide-react";
import { PrivacyPolicy, TermsOfService, AboutSecurem } from "./components/Pages/Legal";
import { listenForCalls, startCall } from "./services/chatService";

// Lazy load components for better initial performance
import Login from "./components/Auth/Login";
import Signup from "./components/Auth/Signup";
import Sidebar from "./components/Chat/Sidebar";
import ChatWindow from "./components/Chat/ChatWindow";
const CallOverlay = lazy(() => import("./components/Chat/CallOverlay"));
const SettingsPage = lazy(() => import("./components/Chat/SettingsPage"));

/**
 * Modern Animated Splash Screen for premium first impression
 */
const LoadingSkeleton = () => (
  <motion.div 
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0, scale: 1.05 }}
    className="auth-container"
    style={{ position: 'fixed', inset: 0, zIndex: 5000 }}
  >
    <motion.div 
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="auth-card glass" 
      style={{ 
        height: "400px", 
        display: "flex", 
        flexDirection: "column",
        alignItems: "center", 
        justifyContent: "center",
        boxShadow: "0 20px 50px rgba(0,0,0,0.3)"
      }}
    >
      <motion.div
        animate={{ 
          scale: [1, 1.1, 1],
          rotate: [0, 5, -5, 0]
        }}
        transition={{ 
          duration: 3, 
          repeat: Infinity,
          ease: "easeInOut"
        }}
        style={{ color: "var(--primary)", marginBottom: "2rem" }}
      >
        <Lock size={64} />
      </motion.div>
      <div style={{ textAlign: "center" }}>
        <motion.div 
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "0.5rem", background: "linear-gradient(135deg, var(--primary), #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
        >
          Securem
        </motion.div>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: 0.4 }}
          style={{ fontSize: "0.875rem", letterSpacing: "0.1em", textTransform: "uppercase" }}
        >
          Preparing secure environment
        </motion.div>
        <div style={{ display: "flex", gap: "4px", justifyContent: "center", marginTop: "1rem" }}>
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--primary)" }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  </motion.div>
);

const App: React.FC = () => {
  const { user, profile, settings, loading: authLoading } = useAuth();
  const { isUnlocked, unlock } = useCrypto();
  
  useEffect(() => {
    console.log("%c        SECUREM v2.2.5 • Build 1747", "background: #6366f1; color: white; font-weight: bold; padding: 4px; border-radius: 4px;");
  }, []);

  const [isLogin, setIsLogin] = useState(true);
  const [view, setView] = useState<"app" | "privacy" | "terms" | "about" | "settings">("app");
  const [selectedRecipient, setSelectedRecipient] = useState<UserProfile | null>(null);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [activeCall, setActiveCall] = useState<any>(null);

  useEffect(() => {
    if (settings.appearance.theme) {
      document.documentElement.setAttribute('data-theme', settings.appearance.theme);
    }
    document.documentElement.setAttribute('data-glass', settings.appearance.glassmorphism.toString());
    document.documentElement.setAttribute('data-font-size', settings.appearance.fontSize);
  }, [settings.appearance.theme, settings.appearance.glassmorphism, settings.appearance.fontSize]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[App] Unlock requested...");
    setUnlocking(true);
    setUnlockError("");
    try {
      const backup = profile?.encryptedPrivateKey ? {
        priv: profile.encryptedPrivateKey,
        sign: profile.encryptedSigningKey || "",
        salt: profile.keySalt || ""
      } : undefined;

      console.log("[App] Calling crypto.unlock with backup:", !!backup);
      await unlock(unlockPassword, backup);
      console.log("[App] crypto.unlock completed successfully.");
    } catch (err: any) {
      console.error("[App] Unlock failed:", err);
      setUnlockError(err.message);
    } finally {
      console.log("[App] Unlock process finished.");
      setUnlocking(false);
    }
  };

  useEffect(() => {
    let unsubscribe: () => void;
    if (user && isUnlocked) {
      unsubscribe = listenForCalls(user.uid, async (call) => {
        if (call) {
          const isIncoming = call.callerId !== user.uid;
          let finalCall = { 
            ...call, 
            isIncoming,
            type: call.callType || call.type || 'audio', 
            // Remote user info (the person on the other end)
            remoteUsername: "Secure User",
            remoteAvatar: null as string | null
          };

          if (isIncoming) {
            finalCall.remoteUsername = call.callerUsername || "Secure User";
            finalCall.remoteAvatar = call.callerAvatar || null;
          } else {
            finalCall.remoteUsername = call.recipientUsername || "Secure User";
            finalCall.remoteAvatar = call.recipientAvatar || null;
          }
          
          console.log(`[App] 📞 Signaling Sync. ID: ${call.id}, Remote: ${finalCall.remoteUsername}`);

          if (isIncoming && !call.callerUsername) {
            try {
              console.log(`[App] Fallback: Fetching profile for caller: ${call.callerId}`);
              const callerProfile = await getUserProfile(call.callerId);
              if (callerProfile) {
                finalCall.remoteUsername = callerProfile.username;
                finalCall.remoteAvatar = callerProfile.avatar;
              }
            } catch (err) {
              console.error("[App] Failed to fetch caller profile:", err);
            }
          }
          
          console.log(`[App] 📞 Call State: ${finalCall.type}, Incoming: ${isIncoming}, Remote: ${finalCall.remoteUsername}`);
          
          setActiveCall((prev: any) => {
            // Priority 1: Keep current outgoing call if we are the caller
            if (prev && !prev.isIncoming && isIncoming) {
              console.log("[App] Incoming call ignored; Outgoing call has priority.");
              return prev;
            }
            // Priority 2: Update with fresh data (incoming or manual outgoing)
            return finalCall;
          });
        } else {
          // IMPORTANT: Only clear if the current active call was an INCOMING one.
          // If we are currently making an OUTGOING call, do not clear it.
          setActiveCall((prev: any) => {
            if (prev && !prev.isIncoming) {
              console.log("[App] Incoming listener returned null, but keeping outgoing call active.");
              return prev;
            }
            return null;
          });
        }
      });
    }
    return () => unsubscribe && unsubscribe();
  }, [user, isUnlocked]);

  const pageTransition = {
    initial: { opacity: 0, x: -10 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 10 }
  };

  return (
    <Suspense fallback={<LoadingSkeleton />}>
      {authLoading ? (
        <LoadingSkeleton key="loading" />
      ) : view === "privacy" ? (
        <motion.div key="privacy" {...pageTransition} style={{ position: 'fixed', inset: 0, zIndex: 2000 }}>
          <PrivacyPolicy onClose={() => setView("app")} />
        </motion.div>
      ) : view === "terms" ? (
        <motion.div key="terms" {...pageTransition} style={{ position: 'fixed', inset: 0, zIndex: 2000 }}>
          <TermsOfService onClose={() => setView("app")} />
        </motion.div>
      ) : view === "about" ? (
        <motion.div key="about" {...pageTransition} style={{ position: 'fixed', inset: 0, zIndex: 2000 }}>
          <AboutSecurem onClose={() => setView("app")} />
        </motion.div>
      ) : !user ? (
        <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="auth-container">
          <AnimatePresence mode="wait">
            {isLogin ? (
              <motion.div key="login" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <Login onToggle={() => setIsLogin(false)} />
              </motion.div>
            ) : (
              <motion.div key="signup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <Signup onToggle={() => setIsLogin(true)} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ) : !profile ? (
        <motion.div key="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="auth-container">
          <Signup onToggle={() => setIsLogin(true)} />
        </motion.div>
      ) : !isUnlocked ? (
        <motion.div key="locked" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }} className="auth-container">
          <div className="auth-card glass" style={{ textAlign: "center" }}>
            <motion.div 
              initial={{ rotate: -15 }} 
              animate={{ rotate: 0 }} 
              transition={{ type: "spring" as const, stiffness: 200 }}
              style={{ marginBottom: "2rem", display: "inline-flex", padding: "1.5rem", borderRadius: "50%", background: "rgba(var(--primary-rgb), 0.1)", color: "var(--primary)" }}
            >
              <Lock size={40} />
            </motion.div>
            <h1 style={{ marginBottom: "0.75rem", fontSize: "1.75rem" }}>Identity Locked</h1>
            <p style={{ marginBottom: "2rem", fontSize: "0.9375rem" }}>
              Welcome back, <strong>{profile.username}</strong>.<br />
              Enter your Crypto Password to unlock your secure vault.
            </p>
            <form onSubmit={handleUnlock}>
              <input 
                type="password" 
                placeholder="Enter Crypto Password" 
                required 
                autoFocus
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                style={{ marginBottom: "1.25rem", textAlign: "center" }}
              />
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" className="btn-primary" style={{ width: "100%" }} disabled={unlocking}>
                {unlocking ? "Decrypting Keys..." : "Unlock Vault"}
              </motion.button>
            </form>
            {unlockError && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass" style={{ marginTop: "1rem", padding: "0.75rem", borderRadius: "12px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                <p style={{ color: "var(--error)", margin: 0, fontSize: "0.875rem" }}>{unlockError}</p>
              </motion.div>
            )}
            <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)" }}>
              <p style={{ fontSize: "0.8125rem", marginBottom: "1rem" }}>Not you? Switch to another account.</p>
              <button onClick={() => auth.signOut()} className="btn-secondary" style={{ width: "100%", fontSize: "0.875rem" }}>Sign Out</button>
            </div>
          </div>
        </motion.div>
      ) : (
        <div key="app" className={`app-container ${selectedRecipient ? 'has-selected-chat' : ''}`}>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: '#ef4444', color: 'white', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', zIndex: 10000, padding: '4px' }}>
            <span style={{ fontSize: '10px', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>v2.2.5</span> LATEST VERSION DEPLOYED: v2.2.5 - IF YOU SEE THIS, YOU ARE UPDATED.
          </div>
          <Sidebar 
            onSelectChat={(_, recipient) => setSelectedRecipient(recipient)} 
            onShowSettings={() => setView("settings")}
            onInitiateCall={async (callData) => {
              const fullCallData = {
                ...callData,
                chatId: callData.chatId || "direct",
                callerId: user.uid,
                recipientUsername: callData.recipientUsername || "Secure User",
                remoteUsername: callData.recipientUsername || "Secure User",
                remoteAvatar: callData.recipientAvatar || null
              };
              await startCall(
                fullCallData.chatId, 
                fullCallData.callerId, 
                fullCallData.recipientId, 
                fullCallData.type,
                profile?.username,
                profile?.avatar,
                fullCallData.recipientUsername,
                fullCallData.recipientAvatar
              );
              setActiveCall({ ...fullCallData, isIncoming: false });
            }}
          />
          <AnimatePresence mode="wait">
            {selectedRecipient ? (
              <motion.div 
                key={selectedRecipient.uid}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                style={{ flex: 1, height: "100%", overflow: "hidden" }}
              >
                <ChatWindow 
                  recipient={selectedRecipient} 
                  onInitiateCall={(callData) => {
                    const fullCallData = {
                      ...callData,
                      chatId: callData.chatId || "direct",
                      callerId: user.uid,
                      recipientAvatar: selectedRecipient.avatar,
                      remoteUsername: selectedRecipient.username,
                      remoteAvatar: selectedRecipient.avatar
                    };
                    startCall(
                      fullCallData.chatId, 
                      fullCallData.callerId, 
                      fullCallData.recipientId, 
                      fullCallData.type,
                      profile?.username,
                      profile?.avatar,
                      fullCallData.recipientUsername,
                      fullCallData.recipientAvatar
                    );
                    setActiveCall({ ...fullCallData, isIncoming: false });
                  }}
                  onBack={() => setSelectedRecipient(null)} 
                />
              </motion.div>
            ) : (
              <motion.main 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="chat-window" 
                style={{ display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "2rem" }}
              >
                <div>
                  <motion.div 
                    animate={{ scale: [0.95, 1, 0.95] }} 
                    transition={{ repeat: Infinity, duration: 4 }} 
                    style={{ marginBottom: "1.5rem", color: "var(--primary)" }}
                  >
                    <ShieldAlert size={64} style={{ margin: "0 auto", opacity: 0.5 }} />
                  </motion.div>
                  <h2 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Your Privacy, Guaranteed.</h2>
                  <p style={{ color: "var(--text-muted)", maxWidth: "400px" }}>
                    Securem uses end-to-end encryption. Only you and your contacts have the keys to read your messages.
                  </p>
                </div>
              </motion.main>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {view === 'settings' && (
              <motion.div 
                initial={{ opacity: 0, x: '100%' }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: '100%' }}
                transition={{ type: "spring" as const, damping: 25, stiffness: 200 }}
                style={{ position: 'absolute', inset: 0, zIndex: 1100 }}
              >
                <SettingsPage onClose={() => setView('app')} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {activeCall && (
          <motion.div 
            key={`${activeCall.callerId}_${activeCall.recipientId}_${activeCall.chatId}`}
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            style={{ position: 'fixed', inset: 0, zIndex: 3000 }}
          >
            <Suspense fallback={<LoadingSkeleton />}>
              <CallOverlay 
                call={activeCall} 
                isIncoming={activeCall.isIncoming}
                onClose={() => setActiveCall(null)} 
              />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </Suspense>
  );
};

export default App;

