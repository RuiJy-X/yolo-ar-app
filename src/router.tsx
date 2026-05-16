import { createBrowserRouter } from "react-router";
import RealTime from "./pages/RealTime";
import Library from "./pages/Library";
import Home from "./pages/Home";
import Help from "./pages/Help";
import Splash from "./pages/Splash";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Splash,
  },
  {
    path: "/home",
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
  {
    path: "/help",
    Component: Help,
  },
]);
