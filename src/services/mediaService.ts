import { generateAESKey, encryptData, decryptData, bufferToBase64, base64ToBuffer } from "./cryptoService";

export interface MediaMetadata {
  base64Data: string; // The encrypted file content as Base64
  name: string;
  type: string;
  size: number;
}

/**
 * PREPARE ENCRYPTED MEDIA (Base64 for RTDB)
 */
export const prepareEncryptedFile = async (
  file: File
): Promise<{ metadata: MediaMetadata; fileKey: CryptoKey }> => {
  const fileKey = await generateAESKey();
  const fileBuffer = await file.arrayBuffer();
  
  // 1. Encrypt the file buffer
  const { ciphertext, iv } = await encryptData(fileBuffer, fileKey);
  
  // 2. Combine IV and Ciphertext into one Buffer
  const combinedBuffer = new Uint8Array(iv.length + ciphertext.byteLength);
  combinedBuffer.set(iv);
  combinedBuffer.set(new Uint8Array(ciphertext), iv.length);
  
  // 3. Convert to Base64 for RTDB storage
  const base64Data = bufferToBase64(combinedBuffer);
  
  return {
    metadata: {
      base64Data,
      name: file.name,
      type: file.type,
      size: file.size
    },
    fileKey
  };
};

/**
 * DECRYPT MEDIA FROM BASE64
 */
export const decryptBase64File = async (
  base64Data: string,
  fileKey: CryptoKey,
  type: string
): Promise<Blob> => {
  const combinedBuffer = base64ToBuffer(base64Data);
  
  // Extract IV (first 12 bytes) and ciphertext
  const iv = new Uint8Array(combinedBuffer.slice(0, 12));
  const ciphertext = combinedBuffer.slice(12);
  
  const decryptedBuffer = await decryptData(ciphertext, iv, fileKey);
  return new Blob([decryptedBuffer], { type });
};
