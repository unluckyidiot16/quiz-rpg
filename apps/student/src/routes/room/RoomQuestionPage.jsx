import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/client";
import { IDB } from "../../lib/idb";

const idb = new IDB();

export default function RoomQuestionPage() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const [qs] = useSearchParams();
    const qFromURL = Number(qs.get("q") || 1);

    const [loading, setLoading] = useState(true);
    const [roomState, setRoomState] = useState("idle"); // idle | running | ended
    const [currentQIndex, setCurrentQIndex] = useState(qFromURL);
    const [rq, setRQ] = useState(null);                 // 현재 문항 데이터
    const [selectedKey, setSelectedKey] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState("");

    // ---- 진행상태 폴링 (실시간 제거) ----
    const pollRef = useRef(null);
    useEffect(() => {
        async function tick() {
            const { data, error } = await supabase.rpc("get_room_progress", { p_room: roomId });
            if (error) return; // 조용히 무시(네트워크/권한)
            const one = Array.isArray(data) ? data[0] : data;
            if (!one) return;

            setRoomState(one.state);
            setCurrentQIndex(one.current_q);

            // 상태 전환
            if (one.state === "ended") {
                navigate(`/room/${roomId}/scoreboard`, { replace: true });
            } else if (one.state === "running" && one.current_q && one.current_q !== qFromURL) {
                navigate(`/room/${roomId}?q=${one.current_q}`, { replace: true });
            }
        }

        tick(); // 즉시 1회
        pollRef.current = setInterval(tick, 5000);
        return () => clearInterval(pollRef.current);
    }, [roomId, qFromURL, navigate]);

    // ---- 문항 로드 (빠른 전환: 기존 RPC 유지) ----
    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true);
            setErr("");
            // NOTE: thin-arch 최종형은 IndexedDB question_bank에서 꺼내도록 바꿀 예정
            const { data, error } = await supabase.rpc("get_room_question", {
                p_room: roomId,
                p_q_index: qFromURL
            });
            if (!alive) return;
            if (error) { setErr(error.message); setLoading(false); return; }
            const row = Array.isArray(data) ? data[0] : data;
            setRQ(row ?? null);
            setLoading(false);
        })();
        return () => { alive = false; };
    }, [roomId, qFromURL]);

    // ---- 제출 3단계: begin_run → submit_room → commit_run ----
    async function handleSubmit() {
        if (!rq || !selectedKey || submitting) return;
        setSubmitting(true); setErr("");
        try {
            // 1) 입장 (비용 차감 + run 티켓 + 최신 walletSig)
            const br = await supabase.rpc("begin_run", { _room: roomId });
            if (br.error) throw br.error;
            const b = Array.isArray(br.data) ? br.data[0] : br.data;
            await idb.kvSet("walletSig", b.walletsig);

            // 2) 제출 (서버 채점 + proof)
            const qid = rq.question_id ?? rq.id; // 서버 스키마에 따라 둘 중 하나
            const sr = await supabase.rpc("submit_room", {
                _room: roomId,
                answers: [{ question_id: qid, choiceKey: selectedKey, timeMs: 0 }]
            });
            if (sr.error) throw sr.error;
            const s = Array.isArray(sr.data) ? sr.data[0] : sr.data;

            // 3) 정산 (보상 확정 + walletSig 갱신)
            const cr = await supabase.rpc("commit_run", {
                _ticket: b.ticket,
                _room: roomId,
                _proof: s.proof
            });
            if (cr.error) throw cr.error;
            const c = Array.isArray(cr.data) ? cr.data[0] : cr.data;
            await idb.kvSet("walletSig", c.walletsig);

            // 결과 안내 (정답 수/총 문항)
            alert(`정답 ${s.correct}/${s.total}`);
            // 다음 문항으로 이동은 폴링에서 자동 처리
        } catch (e) {
            setErr(typeof e === "string" ? e : e.message ?? "submit failed");
        } finally {
            setSubmitting(false);
        }
    }

    // ---- UI ----
    if (loading) return <div className="p-4">불러오는 중…</div>;
    if (err) return <div className="p-4 text-red-600">오류: {err}</div>;
    if (!rq) return <div className="p-4">문항이 없습니다.</div>;

    return (
        <div className="p-4 space-y-4">
            <div className="text-sm opacity-70">
                상태: {roomState} / Q{currentQIndex}
            </div>
            <h1 className="text-lg font-bold">{rq.stem ?? "문제"}</h1>

            <div className="space-y-2">
                {(rq.choices ?? []).map((c, idx) => {
                    const k = c.key ?? String.fromCharCode(65 + idx); // A,B,C...
                    return (
                        <button
                            key={k}
                            disabled={submitting}
                            onClick={() => setSelectedKey(k)}
                            className={`block w-full text-left rounded border p-3 ${selectedKey===k ? "border-blue-500" : "border-gray-300"}`}
                        >
                            <span className="font-semibold mr-2">{k}.</span>
                            <span>{c.text ?? c}</span>
                        </button>
                    );
                })}
            </div>

            <button
                disabled={!selectedKey || submitting}
                onClick={handleSubmit}
                className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
            >
                {submitting ? "제출 중…" : "제출"}
            </button>
        </div>
    );
}
