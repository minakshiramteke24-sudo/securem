import { rtdb, storage } from "./firebase";
import { ref, push, set, onValue, off, update, increment } from "firebase/database";
import { ref as sRef, uploadBytes, getDownloadURL } from "firebase/storage";

export interface Reel {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  videoUrl: string;
  caption: string;
  likes: number;
  views: number;
  createdAt: number;
}

export const uploadReel = async (
  userId: string, 
  username: string, 
  avatar: string, 
  file: File, 
  caption: string
): Promise<string> => {
  // 1. Upload Video to Storage
  const reelId = push(ref(rtdb, 'reels')).key!;
  const storagePath = `reels/${userId}/${reelId}_${file.name}`;
  const storageRef = sRef(storage, storagePath);
  
  await uploadBytes(storageRef, file);
  const videoUrl = await getDownloadURL(storageRef);

  // 2. Save Metadata to RTDB
  const reelData: Reel = {
    id: reelId,
    creatorId: userId,
    creatorName: username,
    creatorAvatar: avatar,
    videoUrl,
    caption,
    likes: 0,
    views: 0,
    createdAt: Date.now()
  };

  await set(ref(rtdb, `reels/${reelId}`), reelData);
  return reelId;
};

export const subscribeToReels = (callback: (reels: Reel[]) => void) => {
  const reelsRef = ref(rtdb, 'reels');
  const unsubscribe = onValue(reelsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const reelsList: Reel[] = Object.values(data);
      // Sort by newest first
      reelsList.sort((a, b) => b.createdAt - a.createdAt);
      callback(reelsList);
    } else {
      callback([]);
    }
  });
  return () => off(reelsRef, 'value', unsubscribe);
};

export const likeReel = async (reelId: string) => {
  const reelRef = ref(rtdb, `reels/${reelId}`);
  await update(reelRef, {
    likes: increment(1)
  });
};

export const incrementView = async (reelId: string) => {
  const reelRef = ref(rtdb, `reels/${reelId}`);
  await update(reelRef, {
    views: increment(1)
  });
};
