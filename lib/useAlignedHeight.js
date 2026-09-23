"use client";

import { useEffect, useRef, useState } from "react";

// Calcule la hauteur d'une case pour que son bas s'aligne sur formBottom
// (le bas du bouton Generate, mesuré depuis le haut de son panneau).
export function useAlignedHeight(formBottom) {
  const sectionRef = useRef(null);
  const cardRef = useRef(null);
  const [cardTop, setCardTop] = useState(null);

  useEffect(() => {
    const measure = () => {
      if (!sectionRef.current || !cardRef.current) return;
      setCardTop(cardRef.current.getBoundingClientRect().top - sectionRef.current.getBoundingClientRect().top);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const height = formBottom && cardTop != null ? Math.max(256, formBottom - cardTop) : undefined;
  return { sectionRef, cardRef, height };
}
