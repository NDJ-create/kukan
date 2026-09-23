"use client";

import { useState } from "react";

import {
  DOCUMENT_PRESETS,
  getRenderPaths,
  validatePoseCompatibility,
  type DrawingStyle,
  type Id,
  type NewSheetOptions,
  type Pose,
  type Sheet,
  type Unit,
} from "./studio-core";

export const buttonClass =
  "rounded border border-slate-300 bg-white px-2 py-1.5 text-xs " +
  "hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";

export const inputClass =
  "min-w-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs";

interface DocumentDialogProps {
  title: string;
  onConfirm(options: NewSheetOptions): void;
  onCancel(): void;
}

export function DocumentDialog({
  title,
  onConfirm,
  onCancel,
}: DocumentDialogProps) {
  const [name, setName] = useState("Feuille 1");
  const [width, setWidth] = useState(210);
  const [height, setHeight] = useState(297);
  const [unit, setUnit] = useState<Unit>("mm");
  const [dpi, setDpi] = useState(300);
  const [transparent, setTransparent] = useState(false);
  const [background, setBackground] = useState("#ffffff");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm({
            name,
            width,
            height,
            unit,
            dpi,
            background: transparent ? null : background,
          });
        }}
      >
        <h2 className="text-lg font-semibold">{title}</h2>

        <label className="grid gap-1 text-sm">
          Nom
          <input
            autoFocus
            required
            maxLength={200}
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

<label className="grid gap-1 text-sm">
          Format
          <select
            defaultValue="A4"
            className={inputClass}
            onChange={(event) => {
              const preset = DOCUMENT_PRESETS[
                event.target.value as keyof typeof DOCUMENT_PRESETS
              ];

              if (!preset) return;

              setWidth(preset.width);
              setHeight(preset.height);
              setUnit(preset.unit);
            }}
          >
            {Object.keys(DOCUMENT_PRESETS).map((key) => (
              <option key={key} value={key}>{key}</option>
            ))}
            <option value="custom">Personnalisé</option>
          </select>
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-1 text-xs">
            Largeur
            <input
              required
              type="number"
              min="0.001"
              step="any"
              className={inputClass}
              value={width}
              onChange={(event) => setWidth(Number(event.target.value))}
            />
          </label>

          <label className="grid gap-1 text-xs">
            Hauteur
            <input
              required
              type="number"
              min="0.001"
              step="any"
              className={inputClass}
              value={height}
              onChange={(event) => setHeight(Number(event.target.value))}
            />
          </label>

<label className="grid gap-1 text-xs">
            Unité
            <select
              className={inputClass}
              value={unit}
              onChange={(event) => setUnit(event.target.value as Unit)}
            >
              {["px", "mm", "cm", "in"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              setWidth(Math.min(width, height));
              setHeight(Math.max(width, height));
            }}
          >
            Portrait
          </button>

          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              setWidth(Math.max(width, height));
              setHeight(Math.min(width, height));
            }}
          >
            Paysage
          </button>

          <label className="flex items-center gap-2 text-xs">
            DPI
            <input
              required
              type="number"
              min="1"
              step="1"
              className={`${inputClass} w-20`}
              value={dpi}
              onChange={(event) => setDpi(Number(event.target.value))}
            />
          </label>
        </div>
<div className="flex items-center gap-4 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={transparent}
              onChange={(event) => setTransparent(event.target.checked)}
            />
            Fond transparent
          </label>

          <input
            aria-label="Couleur de fond"
            type="color"
            disabled={transparent}
            value={background}
            onChange={(event) => setBackground(event.target.value)}
          />
        </div>

        <p className="text-xs text-slate-500">
          Les DPI règlent la résolution PNG. Ils ne modifient pas les coordonnées vectorielles.
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass} onClick={onCancel}>
            Annuler
          </button>
          <button className="rounded bg-indigo-600 px-4 py-2 text-sm text-white">
            Créer
          </button>
        </div>
      </form>
    </div>
  );
}

interface PanelsProps {
  sheet: Sheet;
  pose: Pose;
  activeLayerId: Id;
  selectedIds: readonly Id[];
  style: DrawingStyle;
  onStyle(style: DrawingStyle): void;
  onSelect(ids: Id[]): void;
  onActiveLayer(id: Id): void;
  onLayerAction(
    action: "add" | "delete" | "up" | "down" | "duplicate",
    id?: Id,
  ): void;
  onLayerPatch(
    id: Id,
    patch: Partial<{
      name: string;
      visible: boolean;
      locked: boolean;
      opacity: number;
    }>,
  ): void;
  onObjectPatch(
    id: Id,
    patch: Partial<{ visible: boolean; locked: boolean }>,
  ): void;
}

export function StudioPanels(props: PanelsProps) {
  const paths = getRenderPaths(props.pose);
  const validation = validatePoseCompatibility(props.sheet);

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-300 bg-slate-50">
      <section className="space-y-3 border-b border-slate-200 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider">Propriétés</h2>

        <p className="text-xs text-slate-500">
          {props.selectedIds.length
            ? `${props.selectedIds.length} objet(s) sélectionné(s)`
            : "Style des prochains objets"}
        </p>

        {(["stroke", "fill"] as const).map((property) => (
          <div key={property} className="flex items-center gap-2">
            <label className="w-20 text-xs">
              {property === "stroke" ? "Contour" : "Remplissage"}
            </label>

            <input
              aria-label={property}
              type="color"
              value={props.style[property] ?? "#000000"}
              onChange={(event) =>
                props.onStyle({ ...props.style, [property]: event.target.value })
              }
            />

            <span className="flex-1 font-mono text-[10px]">
              {props.style[property] ?? "Aucun"}
            </span>

            <button
              className={buttonClass}
              onClick={() => props.onStyle({ ...props.style, [property]: null })}
            >
              Aucun
            </button>
          </div>
        ))}

<label className="flex items-center justify-between gap-3 text-xs">
          Épaisseur
          <input
            type="number"
            min="0"
            step="0.25"
            className={`${inputClass} w-24`}
            value={props.style.strokeWidth}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value >= 0) {
                props.onStyle({ ...props.style, strokeWidth: value });
              }
            }}
          />
        </label>

        <label className="flex items-center justify-between gap-3 text-xs">
          Opacité
          <input
            type="number"
            min="0"
            max="100"
            className={`${inputClass} w-24`}
            value={Math.round(props.style.opacity * 100)}
            onChange={(event) => {
              const value = Number(event.target.value) / 100;

              if (Number.isFinite(value) && value >= 0 && value <= 1) {
                props.onStyle({ ...props.style, opacity: value });
              }
            }}
          />
        </label>
      </section>

<section className="space-y-2 border-b border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider">Calques</h2>
          <button className={buttonClass} onClick={() => props.onLayerAction("add")}>+</button>
        </div>

        {[...props.pose.layers].reverse().map((layer) => (
          <div
            key={layer.id}
            className={`rounded border p-2 ${
              layer.id === props.activeLayerId
                ? "border-indigo-500 bg-indigo-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex gap-1">
              <button
                title={layer.visible ? "Masquer" : "Afficher"}
                className={buttonClass}
                onClick={() => props.onLayerPatch(layer.id, { visible: !layer.visible })}
              >
                {layer.visible ? "◉" : "○"}
              </button>

              <input
                aria-label="Nom du calque"
                className="min-w-0 flex-1 bg-transparent text-xs"
                value={layer.name}
                onFocus={() => props.onActiveLayer(layer.id)}
                onChange={(event) =>
                  props.onLayerPatch(layer.id, { name: event.target.value || "Calque" })
                }
              />

              <button
                title={layer.locked ? "Déverrouiller" : "Verrouiller"}
                className={buttonClass}
                onClick={() => props.onLayerPatch(layer.id, { locked: !layer.locked })}
              >
                {layer.locked ? "🔒" : "○"}
              </button>
            </div>

<div className="mt-2 flex items-center gap-1">
              <button
                className={buttonClass}
                onClick={() => props.onActiveLayer(layer.id)}
              >
                Activer
              </button>
              <button className={buttonClass} onClick={() => props.onLayerAction("up", layer.id)}>↑</button>
              <button className={buttonClass} onClick={() => props.onLayerAction("down", layer.id)}>↓</button>
              <button className={buttonClass} onClick={() => props.onLayerAction("duplicate", layer.id)}>⧉</button>
              <button className={buttonClass} onClick={() => props.onLayerAction("delete", layer.id)}>×</button>
            </div>

            <label className="mt-2 flex items-center gap-2 text-[10px]">
              Opacité
              <input
                type="number"
                min="0"
                max="100"
                className={`${inputClass} w-16`}
                value={Math.round(layer.opacity * 100)}
                onChange={(event) => {
                  const opacity = Number(event.target.value) / 100;
                  if (opacity >= 0 && opacity <= 1) {
                    props.onLayerPatch(layer.id, { opacity });
                  }
                }}
              />
            </label>

            <div className="mt-2 space-y-1">
              {paths.filter((entry) => entry.layerId === layer.id).reverse().map(({ node }) => (
                <div key={node.id} className="flex items-center gap-1 text-xs">
                  <button
                    className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left ${
                      props.selectedIds.includes(node.id) ? "bg-indigo-200" : "hover:bg-slate-100"
                    }`}
                    onClick={(event) => props.onSelect(
                      event.shiftKey
                        ? props.selectedIds.includes(node.id)
                          ? props.selectedIds.filter((id) => id !== node.id)
                          : [...props.selectedIds, node.id]
                        : [node.id],
                    )}
                  >
                    {node.name}
                  </button>

<button
                    title="Visibilité de l’objet"
                    onClick={() => props.onObjectPatch(node.id, { visible: !node.visible })}
                  >
                    {node.visible ? "◉" : "○"}
                  </button>
                  <button
                    title="Verrouillage de l’objet"
                    onClick={() => props.onObjectPatch(node.id, { locked: !node.locked })}
                  >
                    {node.locked ? "🔒" : "·"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-2 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider">Compatibilité A/B</h2>

        {validation.length === 0 && (
          <p className="text-xs text-slate-500">Aucun tracé.</p>
        )}

        {validation.map((row) => (
          <div key={row.pathId} className="rounded border border-slate-200 bg-white p-2 text-xs">
            <p className="font-medium">{row.name}</p>
            <p className="text-slate-500">
              A : {row.segmentsA ?? "absent"} · B : {row.segmentsB ?? "absent"}
            </p>
            <p className={row.compatible ? "text-emerald-700" : "text-amber-700"}>
              {row.compatible ? "✓" : "✕"} {row.reason}
            </p>
          </div>
        ))}
      </section>
    </aside>
  );
}
