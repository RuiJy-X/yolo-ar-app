import React from "react";
import NavBar from "./components/navbar";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="bg-[#eef6fa] content-stretch flex flex-col items-center relative size-full">
      <NavBar />
      <div className="relative w-full">
        <div className="flex flex-col gap-[32px] items-start px-[64px] py-[32px] relative w-full">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
