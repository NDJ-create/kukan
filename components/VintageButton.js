"use client";

export default function VintageButton({ onClick, disabled, children, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        background: "linear-gradient(180deg, #ffffff 0%, #e8e8e8 100%)",
        border: "1px solid #000",
        boxShadow: disabled
          ? "none"
          : "0 2px 0 rgba(0,0,0,0.9), inset 0 1px 1px rgba(255,255,255,0.8), inset 0 -1px 2px rgba(0,0,0,0.15)",
      }}
    >
      {children}
    </button>
  );
}
