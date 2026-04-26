import React from 'react'

const SummaryCard = ({ children, icon, label }: { children: React.ReactNode; icon: React.ReactNode; label: string }) => {
  return (
    <div className='rounded-lg border border-slate-700 bg-white p-3'>
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-[#344054] font-semibold">
        {icon}
        {label}
      </div>
      {children}
    </div>
  )
}

export default SummaryCard