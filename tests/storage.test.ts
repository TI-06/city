import { describe, expect, it } from 'vitest';
import { createCity } from '../src/core/city';
import { createOrderedWriter } from '../src/persistence/write-queue';
import { selectRestorableSave } from '../src/persistence/storage';

describe('save durability', () => {
  it('commits writes in submission order, even if earlier writes are slower', async () => {
    const started:number[]=[];
    const resolvers: Array<() => void>=[];
    const write=createOrderedWriter<number>(value=>new Promise(resolve=>{started.push(value);resolvers.push(resolve);}));
    const first=write(1),second=write(2),third=write(3);
    await Promise.resolve();
    expect(started).toEqual([1]);
    resolvers.shift()!();await first;
    await Promise.resolve();expect(started).toEqual([1,2]);
    resolvers.shift()!();await second;
    await Promise.resolve();expect(started).toEqual([1,2,3]);
    resolvers.shift()!();await third;
  });
  it('does not deadlock later saves after a failed write',async()=>{
    let count=0;
    const writer=createOrderedWriter(async()=>{count++;if(count===1)throw new Error('disk failure');});
    await expect(writer(1)).rejects.toThrow('disk failure');
    await expect(writer(2)).resolves.toBeUndefined();
    expect(count).toBe(2);
  });
  it('prefers valid autosave and recovers corrupt autosave from backup',()=>{
    const auto=createCity('auto',32);
    const backup=createCity('backup',31);
    const result=selectRestorableSave({city:auto},{city:backup});
    expect(result?.city.name).toBe('auto');
    expect(result?.recoveredFromBackup).toBe(false);
    expect(selectRestorableSave({city:{bad:1}},{city:backup})?.city.name).toBe('backup');
    expect(selectRestorableSave({city:{bad:1}},{city:backup})?.recoveredFromBackup).toBe(true);
  });
  it('reports irrecoverable corruption and treats absent slots as a new city',()=>{
    expect(selectRestorableSave(undefined,undefined)).toBeNull();
    expect(()=>selectRestorableSave({city:{bad:1}},{city:{bad:2}})).toThrow('バックアップ');
  });
});