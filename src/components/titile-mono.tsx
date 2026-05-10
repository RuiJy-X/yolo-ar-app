import React from 'react'

const TitleMono = ( {text}: {text:string}) => {
  return (
    <span
          className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#1a1a1a]"
          style={{ fontFamily: "var(--mono)" }}
        >
            {text}
        </span>
  )
}

export default TitleMono