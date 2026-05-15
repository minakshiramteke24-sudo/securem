import { 
  ref, 
  push, 
  set,
  remove,
  get,
  onValue,
  onChildAdded,
  query, 
  limitToLast, 
  update,
  serverTimestamp,
  onDisconnect 
} from "firebase/database";
import { rtdb } from "./firebase";
import { getUserProfile } from "./userService";
import { 
  encryptMessage, 
  signData, 
  importPublicKey, 
  generateAESKey, 
  wrapAESKey 
} from "./cryptoService";

export interface Chat {
  id: string;
  participants: { [uid: string]: boolean };
  lastMessage?: string;
  updatedAt?: any;
  isUnread?: boolean;
  type?: 'direct' | 'group';
  name?: string; // For groups
  avatar?: string; // For groups
  createdBy?: string;
}

export interface Message {
  id: string;
  senderId: string;
  ciphertext: string;
  iv: string;
  signature: string;
  wrappedKeys: { [uid: string]: string };
  timestamp: any;
  text?: string;
  edited?: boolean;
  deleted?: boolean;
  replyTo?: string; // ID of the message being replied to
  reactions?: { [emoji: string]: { [uid: string]: boolean } };
  media?: {
    url?: string;
    base64Data?: string;
    name: string;
    type: string;
    size: number;
    iv?: string; 
  };
  hiddenFor?: { [uid: string]: boolean };
  read?: boolean;
  isGhost?: boolean;
}

const getChatId = (uid1: string, uid2: string) => [uid1, uid2].sort().join("_");

// Performance Optimization: Cache for recipient profiles to speed up sidebar loading
const profileCache = new Map<string, any>();

/**
 * SEQUENTIAL HANDSHAKE: Get or Create Chat
 */
export const getOrCreateChat = async (uid1: string, uid2: string): Promise<string> => {
  const chatId = getChatId(uid1, uid2);
  const chatRef = ref(rtdb, `chats/${chatId}`);
  
  try {
    const snapshot = await get(chatRef);

    if (!snapshot.exists()) {
      const [p1, p2] = await Promise.all([getUserProfile(uid1), getUserProfile(uid2)]);
      
      await set(chatRef, {
        id: chatId,
        participants: { [uid1]: true, [uid2]: true },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      // Denormalized summaries for instant loading
      const updates: any = {};
      updates[`user-chats/${uid1}/${chatId}/summary`] = { 
        recipientId: uid2, 
        recipientName: p2?.username || "Secure User",
        recipientAvatar: p2?.avatar || null,
        active: true,
        updatedAt: serverTimestamp() 
      };
      updates[`user-chats/${uid2}/${chatId}/summary`] = { 
        recipientId: uid1, 
        recipientName: p1?.username || "Secure User",
        recipientAvatar: p1?.avatar || null,
        active: true,
        updatedAt: serverTimestamp() 
      };
      
      await update(ref(rtdb), updates);
    } else {
      // Ensure user-chat link exists if it was locally deleted
      const updates: any = {};
      updates[`user-chats/${uid1}/${chatId}/active`] = true;
      updates[`user-chats/${uid2}/${chatId}/active`] = true;
      await update(ref(rtdb), updates);
    }

    return chatId;
  } catch (error: any) {
    console.error("[ChatService] Handshake failed:", error);
    throw error;
  }
};

/**
 * CREATE GROUP CHAT
 */
export const createGroup = async (name: string, members: string[], creatorId: string) => {
  const groupId = push(ref(rtdb, 'chats')).key!;
  const timestamp = serverTimestamp();
  
  const participants: { [uid: string]: boolean } = { [creatorId]: true };
  members.forEach(uid => { participants[uid] = true; });
  
  const groupData = {
    id: groupId,
    name,
    type: 'group',
    participants,
    createdBy: creatorId,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const updates: any = {};
  updates[`chats/${groupId}`] = groupData;
  
  Object.keys(participants).forEach(uid => {
    updates[`user-chats/${uid}/${groupId}`] = { 
      active: true, 
      summary: { 
        name, 
        type: 'group', 
        updatedAt: timestamp, 
        isUnread: false 
      } 
    };
  });

  await update(ref(rtdb), updates);
  return groupId;
};

/**
 * SEQUENTIAL: Send Message
 */
export const sendMessage = async (
  chatId: string,
  senderId: string,
  recipientId: string,
  text: string,
  signingPrivateKey: CryptoKey,
  replyTo?: string,
  isGhost: boolean = false
) => {
  try {
    const [senderProfile, recipientProfile] = await Promise.all([
      getUserProfile(senderId),
      getUserProfile(recipientId)
    ]);

    if (!senderProfile || !recipientProfile) {
      throw new Error("Could not find user profiles for encryption");
    }

    const aesKey = await generateAESKey();
    const { ciphertext, iv } = await encryptMessage(text, aesKey);
    const signature = await signData(ciphertext, signingPrivateKey);

    const [senderPub, recipientPub] = await Promise.all([
      importPublicKey(senderProfile.publicKey),
      importPublicKey(recipientProfile.publicKey)
    ]);

    const [wrappedKeySender, wrappedKeyRecipient] = await Promise.all([
      wrapAESKey(aesKey, senderPub),
      wrapAESKey(aesKey, recipientPub)
    ]);

    const messageId = push(ref(rtdb, `messages/${chatId}`)).key;
    const timestamp = serverTimestamp();
    
    const messageData: any = {
      senderId, 
      ciphertext, 
      iv, 
      signature, 
      timestamp,
      wrappedKeys: { 
        [senderId]: wrappedKeySender, 
        [recipientId]: wrappedKeyRecipient 
      },
      isGhost
    };

    if (replyTo) {
      messageData.replyTo = replyTo;
    }

    // Step 1: Save the Message (Priority)
    await update(ref(rtdb, `messages/${chatId}/${messageId}`), messageData);

    const summary = {
      lastMessage: "Encrypted message",
      updatedAt: timestamp
    };

    // Step 2: Update Summaries (Denormalized for Speed)
    try {
      const updates: any = {};
      
      // Update Sender's view (recipient info)
      updates[`user-chats/${senderId}/${chatId}/summary`] = { 
        ...summary, 
        recipientId, 
        recipientName: recipientProfile.username,
        recipientAvatar: recipientProfile.avatar || null,
        isUnread: false 
      };
      updates[`user-chats/${senderId}/${chatId}/active`] = true;
      
      // Update Recipient's view (sender info)
      updates[`user-chats/${recipientId}/${chatId}/summary`] = { 
        ...summary, 
        recipientId: senderId, 
        recipientName: senderProfile.username,
        recipientAvatar: senderProfile.avatar || null,
        isUnread: true 
      };
      updates[`user-chats/${recipientId}/${chatId}/active`] = true;
      
      updates[`chats/${chatId}/updatedAt`] = timestamp;
      updates[`chats/${chatId}/lastMessage`] = "Encrypted message";
      
      await update(ref(rtdb), updates);
    } catch (e) {
      console.warn("[ChatService] Summary update failed, but message was sent.", e);
    }

  } catch (error: any) {
    console.error("[ChatService] Send flow failed:", error);
    throw error;
  }
};

/**
 * SEND MEDIA MESSAGE
 */
export const sendMediaMessage = async (
  chatId: string,
  senderId: string,
  recipientId: string,
  fileMetadata: any,
  fileKey: CryptoKey
) => {
  try {
    const [senderProfile, recipientProfile] = await Promise.all([
      getUserProfile(senderId),
      getUserProfile(recipientId)
    ]);

    const [senderPub, recipientPub] = await Promise.all([
      importPublicKey(senderProfile!.publicKey),
      importPublicKey(recipientProfile!.publicKey)
    ]);

    // Wrap the FILE AES key for both participants
    const [wrappedKeySender, wrappedKeyRecipient] = await Promise.all([
      wrapAESKey(fileKey, senderPub),
      wrapAESKey(fileKey, recipientPub)
    ]);

    const messageId = push(ref(rtdb, `messages/${chatId}`)).key;
    const timestamp = serverTimestamp();
    
    await update(ref(rtdb, `messages/${chatId}/${messageId}`), {
      senderId, 
      media: fileMetadata,
      ciphertext: "MEDIA_FILE", // Placeholder for non-text messages
      timestamp,
      wrappedKeys: { [senderId]: wrappedKeySender, [recipientId]: wrappedKeyRecipient }
    });

    const summary = {
      lastMessage: `📷 ${fileMetadata.type.startsWith('image/') ? 'Photo' : 'File'}`,
      updatedAt: timestamp
    };

    const updates: any = {};
    updates[`user-chats/${senderId}/${chatId}/summary`] = { ...summary, recipientId, isUnread: false };
    updates[`user-chats/${recipientId}/${chatId}/summary`] = { ...summary, recipientId: senderId, isUnread: true };
    updates[`chats/${chatId}/updatedAt`] = timestamp;
    await update(ref(rtdb), updates);

  } catch (error) {
    console.error("[ChatService] Media send failed:", error);
    throw error;
  }
};

/**
 * EDIT MESSAGE (Sender Only)
 */
export const editMessage = async (
  chatId: string,
  messageId: string,
  senderId: string,
  recipientId: string,
  newText: string,
  signingPrivateKey: CryptoKey
) => {
  try {
    const [senderProfile, recipientProfile] = await Promise.all([
      getUserProfile(senderId),
      getUserProfile(recipientId)
    ]);

    const aesKey = await generateAESKey();
    const { ciphertext, iv } = await encryptMessage(newText, aesKey);
    const signature = await signData(ciphertext, signingPrivateKey);

    const [senderPub, recipientPub] = await Promise.all([
      importPublicKey(senderProfile!.publicKey),
      importPublicKey(recipientProfile!.publicKey)
    ]);

    const [wrappedKeySender, wrappedKeyRecipient] = await Promise.all([
      wrapAESKey(aesKey, senderPub),
      wrapAESKey(aesKey, recipientPub)
    ]);

    await update(ref(rtdb, `messages/${chatId}/${messageId}`), {
      ciphertext, iv, signature, edited: true,
      wrappedKeys: { [senderId]: wrappedKeySender, [recipientId]: wrappedKeyRecipient }
    });
  } catch (error) {
    console.error("[ChatService] Edit failed:", error);
    throw error;
  }
};

/**
 * DELETE FOR EVERYONE (Sender Only)
 */
export const deleteForEveryone = async (chatId: string, messageId: string, senderId: string) => {
  try {
    const msgRef = ref(rtdb, `messages/${chatId}/${messageId}`);
    const snapshot = await get(msgRef);
    if (!snapshot.exists()) return;
    
    const msgData = snapshot.val();
    if (msgData.senderId !== senderId) {
      throw new Error("Unauthorized: Only the sender can delete for everyone.");
    }

    await update(msgRef, {
      deleted: true,
      ciphertext: "",
      iv: "",
      signature: "",
      wrappedKeys: {}
    });
  } catch (error) {
    console.error("[ChatService] Delete for everyone failed:", error);
    throw error;
  }
};

/**
 * DELETE FOR ME (Local User)
 */
export const deleteForMe = async (chatId: string, messageId: string, uid: string) => {
  try {
    const hiddenRef = ref(rtdb, `messages/${chatId}/${messageId}/hiddenFor/${uid}`);
    await set(hiddenRef, true);
  } catch (error) {
    console.error("[ChatService] Delete for me failed:", error);
    throw error;
  }
};

/**
 * DELETE CHAT (Local User Only)
 */
export const deleteLocalChat = async (uid: string, chatId: string) => {
  try {
    const updates: any = {};
    updates[`user-chats/${uid}/${chatId}/active`] = false;
    await update(ref(rtdb), updates);
  } catch (error) {
    console.error("[ChatService] Local chat deletion failed:", error);
    throw error;
  }
};

/**
 * CLEAR CHAT MESSAGES (For Local User Only)
 */
export const clearChatMessages = async (chatId: string, uid: string) => {
  try {
    const messagesRef = ref(rtdb, `messages/${chatId}`);
    const snapshot = await get(messagesRef);
    if (!snapshot.exists()) return;

    const updates: any = {};
    snapshot.forEach((child) => {
      updates[`messages/${chatId}/${child.key}/hiddenFor/${uid}`] = true;
    });
    
    // Also reset last message summary
    updates[`user-chats/${uid}/${chatId}/summary/lastMessage`] = "";
    
    await update(ref(rtdb), updates);
  } catch (error) {
    console.error("[ChatService] Clear chat failed:", error);
    throw error;
  }
};

/**
 * DELETE CHAT PERMANENTLY (For All Participants)
 */
export const deleteChatPermanently = async (chatId: string) => {
  try {
    const chatRef = ref(rtdb, `chats/${chatId}`);
    const snapshot = await get(chatRef);
    
    if (!snapshot.exists()) return;
    
    const participants = snapshot.val().participants || {};
    const updates: any = {};
    
    // 1. Remove messages
    updates[`messages/${chatId}`] = null;
    
    // 2. Remove chat metadata
    updates[`chats/${chatId}`] = null;
    
    // 3. Remove user-chat links for all participants
    Object.keys(participants).forEach(uid => {
      updates[`user-chats/${uid}/${chatId}`] = null;
    });
    
    await update(ref(rtdb), updates);
  } catch (error) {
    console.error("[ChatService] Permanent chat deletion failed:", error);
    throw error;
  }
};

export const startCall = async (
  chatId: string, 
  callerId: string, 
  recipientId: string, 
  type: 'audio' | 'video',
  callerUsername: string = "Secure User",
  callerAvatar?: string,
  recipientUsername: string = "Secure User",
  recipientAvatar?: string
) => {
  console.log(`[Signaling] 📞 Initializing ${type} call flow for chat ${chatId}`);
  try {
    const callRef = ref(rtdb, `calls/${recipientId}/${callerId}`);
    
    // Removed onDisconnect cleanup to prevent race conditions in multi-tab sessions
    
    await set(callRef, {
      chatId,
      callerId,
      recipientId,
      callType: type,
      callerUsername,
      callerAvatar: callerAvatar || null,
      recipientUsername,
      recipientAvatar: recipientAvatar || null,
      status: 'init',
      timestamp: serverTimestamp()
    });
    console.log(`[Signaling] 📞 Call node created at calls/${recipientId}/${callerId}`);
    
    console.log("[Signaling] ✅ Call signaling node created and cleanup registered");
  } catch (error) {
    console.error("[Signaling] ❌ Failed to start call:", error);
    throw error;
  }
};

/**
 * CALL SIGNALING: Listen for Incoming Calls
 */
export const listenForCalls = (uid: string, callback: (call: any) => void) => {
  const callsRef = ref(rtdb, `calls/${uid}`);
  return onValue(callsRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const keys = Object.keys(data).sort((a, b) => {
        const tsA = typeof data[a].timestamp === 'number' ? data[a].timestamp : (data[a].timestamp?.['.sv'] ? Date.now() : 0);
        const tsB = typeof data[b].timestamp === 'number' ? data[b].timestamp : (data[b].timestamp?.['.sv'] ? Date.now() : 0);
        return tsB - tsA;
      });
      
      // Find the specific node that contains the call metadata (must have a chatId)
      const firstCallerId = keys.find(k => {
        const node = data[k];
        return node && typeof node === 'object' && node.chatId && (node.status !== 'ended');
      });
      
      if (!firstCallerId || !data[firstCallerId]) {
        callback(null);
        return;
      }

      const callData = data[firstCallerId];
      callback({ 
        ...callData,
        id: firstCallerId, 
        callerId: callData.callerId || firstCallerId,
        recipientId: callData.recipientId || uid,
        type: callData.callType || callData.type || 'audio'
      });
    } else {
      callback(null);
    }
  });
};

/**
 * CALL SIGNALING: Answer/Reject Call
 */
export const updateCallStatus = async (recipientId: string, callerId: string, updates: any) => {
  const callRef = ref(rtdb, `calls/${recipientId}/${callerId}`);
  await update(callRef, updates);
};

/**
 * CALL SIGNALING: ICE Candidates
 */
export const sendIceCandidate = async (recipientId: string, callerId: string, type: 'caller' | 'recipient', candidate: any) => {
  const path = `calls/${recipientId}/${callerId}/${type}Candidates`;
  const candidatesRef = push(ref(rtdb, path));
  await set(candidatesRef, candidate);
};

export const listenForCandidates = (recipientId: string, callerId: string, type: 'caller' | 'recipient', callback: (candidate: any) => void) => {
  const path = `calls/${recipientId}/${callerId}/${type}Candidates`;
  const candidatesRef = ref(rtdb, path);
  return onChildAdded(candidatesRef, (snapshot) => {
    callback(snapshot.val());
  });
};

export const endCall = async (recipientId: string, callerId: string) => {
  await remove(ref(rtdb, `calls/${recipientId}/${callerId}`));
};

/**
 * TYPING INDICATORS
 */
export const setTypingStatus = async (chatId: string, uid: string, isTyping: boolean) => {
  const typingRef = ref(rtdb, `typing/${chatId}/${uid}`);
  if (isTyping) {
    await set(typingRef, true);
    // Auto-remove on disconnect
    onDisconnect(typingRef).remove();
  } else {
    await remove(typingRef);
  }
};

export const subscribeToTyping = (chatId: string, currentUid: string, callback: (typingUids: string[]) => void) => {
  const typingRef = ref(rtdb, `typing/${chatId}`);
  return onValue(typingRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const typingUids = Object.keys(data).filter(uid => uid !== currentUid);
      callback(typingUids);
    } else {
      callback([]);
    }
  });
};

/**
 * MESSAGE REACTIONS
 */
export const toggleReaction = async (chatId: string, messageId: string, uid: string, emoji: string) => {
  const reactionRef = ref(rtdb, `messages/${chatId}/${messageId}/reactions/${emoji}/${uid}`);
  const snapshot = await get(reactionRef);
  
  if (snapshot.exists()) {
    await remove(reactionRef);
  } else {
    await set(reactionRef, true);
  }
};

export const subscribeToMessages = (chatId: string, uid: string, callback: (messages: Message[]) => void) => {
  const q = query(ref(rtdb, `messages/${chatId}`), limitToLast(20)); // Super fast initial load
  return onValue(q, (snapshot) => {
    const messages: Message[] = [];
    snapshot.forEach((child) => {
      const data = child.val();
      // Filter out messages hidden for this user
      if (!data.hiddenFor?.[uid]) {
        messages.push({ id: child.key!, ...data } as Message);
      }
    });
    callback(messages);
  });
};

export const subscribeToChats = (uid: string, callback: (chats: any[]) => void) => {
  const userChatsRef = ref(rtdb, `user-chats/${uid}`);
  return onValue(userChatsRef, async (snapshot) => {
    if (!snapshot.exists()) return callback([]);
    const data = snapshot.val();
    const chatEntries = Object.entries(data).filter(([_, info]: [string, any]) => info.active !== false);
    
    const enrichedChats = await Promise.all(
      chatEntries.map(async ([chatId, info]: [string, any]) => {
        const summary = info.summary || {};
        let recipientId = summary.recipientId;
        
        // Optimization: If we have denormalized info, use it immediately
        if (summary.recipientName) {
          return {
            id: chatId,
            ...summary,
            recipient: {
              uid: recipientId,
              username: summary.recipientName,
              avatar: summary.recipientAvatar
            },
            isUnread: summary.isUnread || false,
            isPinned: summary.isPinned || false,
            updatedAt: summary.updatedAt || info.updatedAt || 0
          };
        }

        // Fallback for older chats without denormalized info
        if (!recipientId && chatId.includes('_')) {
          const parts = chatId.split('_');
          recipientId = parts.find(id => id !== uid);
        }
        
        if (!recipientId) return null;
        
        try {
          // Use cache if available to avoid redundant DB hits
          let recipient = profileCache.get(recipientId);
          if (!recipient) {
            recipient = await getUserProfile(recipientId);
            if (recipient) profileCache.set(recipientId, recipient);
          }
          
          if (!recipient) return null;
          
          return { 
            id: chatId, 
            ...summary, 
            recipient, 
            isUnread: summary.isUnread || false, 
            isPinned: summary.isPinned || false,
            updatedAt: summary.updatedAt || info.updatedAt || 0
          };
        } catch (e) {
          console.error("[ChatService] Failed to enrich chat:", chatId, e);
          return null;
        }
      })
    );
    
    const validChats = enrichedChats
      .filter(c => c !== null)
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
      
    callback(validChats);
  });
};

export const setChatWallpaper = async (uid: string, chatId: string, wallpaper: string, position: string = "center", size: string = "cover") => {
  try {
    await update(ref(rtdb, `user-chats/${uid}/${chatId}/summary`), { 
      wallpaper,
      wallpaperPosition: position,
      wallpaperSize: size
    });
  } catch (err) {
    console.error("[ChatService] Failed to set wallpaper:", err);
  }
};

export const pinMessage = async (uid: string, chatId: string, messageId: string | null) => {
  try {
    await update(ref(rtdb, `user-chats/${uid}/${chatId}/summary`), { pinnedMessageId: messageId });
  } catch (err) {
    console.error("[ChatService] Failed to pin message:", err);
  }
};

export const markAsRead = async (chatId: string, uid: string) => {
  try {
    await update(ref(rtdb, `user-chats/${uid}/${chatId}/summary`), { isUnread: false });
  } catch (err) {
    console.error("[ChatService] Mark as read failed:", err);
  }
};

/**
 * MARK INDIVIDUAL MESSAGE AS READ
 */
export const markMessageAsRead = async (chatId: string, messageId: string) => {
  try {
    await update(ref(rtdb, `messages/${chatId}/${messageId}`), { read: true });
  } catch (err) {
    console.error("[ChatService] Mark message as read failed:", err);
  }
};

/**
 * PIN CHATS
 */
export const togglePinChat = async (uid: string, chatId: string) => {
  const pinRef = ref(rtdb, `user-chats/${uid}/${chatId}/summary/isPinned`);
  const snapshot = await get(pinRef);
  await set(pinRef, !snapshot.exists() || snapshot.val() === false ? true : false);
};
