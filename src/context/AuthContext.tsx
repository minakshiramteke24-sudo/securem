import React, { createContext, useContext, useEffect, useState } from "react";
import { type User, onAuthStateChanged } from "firebase/auth";
import { ref, onValue } from "firebase/database";
import { auth, rtdb } from "../services/firebase";
import { type UserProfile } from "../services/userService";
import { type UserSettings, defaultSettings } from "../services/settingsService";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  settings: UserSettings;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  updateProfileState: (profile: UserProfile) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      console.log("[Auth] State changed:", firebaseUser?.uid || "No user");
      
      // Cleanup previous profile listener if any
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (firebaseUser) {
        setUser(firebaseUser);
        
        // Setup real-time listeners for profile and settings
        const userRef = ref(rtdb, `users/${firebaseUser.uid}`);
        unsubscribeProfile = onValue(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.val();
            setProfile(data);
            if (data.settings) {
              setSettings({ 
                ...defaultSettings, 
                ...data.settings,
                privacy: { ...defaultSettings.privacy, ...data.settings.privacy },
                appearance: { ...defaultSettings.appearance, ...data.settings.appearance },
                chat: { ...defaultSettings.chat, ...data.settings.chat }
              });
            }
          } else {
            console.warn(`[Auth] No profile found for user ${firebaseUser.uid}`);
            setProfile(null);
          }
          setLoading(false);
        }, (error) => {
          console.error("[Auth] Profile listener error:", error);
          setLoading(false);
        });
      } else {
        setUser(null);
        setProfile(null);
        setSettings(defaultSettings);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const refreshProfile = async () => {};

  const updateProfileState = (newProfile: UserProfile) => {
    setProfile(newProfile);
  };

  return (
    <AuthContext.Provider value={{ user, profile, settings, loading, refreshProfile, updateProfileState }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
