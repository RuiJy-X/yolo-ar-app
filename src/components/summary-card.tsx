import React from "react";

const SummaryCard = ({
  children,
  icon,
  label,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  label: string;
}) => {
  return (
    <div className="w-full flex flex-col grow rounded-lg shadow-md bg-white px-[24px] py-[16px] gap-1 overflow-hidden min-h-0">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#344054] font-heading ">
        {icon}
        {label}
      </div>
      <div className="font-heading font-bold font-bold text-black grow  align-middle flex items-center justify-start">
        {children}
      </div>
    </div>
  );
};

export default SummaryCard;
