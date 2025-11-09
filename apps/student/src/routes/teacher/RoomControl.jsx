import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/client";

export default function RoomControl() {
    const { roomId } = useParams();
    const [state, setState] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    async function refresh() {
        setErr("");
        setLoading(true);
        const { data, error } = await supabase.rpc("get_room_progress", { p_room: roomId });
        if (error) setErr(error.message);
        const one = Array.isArray(data) ? data[0] : data;
        setState(one ?? null);
        setLoading(false);
    }

    // 실시간 제거 → 최초 1회만 로드 (필요 시 버튼으로 갱신)
    useEffect(() => { refresh(); }, [roomId]);

    // (예시) 다음 문항으로 넘기는 액션이 있다면 유지
    async function nextQuestion() {
        const { error } = await supabase.rpc("advance_room_question", { p_room: roomId });
        if (error) setErr(error.message);
        await refresh();
    }

    return (
        <div className="p-4 space-y-3">
            <h1 className="text-lg font-bold">Room Control</h1>

            <div className="flex gap-2">
                <button onClick={refresh} className="px-3 py-1 rounded border">새로고침</button>
                <button onClick={nextQuestion} className="px-3 py-1 rounded border">다음 문항</button>
            </div>

            {loading ? (
                <div>불러오는 중…</div>
            ) : err ? (
                <div className="text-red-600">{err}</div>
            ) : !state ? (
                <div>데이터가 없습니다.</div>
            ) : (
                <div className="space-y-1">
                    <div>상태: <b>{state.state}</b></div>
                    <div>현재 문항: <b>{state.current_q}</b></div>
                    <div>오픈: {state.open_at}</div>
                    <div>마감: {state.close_at}</div>
                </div>
            )}
        </div>
    );
}
