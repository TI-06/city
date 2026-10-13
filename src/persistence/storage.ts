import { type City,validateCity } from '../core/city';
const DB = 'cityscape-saves-v1', STORE='saves';
type SaveRecord = {key:string; city:City; savedAt:string};
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined')return reject(new Error('このブラウザはIndexedDBに対応していません'));
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'key'});};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});}
export async function loadCity(slot='auto'):Promise<City|null>{const db=await open();try{return await new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readonly');const req=t.objectStore(STORE).get(slot);req.onsuccess=()=>{try{resolve(req.result?validateCity((req.result as SaveRecord).city):null);}catch(e){reject(e);}};req.onerror=()=>reject(req.error);});}finally{db.close();}}
export async function saveCity(city:City,slot='auto'):Promise<void>{const db=await open();try{await new Promise<void>((resolve,reject)=>{const t=db.transaction(STORE,'readwrite');const store=t.objectStore(STORE);const next:SaveRecord={key:slot,city:structuredClone(city),savedAt:new Date().toISOString()};
  if(slot==='auto') {const previous=store.get('auto');previous.onsuccess=()=>{if(previous.result)store.put({...previous.result,key:'backup'});store.put(next);};previous.onerror=()=>t.abort();}
  else store.put(next);
  t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error??new Error('保存に失敗しました'));
});}finally{db.close();}}
export function exportCity(city:City):void{const blob=new Blob([JSON.stringify(city)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${city.name}_${city.month}ヶ月目.city.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
export async function importCity(file:File):Promise<City>{if(file.size>3_000_000)throw new Error('3MBを超えるファイルは読み込めません');return validateCity(JSON.parse(await file.text()));}