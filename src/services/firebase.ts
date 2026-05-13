import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

/**
 * Securem Firebase Configuration
 * Project: m-a9085
 */
const firebaseConfig = {
  apiKey: "AIzaSyALOFxEELLcizLoT8qW2EDApf4n0DOvxpE",
  authDomain: "m-a9085.firebaseapp.com",
  projectId: "m-a9085",
  databaseURL: "https://m-a9085-default-rtdb.firebaseio.com", // Added Realtime DB URL
  storageBucket: "m-a9085.firebasestorage.app",
  messagingSenderId: "795218603073",
  appId: "1:795218603073:web:ee9e1ec267f691941eaac0",
  measurementId: "G-GT8EJS00YQ"
};

import { getStorage } from "firebase/storage";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
