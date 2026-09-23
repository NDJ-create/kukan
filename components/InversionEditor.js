"use client";

import { useRef, useState, useEffect } from "react";

export default function InversionEditor({ svgContent, onSubmit, onCancel, t }) {
  const canvasElRef = useRef(null);
  const fabricRef = useRef(null);
  const historyRef = useRef({ stack: [], index: -1, restoring: false });

  const [ready, setReady] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [brushSize, setBrushSize] = useState(3);
  const [tool, setTool] = useState("brush"); // "brush" | "eraser" (efface seulement les traits verts ajoutés)

  useEffect(() => {
    let disposed = false;

    const computeSize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      return Math.floor(Math.min(vw * 0.7, vh * 0.6, 720));
    };

    const size = computeSize();

    import("fabric").then(({ Canvas, PencilBrush, loadSVGFromString, util }) => {
      if (disposed) return;

      const canvas = new Canvas(canvasElRef.current, {
        width: size,
        height: size,
        backgroundColor: "#ffffff",
      });
      fabricRef.current = canvas;

      const saveHistory = () => {
        if (historyRef.current.restoring) return;
        const json = JSON.stringify(canvas.toJSON());
        const h = historyRef.current;
        h.stack = h.stack.slice(0, h.index + 1);
        h.stack.push(json);
        h.index = h.stack.length - 1;
        setCanUndo(h.index > 0);
        setCanRedo(false);
      };

      canvas.on("object:added", saveHistory);
      canvas.on("object:modified", saveHistory);
      canvas.on("object:removed", saveHistory);

      // Charge le SVG partiel comme fond, non modifiable (référence uniquement)
      loadSVGFromString(svgContent).then(({ objects, options }) => {
        const group = util.groupSVGElements(objects.filter(Boolean), options);

        const scale = Math.min(
          (size * 0.9) / group.width,
          (size * 0.9) / group.height
        );
        group.scale(scale);
        group.set({
          left: (size - group.width * scale) / 2,
          top: (size - group.height * scale) / 2,
          selectable: false,
          evented: false,
          opacity: 0.5, // le SVG de référence reste semi-transparent, pour bien distinguer les nouveaux traits verts
        });

        canvas.add(group);
        canvas.renderAll();

        const json = JSON.stringify(canvas.toJSON());
        historyRef.current = { stack: [json], index: 0, restoring: false };
        setReady(true);
      });
    });

    return () => {
      disposed = true;
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
    };
  }, [svgContent]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !ready) return;

    canvas.isDrawingMode = true;
    import("fabric").then(({ PencilBrush }) => {
      canvas.freeDrawingBrush = new PencilBrush(canvas);
      canvas.freeDrawingBrush.width = brushSize;
      // Toujours vert — convention pour les traits manquants (inversion)
      canvas.freeDrawingBrush.color = tool === "eraser" ? "#ffffff" : "#00c853";
    });
  }, [tool, brushSize, ready]);

  const undo = () => {
    const h = historyRef.current;
    if (h.index <= 0) return;
    h.index -= 1;
    const canvas = fabricRef.current;
    historyRef.current.restoring = true;
    canvas.loadFromJSON(JSON.parse(h.stack[h.index])).then(() => {
      canvas.renderAll();
      historyRef.current.restoring = false;
    });
    setCanUndo(h.index > 0);
    setCanRedo(true);
  };

  const redo = () => {
    const h = historyRef.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    const canvas = fabricRef.current;
    historyRef.current.restoring = true;
    canvas.loadFromJSON(JSON.parse(h.stack[h.index])).then(() => {
      canvas.renderAll();
      historyRef.current.restoring = false;
    });
    setCanUndo(true);
    setCanRedo(h.index < h.stack.length - 1);
  };

  const handleSubmit = () => {
    const canvas = fabricRef.current;
    // Exporte uniquement les traits verts ajoutés par l'utilisateur, pas le SVG de référence
    const svgOutput = canvas.toSVG();
    onSubmit(svgOutput);
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-black">
        <span className="font-display italic text-lg">{t.inversionTitle}</span>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="font-mono text-xs px-3 py-1.5 border border-black rounded-md">
            {t.cancel}
          </button>
          <button onClick={handleSubmit} className="font-mono text-xs px-3 py-1.5 bg-black text-white rounded-md">
            {t.validateStrokes}
          </button>
        </div>
      </div>

      <p className="px-4 py-2 font-mono text-[10px] text-neutral-500 border-b border-neutral-200">
        {t.inversionHint}
      </p>

      <div className="relative flex-1 flex items-center justify-center bg-neutral-100 p-4 overflow-auto">
        <div className="border border-black inline-block">
          <canvas ref={canvasElRef} />
        </div>

        <div className="static md:absolute md:left-6 md:top-1/2 md:-translate-y-1/2 mt-4 md:mt-0 bg-white border border-black rounded-xl shadow-lg px-2.5 py-3 flex flex-col items-center gap-2.5">
          <button
            onClick={() => setTool("brush")}
            className={`w-12 h-12 rounded-md border flex items-center justify-center ${tool === "brush" ? "bg-green-600 text-white border-green-600" : "border-neutral-300"}`}
            title={t.greenBrush}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            </svg>
          </button>
          <button
            onClick={() => setTool("eraser")}
            className={`w-12 h-12 rounded-md border flex items-center justify-center ${tool === "eraser" ? "bg-black text-white border-black" : "border-neutral-300"}`}
            title={t.eraser}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 20H7L3 16c-.5-.5-.5-1.5 0-2L14 3c.5-.5 1.5-.5 2 0l5 5c.5.5.5 1.5 0 2L11 20" />
            </svg>
          </button>

          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-[9px] text-neutral-500">{t.size}</span>
            <input
              type="range"
              min="1"
              max="15"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-16"
            />
          </div>

          <button onClick={undo} disabled={!canUndo} className="w-12 h-12 rounded-md border border-neutral-300 flex items-center justify-center disabled:opacity-30">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 10h10a5 5 0 0 1 0 10H8M3 10l4-4M3 10l4 4" />
            </svg>
          </button>
          <button onClick={redo} disabled={!canRedo} className="w-12 h-12 rounded-md border border-neutral-300 flex items-center justify-center disabled:opacity-30">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10H11a5 5 0 0 0 0 10h5M21 10l-4-4M21 10l-4 4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
