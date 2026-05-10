import React from "react";
import NavBar from "./components/navbar";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div
      className="flex flex-col relative h-screen overflow-hidden w-full"
      style={{
        background:
          "radial-gradient(circle at top left, rgba(0, 82, 255, 0.10), transparent 34%), linear-gradient(180deg, var(--canvas) 0%, var(--canvas-soft) 100%)",
      }}
    >
      <NavBar />
      {/* Content area — fills remaining height, allows children to scroll/flex */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full p-3 gap-3">
        {children}
      </div>
    </div>
  );
};

export default AppLayout;