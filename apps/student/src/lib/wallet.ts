// lib/wallet.ts
import { createClient } from '@supabase/supabase-js';
export type Wallet = { stars:number; coins:number; sig:string };

export class WalletClient {
    constructor(private supabase: ReturnType<typeof createClient>, private idb: any){}

    async ensure() {
        const { data, error } = await this.supabase.rpc('ensure_wallet');
        if (error) throw error;
        const sig = data?.[0]?.walletsig ?? data?.walletsig;
        await this.idb.kvSet('walletSig', sig);
        return sig;
    }

    async commit(delta:{stars:number; coins:number}, reason:'enter_dungeon'|'clear_dungeon'|'gacha_pull'|'grant'|'revoke'){
        const prevSig = await this.idb.kvGet<string>('walletSig');
        const { data, error } = await this.supabase.rpc('commit_wallet', {
            _stars: delta.stars, _coins: delta.coins, _reason: reason, _prevsig: prevSig
        });
        if (error) throw error;
        const row = Array.isArray(data)? data[0]: data;
        await this.idb.kvSet('walletSig', row.walletsig);
        await this.idb.kvSet('walletCache', { stars: row.stars, coins: row.coins });
        return row as Wallet;
    }
}
