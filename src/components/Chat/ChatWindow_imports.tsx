import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Phone, Video, Send,
  Shield, X, Mic, Trash2, Search, Pin
} from "lucide-react";
import CustomEmojiPicker from "./CustomEmojiPicker";
import { useAuth } from "../../context/AuthContext";
import { useCrypto } from "../../context/CryptoContext";
import {
  sendMessage,
  getOrCreateChat,
  subscribeToMessages,
  markAsRead,
  markMessageAsRead,
  toggleReaction,
  editMessage,
  setTypingStatus,
  deleteForMe,
  deleteForEveryone,
  setChatWallpaper,
  pinMessage,
  sendMediaMessage
} from "../../services/chatService";
import { rtdb } from "../../services/firebase";
import { ref, onValue, set } from "firebase/database";
import { transferService, type TransferSession } from "../../services/transferService";
import MessageBubble from "./MessageBubble";
import ActionToolbar from "./ActionToolbar";
import { prepareEncryptedFile } from "../../services/mediaService";
import TransferOverlay from "./TransferOverlay";
