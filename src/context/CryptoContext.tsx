import React, { createContext, useContext, useState, useCallback } from "react";
import {
  generateRSAKeyPair,
  deriveKeyFromPassword,
  encryptPrivateKey,
  decryptPrivateKey,
  generateSigningKeyPair,
  decryptSigningKey,
  exportPublicKey,
  bufferToBase64,
  base64ToBuffer
} from "../services/cryptoService";
import { saveKeys, getKeys } from "../services/storageService";

interface CryptoContextType {
  privateKey: CryptoKey | null;
  signingPrivateKey: CryptoKey | null;
  publicKeyBase64: string | null;
  signingPublicKeyBase64: string | null;
  isUnlocked: boolean;
  unlock: (password: string, backup?: { priv: string, sign: string, salt: string }) => Promise<void>;
  setup: (password: string) => Promise<{ publicKey: string; signingPublicKey: string; backup: any }>;
  lock: () => void;
}

const CryptoContext = createContext<CryptoContextType | undefined>(undefined);

export const CryptoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [signingPrivateKey, setSigningPrivateKey] = useState<CryptoKey | null>(null);
  const [publicKeyBase64, setPublicKeyBase64] = useState<string | null>(null);
  const [signingPublicKeyBase64, setSigningPublicKeyBase64] = useState<string | null>(null);

  const lock = useCallback(() => {
    setPrivateKey(null);
    setSigningPrivateKey(null);
    setPublicKeyBase64(null);
    setSigningPublicKeyBase64(null);
  }, []);

  const setup = async (password: string): Promise<{ publicKey: string; signingPublicKey: string; backup: any }> => {
    // 1. Generate Key Pairs
    const encryptionKeyPair = await generateRSAKeyPair();
    const signingKeyPair = await generateSigningKeyPair();

    // 2. Generate Salt for PBKDF2
    const salt = window.crypto.getRandomValues(new Uint8Array(16));

    // 3. Derive Encryption Key from Password
    const encryptionKey = await deriveKeyFromPassword(password, salt);

    // 4. Encrypt Both Private Keys
    const encryptedEncData = await encryptPrivateKey(encryptionKeyPair.privateKey, encryptionKey);
    const encryptedSignData = await encryptPrivateKey(signingKeyPair.privateKey, encryptionKey);

    const backup = {
      encryptedPrivateKey: encryptedEncData,
      encryptedSigningKey: encryptedSignData,
      salt: bufferToBase64(salt)
    };

    // 5. Save to IndexedDB
    await saveKeys(backup);

    // 6. Keep in Memory
    setPrivateKey(encryptionKeyPair.privateKey);
    setSigningPrivateKey(signingKeyPair.privateKey);

    const pubKeyBase64 = await exportPublicKey(encryptionKeyPair.publicKey);
    const signPubKeyBase64 = await exportPublicKey(signingKeyPair.publicKey);

    setPublicKeyBase64(pubKeyBase64);
    setSigningPublicKeyBase64(signPubKeyBase64);

    return { 
      publicKey: pubKeyBase64, 
      signingPublicKey: signPubKeyBase64, 
      backup: {
        encryptedPrivateKey: JSON.stringify(encryptedEncData),
        encryptedSigningKey: JSON.stringify(encryptedSignData),
        salt: bufferToBase64(salt)
      } 
    };
  };

  const unlock = async (password: string, backup?: { priv: string, sign: string, salt: string }) => {
    console.log("[Crypto] Unlock started...");
    let stored = await getKeys();
    console.log("[Crypto] Local keys found:", !!stored);
    
    if (!stored) {
      console.log("[Crypto] No local keys found. Attempting Cloud Restore...");
      if (!backup || !backup.priv || !backup.sign || !backup.salt) {
        throw new Error("Security vault not found on this device. Please log in on your original device first.");
      }
      
      try {
        console.log("[Crypto] Parsing cloud backup...");
        stored = {
          encryptedPrivateKey: JSON.parse(backup.priv),
          encryptedSigningKey: JSON.parse(backup.sign),
          salt: backup.salt
        };
        
        console.log("[Crypto] Saving cloud vault to local IndexedDB...");
        await saveKeys(stored);
      } catch (err) {
        console.error("[Crypto] Parse/Save failed:", err);
        throw new Error("Security vault data is corrupted.");
      }
    }

    if (!stored) throw new Error("Could not retrieve security vault.");

    console.log("[Crypto] Deriving key from password (PBKDF2)...");
    const salt = new Uint8Array(base64ToBuffer(stored.salt));
    const encryptionKey = await deriveKeyFromPassword(password, salt);
    console.log("[Crypto] Key derivation completed.");

    try {
      console.log("[Crypto] Decrypting primary private key...");
      const privKey = await decryptPrivateKey(stored.encryptedPrivateKey, encryptionKey);
      console.log("[Crypto] Decrypting signing private key...");
      const signKey = await decryptSigningKey(stored.encryptedSigningKey, encryptionKey);

      setPrivateKey(privKey);
      setSigningPrivateKey(signKey);
      console.log("[Crypto] State updates called. privateKey is now set.");
      console.log("[Crypto] Security vault unlocked successfully.");
    } catch (e) {
      console.error("[Crypto] Decryption failed or state update failed:", e);
      throw new Error("Invalid master password. Please try again.");
    }
  };

  return (
    <CryptoContext.Provider value={{
      privateKey,
      signingPrivateKey,
      publicKeyBase64,
      signingPublicKeyBase64,
      isUnlocked: !!privateKey,
      unlock,
      setup,
      lock
    }}>
      {children}
    </CryptoContext.Provider>
  );
};

export const useCrypto = () => {
  const context = useContext(CryptoContext);
  if (!context) throw new Error("useCrypto must be used within CryptoProvider");
  return context;
};
