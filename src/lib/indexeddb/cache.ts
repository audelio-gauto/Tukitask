// Lightweight IndexedDB wrapper with TTL for client-side caching
type CacheRecord<T> = {
  value: T
  expiresAt: number
}

const DB_NAME = 'tukitask-cache'
const STORE_NAME = 'responses'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function idbGet<T = any>(key: string): Promise<T | null> {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(key)
      req.onsuccess = () => {
        const rec: CacheRecord<T> | undefined = req.result
        if (!rec) return resolve(null)
        if (rec.expiresAt && Date.now() > rec.expiresAt) {
          // expired: remove and return null
          const tx2 = db.transaction(STORE_NAME, 'readwrite')
          tx2.objectStore(STORE_NAME).delete(key)
          return resolve(null)
        }
        resolve(rec.value)
      }
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('idbGet error', err)
    return null
  }
}

export async function idbSet<T = any>(key: string, value: T, ttlSeconds = 300): Promise<void> {
  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const rec: CacheRecord<T> = { value, expiresAt: Date.now() + ttlSeconds * 1000 }
      const req = store.put(rec, key)
      req.onsuccess = () => resolve(undefined)
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('idbSet error', err)
  }
}

export async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const req = tx.objectStore(STORE_NAME).delete(key)
      req.onsuccess = () => resolve(undefined)
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('idbDelete error', err)
  }
}
