import { rtdb } from "./firebase";
import { ref, push, set, onValue, off, update, increment } from "firebase/database";

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
  videoBase64: string, 
  caption: string
): Promise<string> => {
  const reelId = push(ref(rtdb, 'reels')).key!;

  // 2. Save Metadata to RTDB
  const reelData: Reel = {
    id: reelId,
    creatorId: userId,
    creatorName: username,
    creatorAvatar: avatar,
    videoUrl: videoBase64,
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

export const unlikeReel = async (reelId: string) => {
  const reelRef = ref(rtdb, `reels/${reelId}`);
  await update(reelRef, {
    likes: increment(-1)
  });
};

export const incrementView = async (reelId: string) => {
  const reelRef = ref(rtdb, `reels/${reelId}`);
  await update(reelRef, {
    views: increment(1)
  });
};

export interface ReelComment {
  id: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  createdAt: number;
}

export const addReelComment = async (
  reelId: string, 
  authorName: string, 
  authorAvatar: string, 
  text: string
) => {
  const commentRef = push(ref(rtdb, `reels/${reelId}/comments`));
  await set(commentRef, {
    id: commentRef.key,
    authorName,
    authorAvatar,
    text,
    createdAt: Date.now()
  });
};

export const subscribeToReelComments = (
  reelId: string, 
  callback: (comments: ReelComment[]) => void
) => {
  const commentsRef = ref(rtdb, `reels/${reelId}/comments`);
  const unsubscribe = onValue(commentsRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const list: ReelComment[] = Object.values(data);
      list.sort((a, b) => b.createdAt - a.createdAt); // Newest first
      callback(list);
    } else {
      callback([]);
    }
  });
  return () => off(commentsRef, 'value', unsubscribe);
};
