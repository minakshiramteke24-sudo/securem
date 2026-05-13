import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'SecuremDB';
const STORE_NAME = 'keys';
const DB_VERSION = 1;

export interface SecureStorage {
  encryptedPrivateKey: {
    ciphertext: string;
    iv: string;
  };
  encryptedSigningKey: {
    ciphertext: string;
    iv: string;
  };
  salt: string; // Base64
}

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
};

export const saveKeys = async (data: SecureStorage): Promise<void> => {
  const db = await getDB();
  await db.put(STORE_NAME, data, 'userKeys');
};

export const getKeys = async (): Promise<SecureStorage | undefined> => {
  const db = await getDB();
  return await db.get(STORE_NAME, 'userKeys');
};

export const clearKeys = async (): Promise<void> => {
  const db = await getDB();
  await db.delete(STORE_NAME, 'userKeys');
};
