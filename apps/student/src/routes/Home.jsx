import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
    const [roomId, setRoomId] = useState("");
    const navigate = useNavigate();

    function go(e) {
        e.preventDefault();
        if (!roomId) return;
        navigate(`/room/${roomId}?q=1`);
    }

    return (
        <div className="max-w-md mx-auto p-6 space-y-4">
            <h1 className="text-xl font-bold">퀴즈 방 입장</h1>
            <form onSubmit={go} className="space-y-3">
                <input
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder="room_id 입력"
                    className="w-full border rounded-lg p-3"
                />
                <button className="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white">
                    시작하기
                </button>
            </form>
            <p className="text-sm text-gray-500">또는 URL로 직접 /student/room/&lt;roomId&gt;?q=1 로 접속</p>
        </div>
    );
}
