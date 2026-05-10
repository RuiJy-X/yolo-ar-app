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
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <h1
        className="text-[#171717] font-medium"
        style={{
          fontFamily: "var(--heading)",
          fontSize: 36,
          lineHeight: 1.15,
          letterSpacing: "-0.72px",
          margin: 0,
        }}
      >
        {title}
      </h1>
      <p
        className="text-[#707070]"
        style={{
          fontFamily: "var(--sans)",
          fontSize: 15,
          lineHeight: 1.5,
          fontWeight: 400,
          margin: 0,
        }}
      >
        {description}
      </p>
    </div>
  );
};

export default Header;