import React from "react";
import { Link } from "react-router";

const NavBar = () => {
  return (
    <div className="bg-[#fafcfe] h-[48px] relative shrink-0 w-full">
      <div
        aria-hidden="true"
        className="absolute border border-[#d9d9d9] border-solid inset-0 pointer-events-none"
      />
      <div className="flex flex-row items-center justify-center size-full">
        <div className="content-stretch flex items-center justify-center px-[32px] py-[16px] relative size-full">
          <div className="content-stretch flex flex-[1_0_0] gap-[32px] h-full items-start min-h-px min-w-px relative">
            <div className="content-stretch flex h-full items-center justify-center relative shrink-0">
              <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold justify-center leading-[0] not-italic relative shrink-0 text-[#0052ff] text-[20px] tracking-[-0.72px] whitespace-nowrap">
                <Link to="/library">
                  <p className="leading-[normal]">Aerview</p>
                </Link>
              </div>
            </div>
            {/* <div className="content-stretch flex flex-[1_0_0] gap-[24px] h-full items-center leading-[0] min-h-px min-w-px not-italic relative text-[16px] tracking-[-0.48px]">
              <Link
                to="/realtime"
                className="flex flex-col font-['Inter:Bold',sans-serif] font-bold justify-center relative shrink-0 text-[#0052ff] whitespace-nowrap"
              >
                <p className="leading-[normal]">Real Time</p>
              </Link>
              <Link
                to="/library"
                className="flex flex-col font-['Inter:Regular',sans-serif] font-normal h-full justify-center relative shrink-0 text-[#667088] w-[50px]"
              >
                <p className="leading-[normal]">Library</p>
              </Link>
            </div> */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NavBar;
