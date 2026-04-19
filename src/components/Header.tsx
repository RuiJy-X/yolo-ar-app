import React from "react";

const Header = ({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}) => {
  return (
    <div
      className={`flex flex-col font-heading font-bold justify-center leading-[0] min-h-px min-w-px relative text-text-h text-[48px] tracking-[-2.4px] ${className}`}
    >
      <p className="leading-[72px]">{title}</p>
      {/* description */}
      <div className="flex flex-col font-sans font-medium justify-center leading-[0]  relative shrink-0 text-[var(--text)] text-sm tracking-[0px]">
        <p className="leading-[28px]">{description}</p>
      </div>
    </div>
  );
};

export default Header;
