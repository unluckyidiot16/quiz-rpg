import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@quiz-rpg/core";
import QRCode from "qrcode";
import AdminAuth from "./auth.jsx";

/** 학생용 링크 생성: dev(5174→5173), prod(/admin → /student) 공통 */
function getStudentUrl(roomId) {
    if (location.host.includes("localhost:5174")) {
        return `http://localhost:5173/student/room/${roomId}?q=1`;
    }
    const base = new URL(import.meta.env.BASE_URL, location.origin); // .../quiz-rpg/admin/
    const student = new URL(base.pathname.replace(/admin\/?$/, "student/"), base.origin);
    return `${student.href}room/${roomId}?q=1`;
}

export default function App() {
    // 인증
    const [session, setSession] = useState(null);
    const [userEmail, setUserEmail] = useState("");

    // 엔터티/메시지/QR
    const [runId, setRunId] = useState("");
    const [roomId, setRoomId] = useState("");
    const [msg, setMsg] = useState("");
    const [qrDataUrl, setQrDataUrl] = useState("");

    // 진행 상태(rooms)
    const [state, setState] = useState("idle");
    const [currentQ, setCurrentQ] = useState(1);
    const [totalQ, setTotalQ] = useState(0);
    const [liveProgress, setLiveProgress] = useState(false);

    // 점수판(집계 요약)
    const [attempts, setAttempts] = useState(0);
    const [correct, setCorrect] = useState(0);
    const [liveScore, setLiveScore] = useState(false);

    // --- Auth lifecycle
    useEffect(() => {
        let mounted = true;
        (async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!mounted) return;
            setSession(session ?? null);
            setUserEmail(session?.user?.email ?? "");
        })();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
            setSession(s ?? null);
            setUserEmail(s?.user?.email ?? "");
        });
        return () => subscription.unsubscribe();
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
        setMsg("로그아웃 되었습니다.");
    };

    // --- Run + Room 생성
    const createRunAndRoom = async () => {
        setMsg("방 생성 중...");
        const r1 = await supabase.rpc("create_run", { p_title: "파일럿 런" });
        if (r1.error) return setMsg(`Run 에러: ${r1.error.message}`);
        setRunId(r1.data);

        const r2 = await supabase.rpc("create_room", { p_run: r1.data, p_minutes: 5 });
        if (r2.error) return setMsg(`Room 에러: ${r2.error.message}`);
        setRoomId(r2.data);

        setMsg("방 생성 완료");
    };

    // --- 5문항 샘플 시드
      const seedQuestions = async () => {
          if (!roomId) return setMsg("먼저 방을 생성하세요.");
          setMsg("샘플 5문항 시드 중...");
          const r = await supabase.rpc("seed_demo_questions", { p_room: roomId });
          if (r.error) return setMsg(`시드 에러: ${r.error.message}`);
          await fetchProgress(roomId);
          await fetchScoreboard(roomId);
          setMsg("샘플 5문항 시드 완료");
          };

    // --- QR은 roomId 바뀔 때 갱신
    useEffect(() => {
        (async () => {
            if (!roomId) { setQrDataUrl(""); return; }
            const url = getStudentUrl(roomId);
            setQrDataUrl(await QRCode.toDataURL(url));
        })();
    }, [roomId]);

    // --- 진행 상태 조회
    const fetchProgress = useCallback(async (rid = roomId) => {
        if (!rid) return;
        const { data, error } = await supabase.rpc("get_room_progress", { p_room: rid });
        if (error) return setMsg(`진행 조회 에러: ${error.message}`);
        const one = Array.isArray(data) ? (data[0] ?? null) : data ?? null;
        if (one) { setState(one.state); setCurrentQ(one.current_q); setTotalQ(one.total_q); }
    }, [roomId]);

    // --- 점수판 집계 조회(새 RPC: get_room_scoreboard)
    const fetchScoreboard = useCallback(async (rid = roomId) => {
        if (!rid) return;
        const { data, error } = await supabase.rpc("get_room_scoreboard", { p_room: rid });
        if (error) return setMsg(`점수판 에러: ${error.message}`);
        const sb = Array.isArray(data) ? (data[0] ?? null) : data ?? null;
        if (!sb) { setAttempts(0); setCorrect(0); return; }
        const perQ = Array.isArray(sb.per_question) ? sb.per_question : [];
        const att = perQ.reduce((a, x) => a + (x.attempts ?? 0), 0);
        const cor = perQ.reduce((a, x) => a + (x.correct ?? 0), 0);
        setAttempts(att);
        setCorrect(cor);
    }, [roomId]);

    // --- 초기/room 변경 시 상태/점수 불러오기
    useEffect(() => {
        fetchProgress();
        fetchScoreboard();
    }, [fetchProgress, fetchScoreboard]);

    // --- Realtime: rooms 진행 변경 구독 (학생 브로드캐스트와 동일 채널)
    useEffect(() => {
        if (!roomId) return;
        const ch = supabase
            .channel(`admin_room_${roomId}_progress`)
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "quiz", table: "rooms", filter: `id=eq.${roomId}` },
                () => fetchProgress(roomId)
            )
            .subscribe((status) => setLiveProgress(status === "SUBSCRIBED"));
        return () => supabase.removeChannel(ch);
    }, [roomId, fetchProgress]);

    // --- Realtime: submissions 변화로 점수판 갱신
    useEffect(() => {
        if (!roomId) return;
        const ch = supabase
            .channel(`admin_room_${roomId}_score`)
            .on(
                "postgres_changes",
                { event: "*", schema: "quiz", table: "submissions", filter: `room_id=eq.${roomId}` },
                () => fetchScoreboard(roomId)
            )
            .subscribe((status) => setLiveScore(status === "SUBSCRIBED"));
        return () => supabase.removeChannel(ch);
    }, [roomId, fetchScoreboard]);

    // --- 교사용 진행 제어 RPC
    async function callProgress(fn) {
        if (!roomId) return setMsg("room_id가 없습니다.");
        setMsg("");
        const { data, error } = await supabase.rpc(fn, { p_room: roomId });
        if (error) return setMsg(`${fn} 에러: ${error.message}`);
        const one = Array.isArray(data) ? (data[0] ?? null) : data ?? null;
        if (one) { setState(one.state); setCurrentQ(one.current_q); setTotalQ(one.total_q); }
    }

    // 로그인 전
    if (!session) return <AdminAuth />;

    const studentUrl = roomId ? getStudentUrl(roomId) : "";

    return (
        <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h1>오늘의 던전 – Admin</h1>
                <div style={{ display: "flex", gap: 12, alignItems: "center", color: "#555" }}>
                    <span>{userEmail || "-"}</span>
                    <button onClick={signOut}>로그아웃</button>
                </div>
            </header>

            <section style={{ display: "grid", gap: 12, maxWidth: 720 }}>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
                    <div style={{ display: "grid", gap: 8 }}>
                        <button onClick={createRunAndRoom}>① 방 만들기(5분)</button>
                        <button onClick={seedQuestions} disabled={!roomId}>② 5문항 샘플 시드</button>
                        <button
                            onClick={async () => {
                                if (!roomId) return;
                                await navigator.clipboard.writeText(studentUrl);
                                setMsg("학생 링크 복사 완료!");
                            }}
                            disabled={!roomId}
                        >
                            ③ 학생 링크 복사
                        </button>

                        <div style={{ background: "#f6f7f9", padding: 12, borderRadius: 8 }}>
                            <div><b>run_id:</b> {runId || "-"}</div>
                            <div><b>room_id:</b> {roomId || "-"}</div>
                            {qrDataUrl && (
                                <div style={{ marginTop: 8 }}>
                                    <img src={qrDataUrl} alt="QR" width={180} height={180} />
                                    <div style={{ fontSize: 12, marginTop: 4, wordBreak: "break-all" }}>{studentUrl}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 진행 제어 + 진행 현황 */}
                    <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ background: "#eef2ff", padding: 12, borderRadius: 8 }}>
                            <b>진행 현황</b>{" "}
                            <span style={{ marginLeft: 8, color: liveProgress ? "#059669" : "#9ca3af" }}>
                ● {liveProgress ? "Live" : "Offline"}
              </span>
                            <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <div style={{ background: "#fff", padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                                    상태: <b>{state}</b>
                                </div>
                                <div style={{ background: "#fff", padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                                    현재 문항: <b>{currentQ}</b> / {totalQ}
                                </div>
                            </div>
                            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button onClick={() => callProgress("start_room")} disabled={!roomId}>시작</button>
                                <button onClick={() => callProgress("prev_question")} disabled={!roomId}>이전</button>
                                <button onClick={() => callProgress("next_question")} disabled={!roomId}>다음</button>
                                <button onClick={() => callProgress("end_room")} disabled={!roomId} style={{ background: "#dc2626", color: "#fff" }}>
                                    종료
                                </button>
                            </div>
                        </div>

                        {/* 점수판 요약 */}
                        <div style={{ background: "#ecfdf5", padding: 12, borderRadius: 8 }}>
                            <b>점수판(실시간)</b>{" "}
                            <span style={{ marginLeft: 8, color: liveScore ? "#059669" : "#9ca3af" }}>
                ● {liveScore ? "Live" : "Offline"}
              </span>
                            <div>제출 수: {attempts}</div>
                            <div>정답 수: {correct}</div>
                            <div>정답률: {attempts ? Math.round((correct / attempts) * 100) : 0}%</div>
                            <div style={{ marginTop: 8 }}>
                                <button onClick={() => { fetchProgress(); fetchScoreboard(); }} disabled={!roomId}>
                                    새로고침
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <p style={{ color: "#666", minHeight: 20 }}>{msg}</p>
            </section>
        </main>
    );
}
