import { useState, useRef, useEffect } from "react";
import { NavLink, Link, useLocation } from "react-router";
import { Camera, ChevronDown, Plane } from "lucide-react";
import skysightLogo from "../assets/skysightlogo.png";

const NavBar = () => {
  const location = useLocation();
  const [isRealtimeOpen, setIsRealtimeOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const isRealtimeActive = location.pathname.startsWith("/realtime");

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsRealtimeOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getLinkStyle = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? "relative text-[14px] font-medium text-[#171717] tracking-[0] h-full flex items-center after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#0052ff] after:rounded-full"
      : "relative text-[14px] font-medium text-[#707070] tracking-[0] h-full flex items-center hover:text-[#171717] transition-colors duration-150";

  return (
    <header
      className="w-full bg-[#ffffff] border-b border-[#ededed] shrink-0 z-50 relative"
      style={{ height: 52 }}
    >
      <div className="h-full flex items-center px-6 gap-8">
        {/* Wordmark */}
        <Link
          to="/"
          className="font-semibold text-[17px] tracking-[-0.4px] gap-1.5 text-[#171717] flex items-center shrink-0 select-none"
          style={{ fontFamily: "var(--heading)" }}
        >
          {/* Brand accent dot */}
          <img
            src={skysightLogo}
            alt="Skysight Logo"
            className="w-8 object-contain"
          />
          Skysight
        </Link>

        {/* Divider */}
        <div className="h-5 w-px bg-[#ededed] shrink-0" />

        {/* Nav links */}
        <nav className="flex items-center h-full gap-6">
          <NavLink to="/home" className={getLinkStyle} end>
            Home
          </NavLink>
          <NavLink to="/library" className={getLinkStyle}>
            Library
          </NavLink>

          {/* Realtime Dropdown Nav Item */}
          <div className="relative h-full flex items-center" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsRealtimeOpen((prev) => !prev)}
              className={
                isRealtimeActive
                  ? "relative text-[14px] font-medium text-[#171717] tracking-[0] h-full flex items-center gap-1 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#0052ff] after:rounded-full cursor-pointer select-none"
                  : "relative text-[14px] font-medium text-[#707070] tracking-[0] h-full flex items-center gap-1 hover:text-[#171717] transition-colors duration-150 cursor-pointer select-none"
              }
            >
              <span>Realtime</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-[#707070] transition-transform duration-200 ${
                  isRealtimeOpen ? "rotate-180 text-[#171717]" : ""
                }`}
              />
            </button>

            {/* Dropdown Menu */}
            {isRealtimeOpen && (
              <div className="absolute top-[52px] left-0 w-52 rounded-xl bg-white border border-[#ededed] shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95">
                <Link
                  to="/realtime?mode=webcam"
                  onClick={() => setIsRealtimeOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isRealtimeActive &&
                    (new URLSearchParams(location.search).get("mode") === "webcam" ||
                      !new URLSearchParams(location.search).get("mode"))
                      ? "bg-blue-50 text-[#0052ff]"
                      : "text-[#171717] hover:bg-slate-50"
                  }`}
                >
                  <div className="p-1 rounded-md bg-blue-100/60 text-[#0052ff]">
                    <Camera className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="font-semibold leading-tight">Webcam</p>
                    <p className="text-[10px] text-[#707070] mt-0.5">
                      Live camera inference
                    </p>
                  </div>
                </Link>

                <Link
                  to="/realtime?mode=tello"
                  onClick={() => setIsRealtimeOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors mt-0.5 ${
                    isRealtimeActive &&
                    new URLSearchParams(location.search).get("mode") === "tello"
                      ? "bg-cyan-50 text-cyan-700"
                      : "text-[#171717] hover:bg-slate-50"
                  }`}
                >
                  <div className="p-1 rounded-md bg-cyan-100/60 text-cyan-700">
                    <Plane className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="font-semibold leading-tight">Drone View</p>
                    <p className="text-[10px] text-[#707070] mt-0.5">
                      Ryze Tello live stream
                    </p>
                  </div>
                </Link>
              </div>
            )}
          </div>

          <NavLink to="/settings" className={getLinkStyle}>
            Settings
          </NavLink>
          <NavLink to="/help" className={getLinkStyle}>
            Help
          </NavLink>
        </nav>
      </div>
    </header>
  );
};

export default NavBar;
