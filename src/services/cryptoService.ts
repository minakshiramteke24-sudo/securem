/**
 * Securem Crypto Service
 * Uses Web Crypto API for all cryptographic operations.
 * NO external libraries used for core crypto.
 */

const PBKDF2_ITERATIONS = 100000;
const AES_KEY_LENGTH = 256;
const RSA_KEY_SIZE = 2048;

/**
 * Utility to convert ArrayBuffer to Base64
 */
export const bufferToBase64 = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Utility to convert Base64 to ArrayBuffer
 */
export const base64ToBuffer = (base64: string): ArrayBuffer => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
};

/**
 * Generate a new RSA-OAEP Key Pair for E2EE key exchange
 */
export const generateRSAKeyPair = async (): Promise<CryptoKeyPair> => {
  return await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: RSA_KEY_SIZE,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    } as any,
    true, // extractable
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
  );
};

/**
 * Generate a new RSA-PSS Key Pair for digital signatures
 */
export const generateSigningKeyPair = async (): Promise<CryptoKeyPair> => {
  return await window.crypto.subtle.generateKey(
    {
      name: "RSA-PSS",
      modulusLength: RSA_KEY_SIZE,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    } as any,
    true,
    ["sign", "verify"]
  );
};

/**
 * Derive an encryption key from a user password using PBKDF2
 */
export const deriveKeyFromPassword = async (password: string, salt: Uint8Array): Promise<CryptoKey> => {
  const encoder = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey as any,
    { name: "AES-GCM", length: AES_KEY_LENGTH } as any,
    false,
    ["encrypt", "decrypt"]
  );
};

/**
 * Encrypt the Private Key for local storage using the password-derived key
 */
export const encryptPrivateKey = async (privateKey: CryptoKey, encryptionKey: CryptoKey): Promise<{ ciphertext: string; iv: string }> => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const exportedKey = await window.crypto.subtle.exportKey("pkcs8", privateKey);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    exportedKey
  );

  return {
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv),
  };
};

/**
 * Decrypt the Private Key from local storage
 */
export const decryptPrivateKey = async (encryptedData: { ciphertext: string; iv: string }, encryptionKey: CryptoKey): Promise<CryptoKey> => {
  const ciphertext = base64ToBuffer(encryptedData.ciphertext);
  const iv = base64ToBuffer(encryptedData.iv);

  const decryptedKeyBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    ciphertext
  );

  return await window.crypto.subtle.importKey(
    "pkcs8",
    decryptedKeyBuffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt", "unwrapKey"]
  );
};

/**
 * Decrypt and import a Signing Private Key
 */
export const decryptSigningKey = async (encryptedData: { ciphertext: string; iv: string }, encryptionKey: CryptoKey): Promise<CryptoKey> => {
  const ciphertext = base64ToBuffer(encryptedData.ciphertext);
  const iv = base64ToBuffer(encryptedData.iv);

  const decryptedKeyBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    ciphertext
  );

  return await window.crypto.subtle.importKey(
    "pkcs8",
    decryptedKeyBuffer,
    { name: "RSA-PSS", hash: "SHA-256" },
    true,
    ["sign"]
  );
};

/**
 * Generate a random AES key for message encryption
 */
export const generateAESKey = async (): Promise<CryptoKey> => {
  return await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
};

/**
 * Encrypt a message using AES-GCM
 */
export const encryptMessage = async (text: string, aesKey: CryptoKey): Promise<{ ciphertext: string; iv: string }> => {
  const encoder = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoder.encode(text)
  );

  return {
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv),
  };
};

/**
 * Decrypt a message using AES-GCM
 */
export const decryptMessage = async (ciphertextBase64: string, ivBase64: string, aesKey: CryptoKey): Promise<string> => {
  const ciphertext = base64ToBuffer(ciphertextBase64);
  const iv = base64ToBuffer(ivBase64);
  const decoder = new TextDecoder();

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ciphertext
  );

  return decoder.decode(decrypted);
};

/**
 * Wrap (encrypt) an AES key using a Public RSA Key
 */
export const wrapAESKey = async (aesKey: CryptoKey, publicKey: CryptoKey): Promise<string> => {
  const wrapped = await window.crypto.subtle.wrapKey(
    "raw",
    aesKey,
    publicKey,
    "RSA-OAEP"
  );
  return bufferToBase64(wrapped);
};
/**
 * Hash data using SHA-256 (used for username privacy)
 */
export const hashData = async (data: string): Promise<string> => {
  const encoder = new TextEncoder();
  const buffer = await window.crypto.subtle.digest("SHA-256", encoder.encode(data.toLowerCase()));
  return bufferToBase64(buffer);
};

/**
 * Unwrap (decrypt) an AES key using a Private RSA Key
 */
export const unwrapAESKey = async (wrappedKeyBase64: string, privateKey: CryptoKey): Promise<CryptoKey> => {
  const wrappedKey = base64ToBuffer(wrappedKeyBase64);
  return await window.crypto.subtle.unwrapKey(
    "raw",
    wrappedKey,
    privateKey,
    { name: "RSA-OAEP" },
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );
};

/**
 * Export Public Key to SPKI Base64 for storage in Firestore
 */
export const exportPublicKey = async (publicKey: CryptoKey): Promise<string> => {
  const exported = await window.crypto.subtle.exportKey("spki", publicKey);
  return bufferToBase64(exported);
};

/**
 * Import Public Key from SPKI Base64
 */
export const importPublicKey = async (base64: string): Promise<CryptoKey> => {
  const buffer = base64ToBuffer(base64);
  return await window.crypto.subtle.importKey(
    "spki",
    buffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt", "wrapKey"]
  );
};

/**
 * Import a Signing Public Key from SPKI Base64
 */
export const importSigningPublicKey = async (base64: string): Promise<CryptoKey> => {
  const buffer = base64ToBuffer(base64);
  return await window.crypto.subtle.importKey(
    "spki",
    buffer,
    { name: "RSA-PSS", hash: "SHA-256" },
    true,
    ["verify"]
  );
};

/**
 * Sign data using RSA-PSS
 */
export const signData = async (data: string, privateKey: CryptoKey): Promise<string> => {
  const encoder = new TextEncoder();
  const signature = await window.crypto.subtle.sign(
    { name: "RSA-PSS", saltLength: 32 },
    privateKey,
    encoder.encode(data)
  );
  return bufferToBase64(signature);
};

/**
 * Verify a signature using RSA-PSS
 */
export const verifyData = async (data: string, signatureBase64: string, publicKey: CryptoKey): Promise<boolean> => {
  const encoder = new TextEncoder();
  const signature = base64ToBuffer(signatureBase64);
  return await window.crypto.subtle.verify(
    { name: "RSA-PSS", saltLength: 32 },
    publicKey,
    signature,
    encoder.encode(data)
  );
};

/**
 * Generic Encryption for ArrayBuffer (Media)
 */
export const encryptData = async (data: ArrayBuffer, aesKey: CryptoKey): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as any },
    aesKey,
    data
  );
  return { ciphertext, iv };
};

/**
 * Generic Decryption for ArrayBuffer (Media)
 */
export const decryptData = async (ciphertext: ArrayBuffer, iv: Uint8Array, aesKey: CryptoKey): Promise<ArrayBuffer> => {
  return await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as any },
    aesKey,
    ciphertext
  );
};
