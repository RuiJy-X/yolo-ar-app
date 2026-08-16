import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router";

const Splash = lazy(() => import("./pages/Splash"));
const Home = lazy(() => import("./pages/Home"));
const RealTime = lazy(() => import("./pages/RealTime"));
const Library = lazy(() => import("./pages/Library"));
const Settings = lazy(() => import("./pages/Settings"));
const Help = lazy(() => import("./pages/Help"));

const LoadingFallback = () => (
  <div className="fixed inset-0 bg-white flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-[#0052ff] border-t-transparent rounded-full animate-spin" />
  </div>
);

const withSuspense = (Component: React.ComponentType) => (
  <Suspense fallback={<LoadingFallback />}>
    <Component />
  </Suspense>
);

export const router = createBrowserRouter([
  {
    path: "/",
    element: withSuspense(Splash),
  },
  {
    path: "/home",
    element: withSuspense(Home),
  },
  {
    path: "/realtime",
    element: withSuspense(RealTime),
  },
  {
    path: "/library",
    element: withSuspense(Library),
  },
  {
    path: "/settings",
    element: withSuspense(Settings),
  },
  {
    path: "/help",
    element: withSuspense(Help),
  },
]);
