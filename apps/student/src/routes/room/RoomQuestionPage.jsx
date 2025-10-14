import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@quiz-rpg/core";

export default function RoomQuestionPage() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const [sp] = useSearchParams();
    const qFromURL = Number(sp.get("q")) || 1;

    const [loading, setLoading] = useState(true);
    const [rq, setRQ] = useState(null); // { q, total, room_id, q_index, question_id, stem, choices:[{key,text}] }
    const [error, setError] = useState(null);
    const [selectedKey, setSelectedKey] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState(null); // { correct: boolean }

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            setSelectedKey(null);
            setSubmitResult(null);

            const { data, error } = await supabase.rpc("get_room_question", {
                p_room: roomId,
                p_q: qFromURL,
            });

            if (cancelled) return;
            if (error) {
                setError(error.message || "문항을 불러오지 못했습니다.");
            } else {
                setRQ(Array.isArray(data) ? (data[0] ?? null) : data ?? null);
            }
            setLoading(false);
        })();
        return () => (cancelled = true);
    }, [roomId, qFromURL]);

    async function onSubmit() {
        if (!rq || !selectedKey) return;
        setSubmitting(true);
        const started = performance.now();

        // 키 그대로 제출하는 래퍼(RPC) 사용
        const { data, error } = await supabase.rpc("grade_and_store_by_key", {
            p_room: rq.room_id,
            p_q_index: rq.q_index,              // q보다 q_index 사용 권장
            p_student_key: "guest",             // 임시 식별자(나중에 QR/세션 연동)
            p_answer_key: selectedKey,          // 'A'|'B'|'C'|'D'
        });

        setSubmitting(false);
        if (error) {
            // 중복제출(23505) 등은 메시지 안내만
            setError(error.message);
            return;
        }
        setSubmitResult(data?.[0] || { correct: false });
    }

    function goNextOrResult() {
        if (!rq) return;
        const nextQ = rq.q + 1;
        if (nextQ <= rq.total) navigate(`/room/${rq.room_id}?q=${nextQ}`);
        else navigate(`/room/${rq.room_id}/scoreboard`);
    }

    if (loading) return <div className="p-6 text-center">불러오는 중…</div>;
    if (error) return <div className="p-6 text-red-600">에러: {String(error)}</div>;
    if (!rq) return <div className="p-6 text-gray-600">이 방에 문항이 없습니다.</div>;

    return (
        <div className="max-w-2xl mx-auto p-6 space-y-6">
            <div className="text-sm text-gray-500">문항 {rq.q} / {rq.total}</div>
            <h1 className="text-xl font-bold">{rq.stem}</h1>

            <div className="space-y-3">
                {rq.choices?.map((c) => (
                    <button
                        key={c.key}
                        onClick={() => setSelectedKey(c.key)}
                        disabled={!!submitResult}
                        className={`w-full text-left border rounded-xl p-4 hover:bg-gray-50 ${selectedKey===c.key ? "ring-2 ring-indigo-500 border-indigo-500" : ""}`}
                    >
                        <div className="font-medium">{c.text}</div>
                    </button>
                ))}
            </div>

            {!submitResult ? (
                <div className="flex gap-3">
                    <button
                        onClick={onSubmit}
                        disabled={!selectedKey || submitting}
                        className={`px-4 py-2 rounded-lg text-white ${!selectedKey || submitting ? "bg-gray-400" : "bg-indigo-600 hover:bg-indigo-700"}`}
                    >
                        {submitting ? "제출 중…" : "제출"}
                    </button>
                    <button
                        onClick={() => navigate(`/room/${rq.room_id}/scoreboard`)}
                        className="px-4 py-2 rounded-lg border hover:bg-gray-50"
                    >
                        결과 보기
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className={`px-4 py-3 rounded-lg ${submitResult.correct ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                        {submitResult.correct ? "정답입니다! 🎉" : "오답입니다. 다음 문항으로 이동해 보세요."}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={goNextOrResult}
                            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {rq.q < rq.total ? "다음 문항" : "결과(점수판)로"}
                        </button>
                        <button
                            onClick={() => navigate(`/room/${rq.room_id}/scoreboard`)}
                            className="px-4 py-2 rounded-lg border hover:bg-gray-50"
                        >
                            결과 보기
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
