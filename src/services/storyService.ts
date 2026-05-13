import { ref, set, push, serverTimestamp, onValue } from "firebase/database";
import { rtdb } from "./firebase";

export interface Story {
  id: string;
  uid: string;
  username: string;
  avatar?: string;
  type: 'text' | 'image' | 'video' | 'audio';
  content: string; // Text content or Base64 media
  timestamp: any;
  expiresAt: number;
  musicData?: {
    title: string;
    artist: string;
  };
}

const STORY_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export const postStory = async (
  uid: string, 
  username: string, 
  avatar: string | undefined, 
  type: 'text' | 'image' | 'video' | 'audio', 
  content: string,
  musicData?: { title: string, artist: string }
) => {
  const storyRef = push(ref(rtdb, 'stories'));
  const timestamp = Date.now();
  
  await set(storyRef, {
    id: storyRef.key,
    uid,
    username,
    avatar: avatar || null,
    type,
    content,
    timestamp: serverTimestamp(),
    expiresAt: timestamp + STORY_DURATION,
    musicData: musicData || null
  });
};

export const subscribeToActiveStories = (callback: (stories: Story[]) => void) => {
  const storiesRef = ref(rtdb, 'stories');
  return onValue(storiesRef, (snapshot) => {
    const now = Date.now();
    if (snapshot.exists()) {
      const data = snapshot.val();
      const stories: Story[] = Object.values(data)
        .filter((s: any) => s.expiresAt > now)
        .sort((a: any, b: any) => b.timestamp - a.timestamp) as Story[];
      callback(stories);
    } else {
      callback([]);
    }
  });
};
export const deleteStory = async (storyId: string) => {
  const storyRef = ref(rtdb, `stories/${storyId}`);
  await set(storyRef, null);
};
