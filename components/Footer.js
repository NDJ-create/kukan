"use client";

export default function Footer({ t }) {
  return (
    <footer className="py-10 px-6 border-t border-black text-center">
      <p className="font-display italic text-sm mb-1">Kukan</p>
      <p className="text-xs text-neutral-500">{t.footer.tagline}</p>
    </footer>
  );
}
