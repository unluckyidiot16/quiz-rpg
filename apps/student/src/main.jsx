import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import RoomQuestionPage from "./routes/room/RoomQuestionPage.jsx";
import RoomScoreboard from "./routes/room/RoomScoreboard.jsx";
import Home from "./routes/Home.jsx";          // ⬅ 추가
import NotFound from "./routes/NotFound.jsx";  // ⬅ 추가
import "./index.css";

const router = createBrowserRouter(
    [
        { path: "/", element: <Home /> },
        { path: "/room/:roomId", element: <RoomQuestionPage /> },
        { path: "/room/:roomId/scoreboard", element: <RoomScoreboard /> },
        { path: "*", element: <NotFound /> },
    ],
    { basename: "/student" } // ⬅ 중요! dev URL이 /student 이므로
);

createRoot(document.getElementById("root")).render(<RouterProvider router={router} />);
