// lib/idb.ts
export type KV = { key: string; value: any };

export class IDB {
    private dbp: Promise<IDBDatabase>;
    constructor(private name='od-qbank', private version=1){
        this.dbp = new Promise((resolve, reject) => {
            const req = indexedDB.open(this.name, this.version);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
                if (!db.objectStoreNames.contains('question_bank')) {
                    const store = db.createObjectStore('question_bank', { keyPath: 'id' });
                    store.createIndex('by_updated', 'updated_at');
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    async kvGet<T=any>(key:string):Promise<T|null>{
        const db = await this.dbp;
        return new Promise((res,rej)=>{
            const tx = db.transaction('kv','readonly');
            const req = tx.objectStore('kv').get(key);
            req.onsuccess = ()=> res((req.result as T) ?? null);
            req.onerror = ()=> rej(req.error);
        });
    }
    async kvSet(key:string, value:any){
        const db = await this.dbp;
        return new Promise<void>((res,rej)=>{
            const tx = db.transaction('kv','readwrite');
            tx.objectStore('kv').put(value, key);
            tx.oncomplete = ()=> res();
            tx.onerror = ()=> rej(tx.error);
        });
    }
    async upsertQuestions(rows:any[]){
        if (!rows?.length) return;
        const db = await this.dbp;
        const tx = db.transaction('question_bank','readwrite');
        const store = tx.objectStore('question_bank');
        for (const r of rows) store.put(r);
        await new Promise<void>((res,rej)=>{ tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); });
    }
    async deleteQuestions(ids:string[]){
        if (!ids?.length) return;
        const db = await this.dbp;
        const tx = db.transaction('question_bank','readwrite');
        const store = tx.objectStore('question_bank');
        for (const id of ids) store.delete(id);
        await new Promise<void>((res,rej)=>{ tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); });
    }
}
