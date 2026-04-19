import { createBrowserRouter } from "react-router";
import RealTime from "./pages/RealTime";
import Library from "./pages/Library";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RealTime,
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
