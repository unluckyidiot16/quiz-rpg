import React, { useState } from 'react';
import { supabase } from '@quiz-rpg/core';

export default function AdminAuth() {
    const [email, setEmail] = useState('');
    const [msg, setMsg] = useState('');
    const [loading, setLoading] = useState(false);

    const sendMagicLink = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMsg('로그인 링크 발송 중...');

        const redirectTo = import.meta.env.DEV
            ? 'http://localhost:5174/admin/'                       // 로컬
            : `${location.origin}${import.meta.env.BASE_URL}`;     // Pages(예: https://unluckyidiot16.github.io/quiz-rpg/admin/)
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: redirectTo,
                shouldCreateUser: true
            }
        });

        setLoading(false);
        if (error) setMsg('전송 실패: ' + error.message);
        else setMsg('메일을 확인하세요! (받은편지함/스팸)');
    };

    return (
        <main style={{ padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 420 }}>
            <h1>오늘의 던전 – Admin 로그인</h1>
            <form onSubmit={sendMagicLink} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                <label>
                    이메일
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={(e)=>setEmail(e.target.value)}
                        placeholder="teacher@example.com"
                        style={{ width:'100%' }}
                    />
                </label>
                <button type="submit" disabled={loading}>
                    {loading ? '발송 중...' : '매직링크 보내기'}
                </button>
                <p style={{ color:'#666', minHeight: 20 }}>{msg}</p>
                <small style={{ color:'#888' }}>
                    링크를 클릭하면 이 브라우저의 세션으로 로그인됩니다.
                </small>
            </form>
        </main>
    );
}
