import { Link } from "react-router-dom";
export default function NotFound() {
    return (
        <div className="max-w-md mx-auto p-6 space-y-4">
            <h1 className="text-xl font-bold">페이지를 찾을 수 없어요 (404)</h1>
            <p className="text-gray-600">주소를 확인하거나 홈으로 돌아가 주세요.</p>
            <Link to="/" className="px-4 py-2 rounded-lg border hover:bg-gray-50">홈으로</Link>
        </div>
    );
}
