import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@quiz-rpg/core"; // 프로젝트 공용 클라이언트
import clsx from "clsx";

type Choice = { key: string; text: string };
type RoomQuestion = {
    q: number;
    total: number;
    room_id: string;
    question_id: string;
    stem: string;
    choices: Choice[]; // [{key:"A", text:"..."}...]
};

function useSearchQ(defaultQ = 1) {
    const qParam = new URLSearchParams(location.search).get("q");
    const q = Number.isFinite(Number(qParam)) && Number(qParam) > 0 ? Number(qParam) : defaultQ;
    return q;
}

function shuffle<T>(arr: T[], seed = 0) {
    // 간단한 시드 셔플(같은 q/room에서 재랜더해도 고정되게)
    const out = [...arr];
    let s = seed || 1;
    for (let i = out.length - 1; i > 0; i--) {
        s = (s * 9301 + 49297) % 233280;
        const j = Math.floor((s / 233280) * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

export default function RoomQuestionPage() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const q = useSearchQ(1);

    const [loading, setLoading] = useState(true);
    const [rq, setRQ] = useState<RoomQuestion | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState<null | { is_correct: boolean }>(null);

    // 문항 불러오기 (RPC)
    useEffect(() => {
        let ignore = false;
        async function run() {
            if (!roomId) return;
            setLoading(true);
            setError(null);
            setSubmitResult(null);
            setSelectedKey(null);
            const { data, error } = await supabase.rpc("get_room_question", {
                p_room_id: roomId,
                p_q: q,
            });
            if (!ignore) {
                if (error) {
                    setError(error.message ?? "문항을 불러오지 못했습니다.");
                    setLoading(false);
                    return;
                }
                setRQ(data as RoomQuestion);
                setLoading(false);
            }
        }
        run();
        return () => {
            ignore = true;
        };
    }, [roomId, q]);

    const shuffledChoices = useMemo(() => {
        if (!rq) return [];
        // 보기 셔플(클라이언트 전용 규칙 유지)
        return shuffle(rq.choices, rq.q * 777 + rq.question_id.length);
    }, [rq]);

    async function onSubmit() {
        if (!rq || !selectedKey) return;
        setSubmitting(true);
        const started = performance.now();

        const { data, error } = await supabase.rpc("grade_and_store", {
            room_id: rq.room_id,
            question_id: rq.question_id,
            answer: selectedKey, // 반드시 원래 key(A/B/C/...)로
            solved_ms: Math.max(0, Math.round(performance.now() - started)),
        });

        setSubmitting(false);

        if (error) {
            // 중복 제출(23505) 등: 안내만 하고 네비게이션은 계속 가능
            if ((error as any).code === "23505") {
                setSubmitResult({ is_correct: true }); // 이미 제출했으면 결과는 확정적이지 않음 → 단순 통과 처리
            } else {
                setError("제출 오류: " + error.message);
                return;
            }
        } else {
            setSubmitResult(data as { is_correct: boolean });
        }
    }

    function goNextOrResult() {
        if (!rq) return;
        const nextQ = rq.q + 1;
        if (nextQ <= rq.total) {
            navigate(`/room/${rq.room_id}?q=${nextQ}`);
        } else {
            navigate(`/room/${rq.room_id}/scoreboard`); // 결과(점수판) 라우트
        }
    }

    if (loading) return <div className="p-6 text-center">불러오는 중…</div>;
    if (error) return <div className="p-6 text-red-600">에러: {error}</div>;
    if (!rq) return null;

    return (
        <div className="max-w-2xl mx-auto p-6">
            <div className="mb-4 text-sm text-gray-500">
                문항 {rq.q} / {rq.total}
            </div>

            <h1 className="text-xl font-bold mb-4">{rq.stem}</h1>

            <div className="space-y-3 mb-6">
                {shuffledChoices.map((c) => (
                    <button
                        key={c.key}
                        onClick={() => setSelectedKey(c.key)}
                        className={clsx(
                            "w-full text-left border rounded-xl p-4 hover:bg-gray-50",
                            selectedKey === c.key && "ring-2 ring-indigo-500 border-indigo-500"
                        )}
                        disabled={!!submitResult}
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
                        className={clsx(
                            "px-4 py-2 rounded-lg text-white",
                            !selectedKey || submitting ? "bg-gray-400" : "bg-indigo-600 hover:bg-indigo-700"
                        )}
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
                    <div
                        className={clsx(
                            "px-4 py-3 rounded-lg",
                            submitResult.is_correct ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                        )}
                    >
                        {submitResult.is_correct ? "정답입니다! 🎉" : "오답입니다. 다음 문항으로 이동해 보세요."}
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
