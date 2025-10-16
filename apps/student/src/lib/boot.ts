// lib/boot.ts
export async function boot({ supabase, idb }:{
    supabase: any, idb: any
}){
    const localVer = (await idb.kvGet<number>('question_version')) ?? 0;
    const man = await supabase.rpc('get_question_manifest');
    if (man.error) throw man.error;
    const { version, hash } = Array.isArray(man.data) ? man.data[0] : man.data;

    const localHash = await idb.kvGet<string>('question_hash');
    if (version > localVer || hash !== localHash) {
        const { data, error } = await supabase.rpc('get_questions_delta', { since_version: localVer });
        if (error) throw error;
        await idb.upsertQuestions(data.upserts);
        await idb.deleteQuestions(data.deletes);
        await idb.kvSet('question_version', data.new_version);
        await idb.kvSet('question_hash', data.hash);
    }

    // 서버 시계 보정(선택)
    const t0 = Date.now();
    const ping = await supabase.rpc('get_question_manifest'); // 재사용
    const serverNow = Date.now() + (Date.now() - t0); // 간소화(필요 시 별도 ping 함수)
    await idb.kvSet('server_time_offset_ms', serverNow - Date.now());
}
