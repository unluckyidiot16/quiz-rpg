import React, { useMemo, useState } from 'react';
import { supabase, getOrCreateStudentKey } from '@quiz-rpg/core';

const DEMO_PROMPT = '3 × 4 = ?';
const DEMO_CHOICES = ['10','11','12','13']; // 정답=3

function useRoomId() {
    const params = new URLSearchParams(location.search);
    return params.get('room') || '';
}

export default function App() {
    const initialRoom = useRoomId();
    const [roomId, setRoomId] = useState(initialRoom);
    const [answer, setAnswer] = useState(0);
    const [result, setResult] = useState(null);
    const [msg, setMsg] = useState('');

    const studentKey = useMemo(getOrCreateStudentKey, []);

    const submit = async () => {
        setMsg('제출 중...');
        setResult(null);
        if (!roomId) return setMsg('room_id를 입력/링크로 진입하세요.');
        if (!answer) return setMsg('보기(1~4)를 선택하세요.');

        const { data, error } = await supabase.rpc('grade_and_store', {
            p_room: roomId,
            p_q_index: 1,
            p_student_key: studentKey,
            p_answer: answer
        });
        if (error) {
            // Postgres 중복 에러 코드는 23505
            if (error.code === '23505') {
                setMsg('이미 제출했습니다. 같은 방에서는 한 번만 제출할 수 있어요.');
            } else {
                setMsg('제출 오류: ' + error.message);
            }
            return;
        }
        const correct = data?.[0]?.correct === true;
        setResult(correct);
        setMsg(correct ? '정답!' : '오답!');
    };

    return (
        <main style={{ padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <h1>오늘의 던전 – Student</h1>

            <div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
                <label>
                    room_id
                    <input value={roomId} onChange={e => setRoomId(e.target.value)} style={{ width: '100%' }} />
                </label>

                <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
                    <div style={{ marginBottom: 8 }}>{DEMO_PROMPT}</div>
                    {DEMO_CHOICES.map((c, i) => (
                        <label key={i} style={{ display: 'block', marginBottom: 6 }}>
                            <input type="radio" name="ans" onChange={() => setAnswer(i + 1)} /> {i + 1}. {c}
                        </label>
                    ))}
                    <button onClick={submit}>제출</button>
                </div>

                {result !== null && (
                    <div style={{ padding: 12, background: result ? '#e8fff2' : '#ffefef', borderRadius: 8 }}>
                        {result ? '정답입니다! ⭐' : '아쉽지만 오답이에요.'}
                    </div>
                )}

                <p style={{ color: '#666' }}>{msg}</p>
                <small style={{ color: '#888' }}>student_key: {studentKey}</small>
            </div>
        </main>
    );
}
