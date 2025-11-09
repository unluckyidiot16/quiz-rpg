import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/client";

export default function RoomScoreboard() {
    const { roomId } = useParams();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchScoreboard = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.rpc("get_room_scoreboard", { p_room: roomId });
        if (!error) setRows(Array.isArray(data) ? data : (data ? [data] : []));
        setLoading(false);
    }, [roomId]);

    useEffect(() => {
        fetchScoreboard();                 // 즉시 1회
        const t = setInterval(fetchScoreboard, 7000); // 폴링
        return () => clearInterval(t);
    }, [fetchScoreboard]);

    return (
        <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
                <h1 className="text-lg font-bold">Scoreboard</h1>
                <button onClick={fetchScoreboard} className="px-3 py-1 rounded border">
                    새로고침
                </button>
            </div>

            {loading ? (
                <div>불러오는 중…</div>
            ) : rows.length === 0 ? (
                <div>아직 데이터가 없습니다.</div>
            ) : (
                <table className="min-w-full border">
                    <thead className="bg-gray-100">
                    <tr>
                        <th className="border px-2 py-1 text-left">학생</th>
                        <th className="border px-2 py-1 text-right">정답</th>
                        <th className="border px-2 py-1 text-right">총문항</th>
                        <th className="border px-2 py-1 text-right">점수</th>
                    </tr>
                    </thead>
                    <tbody>
                    {rows.map((r, i) => (
                        <tr key={i}>
                            <td className="border px-2 py-1">{r.student_display ?? r.student_id ?? "-"}</td>
                            <td className="border px-2 py-1 text-right">{r.correct ?? "-"}</td>
                            <td className="border px-2 py-1 text-right">{r.total ?? "-"}</td>
                            <td className="border px-2 py-1 text-right">{r.score ?? r.points ?? "-"}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
