// src/main.jsx
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import RoomQuestionPage from "./routes/room/RoomQuestionPage.jsx";
import RoomScoreboard from "./routes/room/RoomScoreboard.jsx";
import Home from "./routes/Home.jsx";
import NotFound from "./routes/NotFound.jsx";
import "./index.css";

import { supabase } from "./lib/client";
import { IDB } from "./lib/idb";
import { boot } from "./lib/boot";
import { WalletClient } from "./lib/wallet";
import { useEffect, useState } from "react";

/** 무소음 로그인 (익명 or 테스트계정) */
async function ensureAuth() {
    const { data: sess } = await supabase.auth.getSession();
    if (sess?.session) return;

    if (typeof supabase.auth.signInAnonymously === "function") {
        const { error } = await supabase.auth.signInAnonymously();
        if (!error) return;
        console.warn("[auth] anonymous sign-in failed:", error.message);
    }

    const email = import.meta.env.VITE_TEST_EMAIL;
    const password = import.meta.env.VITE_TEST_PASSWORD;
    if (email && password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (!error) return;
        console.warn("[auth] test account sign-in failed:", error.message);
    }

    console.error("[auth] no session; wallet/rpc that require auth will fail");
}

/** 부트 게이트: 화면은 즉시 렌더, 부트는 백그라운드 */
function BootGate({ children }) {
    const [ready, setReady] = useState(false);
    useEffect(() => {
        (async () => {
            try {
                await ensureAuth();                    // 세션 보장
                const idb = new IDB();
                await boot({ supabase, idb });         // qbank 델타 + 시계 보정
                const wallet = new WalletClient(supabase, idb);
                await wallet.ensure();                 // 지갑 서명(있으면 갱신)
            } catch (e) {
                console.error("[boot] failed:", e);
            } finally {
                setReady(true);
            }
        })();
    }, []);

    if (!ready) {
        return (
            <div className="grid place-items-center min-h-dvh text-sm opacity-70">
                로딩 중… (첫 실행은 문항 동기화로 다소 길 수 있어요)
            </div>
        );
    }
    return children;
}

// dev에선 '/', 배포(vite.config의 base)에서는 그 값 사용
const basename = import.meta.env.BASE_URL || "/";

const router = createBrowserRouter(
    [
        { path: "/", element: <Home /> },
        { path: "/room/:roomId", element: <RoomQuestionPage /> },
        { path: "/room/:roomId/scoreboard", element: <RoomScoreboard /> },
        { path: "*", element: <NotFound /> },
    ],
    { basename }
);

createRoot(document.getElementById("root")).render(
    <BootGate>
        <RouterProvider router={router} />
    </BootGate>
);
