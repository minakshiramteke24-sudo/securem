import { ref, update, get } from "firebase/database";
import { rtdb } from "./firebase";
import { compressImage } from "../utils/imageCompression";

export interface UserSettings {
  privacy: {
    onlineStatus: 'everyone' | 'contacts' | 'nobody';
    lastSeen: 'everyone' | 'contacts' | 'nobody';
    profilePhoto: 'everyone' | 'contacts' | 'nobody';
    readReceipts: boolean;
    typingIndicators: boolean;
    stealthMode?: boolean;
  };
  appearance: {
    theme: 'dark' | 'light' | 'system';
    accentColor: string;
    glassmorphism: boolean;
    fontSize: 'small' | 'medium' | 'large';
    wallpaper?: string;
  };
  chat: {
    wallpaper: string;
    enterToSend: boolean;
    mediaQuality: 'auto' | 'high' | 'data-saver';
  };
  notifications: {
    enabled: boolean;
    sound: boolean;
    preview: boolean;
  };
}

export const defaultSettings: UserSettings = {
  privacy: {
    onlineStatus: 'everyone',
    lastSeen: 'everyone',
    profilePhoto: 'everyone',
    readReceipts: true,
    typingIndicators: true,
    stealthMode: false,
  },
  appearance: {
    theme: 'dark',
    accentColor: '#6366f1',
    glassmorphism: true,
    fontSize: 'medium',
    wallpaper: 'default',
  },
  chat: {
    wallpaper: 'default',
    enterToSend: true,
    mediaQuality: 'auto',
  },
  notifications: {
    enabled: true,
    sound: true,
    preview: true,
  },
};

/**
 * Update user settings in RTDB
 */
export const updateUserSettings = async (uid: string, updates: Partial<UserSettings>): Promise<void> => {
  const settingsPath = `users/${uid}/settings`;
  await update(ref(rtdb, settingsPath), updates);
};

/**
 * Get user settings
 */
export const getUserSettings = async (uid: string): Promise<UserSettings> => {
  const snapshot = await get(ref(rtdb, `users/${uid}/settings`));
  return snapshot.exists() ? snapshot.val() : defaultSettings;
};

/**
 * Upload profile picture with compression and error handling
 */
export const uploadProfilePicture = async (uid: string, file: File): Promise<string> => {
  console.log(`[Database] Starting Base64 upload for user: ${uid}, original size: ${(file.size / 1024).toFixed(2)}KB`);
  
  try {
    // 1. Compress Image to a very small size (150x150) for DB efficiency
    const compressedBlob = await compressImage(file, 150, 150, 0.6);
    console.log(`[Database] Compression complete. New size: ${(compressedBlob.size / 1024).toFixed(2)}KB`);

    // 2. Convert Blob to Base64 String
    const base64String = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(compressedBlob);
    });

    // 3. Update Profile directly in RTDB
    // This bypasses the need for Firebase Storage entirely
    await update(ref(rtdb, `users/${uid}`), { avatar: base64String });
    console.log(`[Database] Profile updated with Base64 avatar`);
    
    return base64String;
  } catch (error: any) {
    console.error(`[Database] Base64 Upload failed:`, error);
    throw new Error(error.message || 'Unknown error during conversion');
  }
};

/**
 * Remove profile picture
 */
export const removeProfilePicture = async (uid: string): Promise<void> => {
  try {
    await update(ref(rtdb, `users/${uid}`), { avatar: null });
    // Note: We typically keep the file in storage or delete it if needed.
    // For now, we just null the reference in the profile.
  } catch (error) {
    console.error(`[Storage] Failed to remove avatar:`, error);
    throw error;
  }
};
