import { ref, set, get, update, onDisconnect, serverTimestamp } from "firebase/database";
import { rtdb } from "./firebase";

export interface UserProfile {
  uid: string;
  username: string;
  publicKey: string;
  signingPublicKey: string;
  email: string;
  avatar?: string;
  photoURL?: string;
  status?: string;
  bio?: string;
  // Encrypted Backups (Password Protected)
  encryptedPrivateKey?: string;
  encryptedSigningKey?: string;
  keySalt?: string;
  blockedUsers?: { [uid: string]: boolean };
}

/**
 * Register a new user in Realtime Database
 */
export const registerUser = async (profile: UserProfile): Promise<void> => {
  const userRef = ref(rtdb, `users/${profile.uid}`);
  const usernameRef = ref(rtdb, `usernames/${profile.username.toLowerCase()}`);

  try {
    // Save profile and claim username
    await Promise.all([
      set(userRef, profile),
      set(usernameRef, profile.uid)
    ]);
  } catch (error) {
    console.error("Error registering user in RTDB:", error);
    throw error;
  }
};

/**
 * Check if a username is available in RTDB
 */
export const checkUsernameAvailability = async (username: string): Promise<boolean> => {
  const usernameRef = ref(rtdb, `usernames/${username.toLowerCase()}`);
  const snapshot = await get(usernameRef);
  return !snapshot.exists();
};

/**
 * Search users by username (exact match for efficiency)
 */
export const searchUsers = async (searchTerm: string): Promise<UserProfile[]> => {
  const cleanTerm = searchTerm.trim().toLowerCase();
  if (!cleanTerm) return [];

  // Exact username lookup via the usernames index (O(1) speed)
  const usernameRef = ref(rtdb, `usernames/${cleanTerm}`);
  const usernameSnap = await get(usernameRef);

  if (!usernameSnap.exists()) return [];

  const uid = usernameSnap.val();
  const profile = await getUserProfile(uid);
  return profile ? [profile] : [];
};

/**
 * Update user profile in RTDB
 */
export const updateUserProfile = async (uid: string, updates: Partial<UserProfile>): Promise<void> => {
  const userRef = ref(rtdb, `users/${uid}`);
  await update(userRef, updates);
};

/**
 * Get user profile by UID
 */
export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const userRef = ref(rtdb, `users/${uid}`);
  const snapshot = await get(userRef);
  return snapshot.exists() ? (snapshot.val() as UserProfile) : null;
};

/**
 * BLOCK/UNBLOCK USER
 */
export const toggleBlockUser = async (myUid: string, targetUid: string) => {
  const blockRef = ref(rtdb, `users/${myUid}/blockedUsers/${targetUid}`);
  const snapshot = await get(blockRef);
  
  if (snapshot.exists()) {
    await set(blockRef, null);
  } else {
    await set(blockRef, true);
  }
};

export const isUserBlocked = async (myUid: string, targetUid: string): Promise<boolean> => {
  const blockRef = ref(rtdb, `users/${myUid}/blockedUsers/${targetUid}`);
  const snapshot = await get(blockRef);
  return snapshot.exists();
};

/**
 * SET USER PRESENCE (Online/Offline)
 */
export const setUserPresence = (uid: string) => {
  const statusRef = ref(rtdb, `users/${uid}/status`);
  const lastSeenRef = ref(rtdb, `users/${uid}/lastSeen`);
  
  // Set to online
  set(statusRef, "online");
  
  // On disconnect, set to offline and record timestamp
  onDisconnect(statusRef).set("offline");
  onDisconnect(lastSeenRef).set(serverTimestamp());
};

export const updateUserStatus = async (uid: string, status: string) => {
  const statusRef = ref(rtdb, `users/${uid}/status`);
  await set(statusRef, status);
};
