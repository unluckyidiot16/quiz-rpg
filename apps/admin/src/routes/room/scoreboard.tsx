import { useParams, Link } from "react-router-dom";

export default function RoomScoreboard() {
    const { roomId } = useParams();
    return (
        <div className="max-w-xl mx-auto p-6">
            <h1 className="text-xl font-bold mb-2">점수판(준비 중)</h1>
            <p className="text-gray-600 mb-6">이 방의 전체 결과 요약 화면입니다. (집계/해설은 다음 패치에서)</p>
            <Link to={`/room/${roomId}?q=1`} className="px-4 py-2 rounded-lg border hover:bg-gray-50">
                처음부터 다시 풀기
            </Link>
        </div>
    );
}
