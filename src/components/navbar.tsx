import React from "react";
import { NavLink, Link } from "react-router"; // Note: ensure you are importing from 'react-router-dom'

const NavBar = () => {
  // Shared styles for the links to keep the JSX clean
  const linkBaseClass =
    "flex flex-col justify-center relative shrink-0 h-full whitespace-nowrap";

  const getLinkStyle = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? `${linkBaseClass} font-bold text-[#0052ff] font-['Inter:Bold',sans-serif]`
      : `${linkBaseClass} font-normal text-[#667088] font-['Inter:Regular',sans-serif]`;

  return (
    <div className="bg-[#fafcfe] h-[48px] relative shrink-0 w-full">
      <div
        aria-hidden="true"
        className="absolute border border-[#d9d9d9] border-solid inset-0 pointer-events-none"
      />
      <div className="flex flex-row items-center justify-center size-full">
        <div className="content-stretch flex items-center justify-center px-[32px] py-[16px] relative size-full">
          <div className="content-stretch flex flex-[1_0_0] gap-[32px] h-full items-start min-h-px min-w-px relative">
            {/* Logo Section */}
            <div className="content-stretch flex h-full items-center justify-center relative shrink-0">
              <div className="flex flex-col font-['Inter:Bold',sans-serif] font-bold justify-center leading-[0] not-italic relative shrink-0 text-[#0052ff] text-[20px] tracking-[-0.72px] whitespace-nowrap">
                <Link to="/">
                  <p className="leading-[normal]">Aerview</p>
                </Link>
              </div>
            </div>

            {/* Navigation Links */}
            <div className="content-stretch flex flex-[1_0_0] gap-[24px] h-full items-center leading-[0] min-h-px min-w-px not-italic relative text-[16px] tracking-[-0.48px]">
              <NavLink
                to="/"
                className={getLinkStyle}
                end // 'end' ensures Home isn't highlighted when you're at /library
              >
                <p className="leading-[normal]">Home</p>
              </NavLink>

              <NavLink to="/library" className={getLinkStyle}>
                <p className="leading-[normal]">Library</p>
              </NavLink>

              <NavLink to="/realtime" className={getLinkStyle}>
                <p className="leading-[normal]">Realtime</p>
              </NavLink>
              <NavLink to="/help" className={getLinkStyle}>
                <p className="leading-[normal]">Help</p>
              </NavLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NavBar;