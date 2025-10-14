import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@quiz-rpg/core";

export default function RoomControl() {
    const { roomId } = useParams();
    const [state, setState] = useState('idle');
    const [currentQ, setCurrentQ] = useState(1);
    const [totalQ, setTotalQ] = useState(0);
    const [err, setErr] = useState(null);

    async function refresh() {
        const { data, error } = await supabase.rpc("get_room_progress", { p_room: roomId });
        if (error) { setErr(error.message); return; }
        const one = Array.isArray(data) ? (data[0] ?? null) : data ?? null;
        if (one) { setState(one.state); setCurrentQ(one.current_q); setTotalQ(one.total_q); }
    }

    useEffect(() => {
        refresh();
        const ch = supabase
            .channel(`room_${roomId}_progress_admin`)
            .on("postgres_changes",
                { event: "UPDATE", schema: "quiz", table: "rooms", filter: `id=eq.${roomId}` },
                () => refresh())
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [roomId]);

    async function call(fn) {
        setErr(null);
        const { data, error } = await supabase.rpc(fn, { p_room: roomId });
        if (error) { setErr(error.message); return; }
        const one = Array.isArray(data) ? (data[0] ?? null) : data ?? null;
        if (one) { setState(one.state); setCurrentQ(one.current_q); setTotalQ(one.total_q); }
    }

    return (
        <div className="max-w-xl mx-auto p-6 space-y-4">
            <h1 className="text-xl font-bold">교사용 진행 제어</h1>
            {err && <div className="p-3 rounded bg-red-100 text-red-800">{String(err)}</div>}
            <div className="text-sm text-gray-600">room_id: {roomId}</div>
            <div className="flex gap-4 items-center">
                <div className="px-3 py-2 rounded bg-gray-100">상태: <b>{state}</b></div>
                <div className="px-3 py-2 rounded bg-gray-100">현재 문항: <b>{currentQ}</b> / {totalQ}</div>
            </div>
            <div className="flex gap-3">
                <button onClick={() => call("start_room")} className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white">시작</button>
                <button onClick={() => call("prev_question")} className="px-4 py-2 rounded border hover:bg-gray-50">이전</button>
                <button onClick={() => call("next_question")} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white">다음</button>
                <button onClick={() => call("end_room")} className="px-4 py-2 rounded bg-rose-600 hover:bg-rose-700 text-white">종료</button>
            </div>
            <p className="text-sm text-gray-500">버튼 클릭 시 rooms가 업데이트되고, 학생 화면은 실시간으로 해당 문항으로 이동합니다.</p>
        </div>
    );
}
