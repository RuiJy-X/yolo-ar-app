import { NavLink, Link } from "react-router";

const NavBar = () => {
  const getLinkStyle = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? "relative text-[14px] font-medium text-[#171717] tracking-[0] h-full flex items-center after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#0052ff] after:rounded-full"
      : "relative text-[14px] font-medium text-[#707070] tracking-[0] h-full flex items-center hover:text-[#171717] transition-colors duration-150";

  return (
    <header
      className="w-full bg-[#ffffff] border-b border-[#ededed] shrink-0"
      style={{ height: 52 }}
    >
      <div className="h-full flex items-center px-6 gap-8">
        {/* Wordmark */}
        <Link
          to="/"
          className="font-semibold text-[17px] tracking-[-0.4px] text-[#171717] flex items-center gap-1.5 shrink-0 select-none"
          style={{ fontFamily: "var(--heading)" }}
        >
          {/* Brand accent dot — the only chromatic event */}
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: "#0052ff" }}
          />
          Aerview
        </Link>

        {/* Divider */}
        <div className="h-5 w-px bg-[#ededed] shrink-0" />

        {/* Nav links */}
        <nav className="flex items-center h-full gap-6">
          <NavLink to="/" className={getLinkStyle} end>
            Home
          </NavLink>
          <NavLink to="/library" className={getLinkStyle}>
            Library
          </NavLink>
          <NavLink to="/realtime" className={getLinkStyle}>
            Realtime
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
