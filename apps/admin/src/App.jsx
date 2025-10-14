import React, { useMemo, useState, useEffect } from 'react';
import { supabase } from '@quiz-rpg/core';
import QRCode from 'qrcode';

function getStudentUrl(roomId) {
    // dev(5174→5173), prod(/admin/ → /student/) 모두 대응
    if (location.host.includes('localhost:5174')) {
        return `http://localhost:5173/student/?room=${roomId}`;
    }
    const base = new URL(import.meta.env.BASE_URL, location.origin); // .../quiz-rpg/admin/
    const student = new URL(base.pathname.replace(/admin\/?$/, 'student/'), base.origin);
    return `${student.href}?room=${roomId}`;
}

export default function App() {
    const [runId, setRunId] = useState('');
    const [roomId, setRoomId] = useState('');
    const [questionId, setQuestionId] = useState('');
    const [msg, setMsg] = useState('');
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [tally, setTally] = useState({ total: 0, correct: 0 });

    // 1) Run + Room 생성 (5분)
    const createRunAndRoom = async () => {
        setMsg('방 생성 중...');
        const r1 = await supabase.rpc('create_run', { p_title: '파일럿 런' });
        if (r1.error) return setMsg(`Run 에러: ${r1.error.message}`);
        setRunId(r1.data);

        const r2 = await supabase.rpc('create_room', { p_run: r1.data, p_minutes: 5 });
        if (r2.error) return setMsg(`Room 에러: ${r2.error.message}`);
        setRoomId(r2.data);

        setMsg('방 생성 완료');
        // QR 업데이트
        const url = getStudentUrl(r2.data);
        setQrDataUrl(await QRCode.toDataURL(url));
    };

    // 2) 1문항 시드(정답=3:'12')
    const seedQuestion = async () => {
        if (!roomId) return setMsg('먼저 방을 생성하세요.');
        setMsg('문항 시드 중...');
        const r = await supabase.rpc('add_question_to_room', {
            p_room: roomId,
            p_q_index: 1,
            p_prompt: '3 × 4 = ?',
            p_choices: ['10', '11', '12', '13'],
            p_answer_index: 3
        });
        if (r.error) return setMsg(`시드 에러: ${r.error.message}`);
        setQuestionId(r.data);
        setMsg('문항 시드 완료');
    };

    // 3) 점수판 실시간 구독
    useEffect(() => {
        if (!roomId) return;
        setTally({ total: 0, correct: 0 });

        const ch = supabase
            .channel('score:' + roomId)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'quiz',
                table: 'submissions',
                filter: `room_id=eq.${roomId}`
            }, (payload) => {
                setTally((t) => ({
                    total: t.total + 1,
                    correct: t.correct + (payload.new.correct ? 1 : 0)
                }));
            })
            .subscribe();

        return () => { supabase.removeChannel(ch); };
    }, [roomId]);

    const copyLink = async () => {
        if (!roomId) return;
        const url = getStudentUrl(roomId);
        await navigator.clipboard.writeText(url);
        setQrDataUrl(await QRCode.toDataURL(url));
        setMsg('링크 복사 완료!');
    };

    return (
        <main style={{ padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <h1>오늘의 던전 – Admin</h1>

            <section style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
                <button onClick={createRunAndRoom}>① 방 만들기(5분)</button>
                <button onClick={seedQuestion} disabled={!roomId}>② 1문항 시드</button>
                <button onClick={copyLink} disabled={!roomId}>③ 학생 링크 복사/QR 갱신</button>

                <div style={{ background: '#f6f7f9', padding: 12, borderRadius: 8 }}>
                    <div><b>run_id:</b> {runId || '-'}</div>
                    <div><b>room_id:</b> {roomId || '-'}</div>
                    <div><b>question_id:</b> {questionId || '-'}</div>
                    {qrDataUrl && (
                        <div style={{ marginTop: 8 }}>
                            <img src={qrDataUrl} alt="QR" width={180} height={180} />
                            <div style={{ fontSize: 12, marginTop: 4 }}>
                                {getStudentUrl(roomId)}
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ background: '#eefaf1', padding: 12, borderRadius: 8 }}>
                    <b>점수판(실시간)</b>
                    <div>제출 수: {tally.total}</div>
                    <div>정답 수: {tally.correct}</div>
                    <div>정답률: {tally.total ? Math.round((tally.correct / tally.total) * 100) : 0}%</div>
                </div>

                <p style={{ color: '#666' }}>{msg}</p>
            </section>
        </main>
    );
}
