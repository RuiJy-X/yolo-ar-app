import { createBrowserRouter } from "react-router";
import RealTime from "./pages/RealTime";
import Library from "./pages/Library";
import Home from "./pages/Home";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Home,
  },
  {
    path: "/realtime",
    Component: RealTime,
  },
  {
    path: "/library",
    Component: Library,
  },
]);
