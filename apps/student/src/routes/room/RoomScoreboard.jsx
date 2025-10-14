import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@quiz-rpg/core";

function msToPretty(ms) {
    if (!ms && ms !== 0) return "-";
    const sec = Math.round(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m ? `${m}m ${s}s` : `${s}s`;
}

export default function RoomScoreboard() {
    const { roomId } = useParams();
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);
    const [sb, setSB] = useState(null);            // { room_id, total_q, student_rows:[], per_question:[] }
    const [live, setLive] = useState(false);       // 실시간 연결 상태 표시

    const fetchingRef = useRef(false);             // 과도한 재호출 방지
    const firstLoadRef = useRef(true);             // 첫 로드에만 스피너
    const timerRef = useRef();                     // 디바운스 타이머

    const fetchScoreboard = useCallback(async () => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;
        setErr(null);
        if (firstLoadRef.current) setLoading(true);

        const { data, error } = await supabase.rpc("get_room_scoreboard", { p_room: roomId });

        fetchingRef.current = false;
        if (error) {
            setErr(error.message || "점수판을 불러오지 못했습니다.");
        } else {
            const one = Array.isArray(data) ? (data[0] ?? null) : data ?? null;
            setSB(one);
        }
        setLoading(false);
        firstLoadRef.current = false;
    }, [roomId]);

    // 초기 로드
    useEffect(() => {
        firstLoadRef.current = true;  // roomId 바뀌면 다시 첫 로드 스피너
        fetchScoreboard();
    }, [fetchScoreboard]);

    // Realtime 구독
    useEffect(() => {
        if (!roomId) return;

        const ch = supabase
            .channel(`room_${roomId}_submissions`)
            .on(
                "postgres_changes",
                { event: "*", schema: "quiz", table: "submissions", filter: `room_id=eq.${roomId}` },
                () => {
                    clearTimeout(timerRef.current);
                    timerRef.current = setTimeout(fetchScoreboard, 150); // 디바운스
                }
            )
            .subscribe((status) => {
                if (status === "SUBSCRIBED") setLive(true);
                if (status === "CLOSED" || status === "TIMED_OUT" || status === "CHANNEL_ERROR") setLive(false);
            });

        return () => {
            clearTimeout(timerRef.current);
            supabase.removeChannel(ch);
            // setLive(false)는 status 이벤트로만 제어
        };
    }, [roomId, fetchScoreboard]);

    if (loading) return <div className="max-w-4xl mx-auto p-6">불러오는 중…</div>;
    if (err) return <div className="max-w-4xl mx-auto p-6 text-red-600">에러: {String(err)}</div>;
    if (!sb) return <div className="max-w-4xl mx-auto p-6">데이터가 없습니다.</div>;

    const students = Array.isArray(sb.student_rows) ? sb.student_rows : [];
    const perQ = Array.isArray(sb.per_question) ? sb.per_question : [];

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-8">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold">점수판</h1>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                    <span>총 문항: {sb.total_q}</span>
                    <span className={live ? "text-green-600" : "text-gray-400"}>● {live ? "Live" : "Offline"}</span>
                    <button onClick={fetchScoreboard} className="px-2 py-1 rounded border hover:bg-gray-50">
                        새로고침
                    </button>
                </div>
            </div>

            {/* 표 1: 학생별 */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">학생별 성적</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-[640px] w-full border-collapse">
                        <thead>
                        <tr className="text-left border-b">
                            <th className="py-2 pr-4">학생</th>
                            <th className="py-2 pr-4">정답</th>
                            <th className="py-2 pr-4">정답률</th>
                            <th className="py-2 pr-4">평균 소요</th>
                        </tr>
                        </thead>
                        <tbody>
                        {students.length === 0 ? (
                            <tr><td colSpan={4} className="py-4 text-gray-500">제출이 아직 없습니다.</td></tr>
                        ) : students.map((r) => (
                            <tr key={r.submitter} className="border-b">
                                <td className="py-2 pr-4">{r.submitter}</td>
                                <td className="py-2 pr-4">{r.correct} / {sb.total_q}</td>
                                <td className="py-2 pr-4">
                                    {typeof r.rate === "number" ? `${r.rate.toFixed(1)}%` : (r.rate ?? "-")}
                                </td>
                                <td className="py-2 pr-4">{msToPretty(r.avg_ms)}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* 표 2: 문항별 */}
            <section className="space-y-3">
                <h2 className="text-lg font-semibold">문항별 통계</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-[640px] w-full border-collapse">
                        <thead>
                        <tr className="text-left border-b">
                            <th className="py-2 pr-4">문항</th>
                            <th className="py-2 pr-4">본문</th>
                            <th className="py-2 pr-4">시도</th>
                            <th className="py-2 pr-4">정답</th>
                            <th className="py-2 pr-4">정답률</th>
                            <th className="py-2 pr-4">평균 소요</th>
                        </tr>
                        </thead>
                        <tbody>
                        {perQ.length === 0 ? (
                            <tr><td colSpan={6} className="py-4 text-gray-500">아직 제출이 없습니다.</td></tr>
                        ) : perQ.map((q) => (
                            <tr key={q.q_index} className="border-b align-top">
                                <td className="py-2 pr-4">Q{q.q_index}</td>
                                <td className="py-2 pr-4">
                                    <div className="truncate max-w-[420px]" title={q.stem}>{q.stem}</div>
                                </td>
                                <td className="py-2 pr-4">{q.attempts}</td>
                                <td className="py-2 pr-4">{q.correct}</td>
                                <td className="py-2 pr-4">{q.correct_rate == null ? "-" : `${q.correct_rate}%`}</td>
                                <td className="py-2 pr-4">{msToPretty(q.avg_ms)}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <div className="flex gap-3">
                <Link to={`/room/${sb.room_id}?q=1`} className="px-4 py-2 rounded-lg border hover:bg-gray-50">
                    처음부터 다시 풀기
                </Link>
                <Link to={`/room/${sb.room_id}`} className="px-4 py-2 rounded-lg border hover:bg-gray-50">
                    현재 문항으로
                </Link>
            </div>
        </div>
    );
}
