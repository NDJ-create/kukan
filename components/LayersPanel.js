"use client";

import { useState } from "react";
import LayerDpad from "./LayerDpad";

export default function LayersPanel({
  layers, activeLayerId,
  onSelectLayer, onAddLayer, onDeleteLayer, onToggleVisibility,
  onOpacityChange, onExportLayer, onReorder,
  onMoveUp, onMoveDown, onSendToBack, onBringToFront,
  t,
}) {
  const [draggedId, setDraggedId] = useState(null);

  const handleDragStart = (id) => setDraggedId(id);

  const handleDrop = (targetId) => {
    if (draggedId === null || draggedId === targetId) return;
    const draggedIndex = layers.findIndex((l) => l.id === draggedId);
    const targetIndex = layers.findIndex((l) => l.id === targetId);
    const newLayers = [...layers];
    const [removed] = newLayers.splice(draggedIndex, 1);
    newLayers.splice(targetIndex, 0, removed);
    onReorder(newLayers);
    setDraggedId(null);
  };

  const activeLayer = layers.find((l) => l.id === activeLayerId);

  return (
    <div className="border border-black rounded-lg p-3 w-full lg:w-64 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-xs uppercase tracking-widest">{t.layers}</span>
        <button
          onClick={onAddLayer}
          className="w-7 h-7 rounded-md border border-black flex items-center justify-center hover:bg-black hover:text-white transition-colors"
          title={t.addLayer}
        >
          +
        </button>
      </div>

      <p className="hidden lg:block font-mono text-[9px] text-neutral-400 mb-2">{t.dragHint}</p>

      <div className="flex flex-col gap-1 mb-4 max-h-64 overflow-y-auto">
        {[...layers].reverse().map((layer) => (
          <div
            key={layer.id}
            draggable
            onDragStart={() => handleDragStart(layer.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(layer.id)}
            onClick={() => onSelectLayer(layer.id)}
            className={`flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer border ${
              activeLayerId === layer.id ? "border-black bg-neutral-50" : "border-transparent hover:bg-neutral-50"
            }`}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }}
              className="w-5 h-5 flex items-center justify-center shrink-0"
            >
              {layer.visible ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              )}
            </button>

            <span className="flex-1 text-xs truncate">{layer.name}</span>

            <button
              onClick={(e) => { e.stopPropagation(); onExportLayer(layer.id); }}
              className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-black shrink-0"
              title={t.exportLayer}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
            </button>

            {layers.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteLayer(layer.id); }}
                className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-red-600 shrink-0"
                title={t.deleteLayer}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {activeLayer && (
        <div className="flex flex-col items-center gap-1 mb-2">
          <span className="font-mono text-[9px] text-neutral-500">{t.opacity}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={activeLayer.opacity}
            onChange={(e) => onOpacityChange(activeLayerId, Number(e.target.value))}
            className="w-full"
          />
        </div>
      )}

      <LayerDpad
        onUp={onMoveUp}
        onDown={onMoveDown}
        onFront={onBringToFront}
        onBack={onSendToBack}
        disabled={!activeLayer}
        t={t}
      />
    </div>
  );
}
