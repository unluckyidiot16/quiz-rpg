import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@quiz-rpg/core";

export default function RoomQuestionPage() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const [sp] = useSearchParams();
    const qFromURL = Number(sp.get("q")) || 1;

    const [loading, setLoading] = useState(true);
    const [rq, setRQ] = useState(null);
    const [error, setError] = useState(null);
    const [selectedKey, setSelectedKey] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState(null);

    // 진행 상태(rooms) + 라이브 표시
    const [roomState, setRoomState] = useState("idle");
    const [currentRoomQ, setCurrentRoomQ] = useState(1);
    const [liveProgress, setLiveProgress] = useState(false);

    // 디바운스 타이머 ref
    const timerRef = useRef();

    // 문항 로드
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
            if (error) setError(error.message || "문항을 불러오지 못했습니다.");
            else setRQ(Array.isArray(data) ? (data[0] ?? null) : data ?? null);

            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [roomId, qFromURL]);

    // 최초 진입 시 진행 상태 1회 동기화(새로고침/딥링크 대응)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase.rpc("get_room_progress", { p_room: roomId });
            if (cancelled) return;
            if (!error) {
                const one = Array.isArray(data) ? (data[0] ?? null) : data ?? null;
                if (one) {
                    setRoomState(one.state);
                    setCurrentRoomQ(one.current_q);
                    // state가 running인데 URL의 q가 다른 경우 맞춰 이동
                    if (one.state === "running" && one.current_q > 0 && one.current_q !== qFromURL) {
                        navigate(`/room/${roomId}?q=${one.current_q}`, { replace: true });
                    }
                    // 종료면 점수판으로
                    if (one.state === "ended") {
                        navigate(`/room/${roomId}/scoreboard`, { replace: true });
                    }
                }
            }
        })();
        return () => {
            cancelled = true;
        };
        // roomId만 의존
    }, [roomId, navigate]);

    // Realtime 구독: rooms 진행 변경 → 상태/네비게이션 동기화
    useEffect(() => {
        if (!roomId) return;
        const ch = supabase
            .channel(`room_${roomId}_progress`)
            .on(
                "postgres_changes",
                { event: "*", schema: "quiz", table: "rooms", filter: `id=eq.${roomId}` },
                (payload) => {
                    const st = payload.new?.state;
                    const nextQ = payload.new?.current_q;

                    if (st) setRoomState(st);
                    if (typeof nextQ === "number") setCurrentRoomQ(nextQ);

                    // 네비게이션 동기화
                    if (st === "ended") {
                        navigate(`/room/${roomId}/scoreboard`, { replace: true });
                    } else if (st === "running" && typeof nextQ === "number" && nextQ > 0) {
                        // 현재 URL의 q와 다르면 이동
                        if (nextQ !== qFromURL) {
                            // 너무 빠른 연속 업데이트 대비 디바운스
                            clearTimeout(timerRef.current);
                            timerRef.current = setTimeout(() => {
                                navigate(`/room/${roomId}?q=${nextQ}`, { replace: true });
                            }, 100);
                        }
                    }
                }
            )
            .subscribe((status) => setLiveProgress(status === "SUBSCRIBED"));

        return () => {
            clearTimeout(timerRef.current);
            supabase.removeChannel(ch);
            setLiveProgress(false);
        };
        // roomId만 의존 — qFromURL 변화로 재구독하지 않음
    }, [roomId, navigate, qFromURL]);

    // 서버 규칙: running 상태이고, "현재 문항"일 때만 제출 허용
    // rooms.current_q는 1..N의 진행 포지션이고, get_room_question의 rq.q(표시용 번호)와 동일 정렬 기준입니다.
    const canSubmit = roomState === "running" && rq && rq.q === currentRoomQ;

    async function onSubmit() {
        if (!rq || !selectedKey) return;
        if (!canSubmit) {
            setError("현재 제출이 허용되지 않습니다. (대기/종료/다른 문항)");
            return;
        }
        setSubmitting(true);
        const { data, error } = await supabase.rpc("grade_and_store_by_key", {
            p_room: rq.room_id,
            p_q_index: rq.q_index,         // DB는 q_index 기준으로 검증
            p_student_key: "guest",
            p_answer_key: selectedKey,
        });
        setSubmitting(false);
        if (error) {
            setError(error.message);
            return;
        }
        setSubmitResult(data?.[0] || { correct: false });
    }

    if (loading) return <div className="p-6 text-center">불러오는 중…</div>;
    if (error) return <div className="p-6 text-red-600">에러: {String(error)}</div>;
    if (!rq) return <div className="p-6 text-gray-600">이 방에 문항이 없습니다.</div>;

    return (
        <div className="max-w-2xl mx-auto p-6 space-y-6">
            {/* 진행 상태 배지(디버깅/가시성용) */}
            <div className="flex items-center justify-between text-sm text-gray-600">
                <div>
                    진행: <b>{roomState}</b> · 현재 {currentRoomQ}
                    {rq ? ` / 이 화면 Q${rq.q}` : null}
                </div>
                <div className={liveProgress ? "text-green-600" : "text-gray-400"}>
                    ● {liveProgress ? "Live" : "Offline"}
                </div>
            </div>

            <div className="text-sm text-gray-500">문항 {rq.q} / {rq.total}</div>
            <h1 className="text-xl font-bold">{rq.stem}</h1>

            <div className="space-y-3">
                {rq.choices?.map((c) => (
                    <button
                        key={c.key}
                        onClick={() => setSelectedKey(c.key)}
                        disabled={!!submitResult || !canSubmit}
                        className={`w-full text-left border rounded-xl p-4 hover:bg-gray-50 ${
                            selectedKey === c.key ? "ring-2 ring-indigo-500 border-indigo-500" : ""
                        } ${!canSubmit ? "opacity-60 cursor-not-allowed" : ""}`}
                        title={!canSubmit ? "대기 중에는 선택이 비활성화됩니다" : ""}
                    >
                        <div className="font-medium">{c.text}</div>
                    </button>
                ))}
            </div>

            {!submitResult ? (
                <div className="flex gap-3">
                    <button
                        onClick={onSubmit}
                        disabled={!selectedKey || submitting || !canSubmit}
                        className={`px-4 py-2 rounded-lg text-white ${
                            (!selectedKey || submitting || !canSubmit)
                                ? "bg-gray-400"
                                : "bg-indigo-600 hover:bg-indigo-700"
                        }`}
                    >
                        {submitting ? "제출 중…" : canSubmit ? "제출" : "제출(대기 중)"}
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
                    <div
                        className={`px-4 py-3 rounded-lg ${
                            submitResult.correct ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                        }`}
                    >
                        {submitResult.correct ? "정답입니다! 🎉" : "오답입니다. 다음 문항으로 이동해 보세요."}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => navigate(`/room/${rq.room_id}?q=${Math.min(rq.q + 1, rq.total)}`)}
                            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            다음 문항으로
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
