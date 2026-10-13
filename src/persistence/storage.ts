import { type City, validateCity } from '../core/city';
import { createOrderedWriter } from './write-queue';

const DB = 'cityscape-saves-v1';
const STORE = 'saves';
export type SaveSlot = 'auto' | 'manual' | 'backup';
type SaveRecord = Readonly<{ key: SaveSlot; city: City; savedAt: string }>;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('このブラウザはIndexedDBに対応していません'));
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, {keyPath:'key'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readRecord(slot: SaveSlot): Promise<SaveRecord | undefined> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(slot);
      request.onsuccess = () => resolve(request.result as SaveRecord | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export type RestoredSave = Readonly<{ city: City; recoveredFromBackup: boolean }>;

/** Pure validator: auto is preferred, backup is used only if auto is unavailable or corrupt. */
export function selectRestorableSave(auto: unknown, backup: unknown): RestoredSave | null {
  let corrupt = false;
  if (auto !== undefined && auto !== null) {
    try { return {city:validateCity((auto as SaveRecord).city),recoveredFromBackup:false}; }
    catch { corrupt = true; }
  }
  if (backup !== undefined && backup !== null) {
    try { return {city:validateCity((backup as SaveRecord).city),recoveredFromBackup:true}; }
    catch { corrupt = true; }
  }
  if (corrupt) throw new Error('自動保存・バックアップの両方を読み込めません。JSONの書き出しデータがあれば読み込んでください。');
  return null;
}

export async function loadLatestCity(): Promise<RestoredSave | null> {
  const auto = await readRecord('auto');
  const backup = auto ? undefined : await readRecord('backup');
  // On a corrupt auto, request the backup before deciding failure.
  try { return selectRestorableSave(auto, backup); }
  catch (error) {
    if (auto && backup === undefined) return selectRestorableSave(auto, await readRecord('backup'));
    throw error;
  }
}
export async function loadCity(slot: SaveSlot = 'auto'): Promise<City | null> {
  const record = await readRecord(slot);
  return record ? validateCity(record.city) : null;
}

async function writeRecord(snapshot: Readonly<{city:City;slot:SaveSlot}>): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const record: SaveRecord = {key:snapshot.slot,city:snapshot.city,savedAt:new Date().toISOString()};
      if (snapshot.slot === 'auto') {
        const previous = store.get('auto');
        previous.onsuccess = () => {
          if (previous.result) {
            // Never rotate corrupt autosave data over the last known-good backup.
            try { validateCity((previous.result as SaveRecord).city); store.put({...previous.result,key:'backup'}); }
            catch { /* keep the existing recoverable backup */ }
          }
          store.put(record);
        };
        previous.onerror = () => tx.abort();
      } else store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('保存に失敗しました'));
    });
  } finally { db.close(); }
}

const orderedWriter = createOrderedWriter(writeRecord);
export function saveCity(city: City, slot: SaveSlot = 'auto'): Promise<void> {
  // Capture at call time. Mutations made while awaiting IndexedDB cannot leak into a save.
  return orderedWriter({city:structuredClone(city),slot});
}

export function exportCity(city:City): void {
  const blob=new Blob([JSON.stringify(city)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`${city.name}_${city.month}ヶ月目.city.json`;
  anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
export async function importCity(file:File):Promise<City>{
  if(file.size>3_000_000)throw new Error('3MBを超えるファイルは読み込めません');
  return validateCity(JSON.parse(await file.text()));
}