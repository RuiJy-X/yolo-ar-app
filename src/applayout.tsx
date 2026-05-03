import React from "react";
import NavBar from "./components/navbar";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="bg-[#eef6fa] flex flex-col items-center relative h-screen overflow-hidden w-full">
      <NavBar />
      {/* This wrapper must fill remaining height and allow children to shrink */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full px-[16px] py-[8px] gap-[8px] items-start">
        {children}
      </div>
    </div>
  );
};

export default AppLayout;
