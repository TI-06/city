import { verifyCity } from './engine.js';

const DATABASE = 'hinode-city-v1';
const STORE = 'save-slots';

function openDB() {
  return new Promise((resolve,reject) => {
    const req = indexedDB.open(DATABASE,1);
    req.onupgradeneeded = () => {
      const db=req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error || Error('保存先を開けません'));
  });
}

async function transaction(mode, fn) {
  const db=await openDB();
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,mode);
      let result;
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(tx.error || Error('保存に失敗しました'));
      tx.onabort=()=>reject(tx.error || Error('保存が中断されました'));
      fn(tx.objectStore(STORE),value=>result=value);
    });
  } finally { db.close(); }
}

export async function saveCity(city,slot='autosave') {
  verifyCity(city);
  // A single IndexedDB transaction atomically replaces the slot.
  const encoded=JSON.stringify(city);
  if (new TextEncoder().encode(encoded).length > 2_000_000) throw Error('セーブ上限（2MB）を超えました');
  return transaction('readwrite',(store,set)=>{
    store.put({savedAt:new Date().toISOString(), data:encoded},slot);
    set(true);
  });
}

export async function loadCity(slot='autosave') {
  const item=await transaction('readonly',(store,set)=>{
    const req=store.get(slot);
    req.onsuccess=()=>set(req.result ?? null);
  });
  if(!item) return null;
  const obj=JSON.parse(item.data);
  verifyCity(obj);
  return obj;
}

export function exportCity(city) {
  verifyCity(city);
  return new Blob([JSON.stringify(city,null,2)],{type:'application/json'});
}

export async function importCity(file) {
  if(file.size>2_000_000) throw Error('2MBより大きいファイルは読み込めません');
  const loaded=JSON.parse(await file.text());
  verifyCity(loaded);
  return loaded;
}
