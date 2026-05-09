import { createBrowserRouter } from "react-router";
import RealTime from "./pages/RealTime";
import Library from "./pages/Library";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Library,
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
