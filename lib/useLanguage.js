"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "kukan_lang";

export function useLanguage() {
  const [lang, setLang] = useState("fr");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved === "fr" || saved === "en") {
      setLang(saved);
      return;
    }
    const browserLang = navigator.language?.slice(0, 2);
    if (browserLang === "en") setLang("en");
  }, []);

  const changeLang = (code) => {
    setLang(code);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, code);
    }
  };

  return [lang, changeLang];
}
