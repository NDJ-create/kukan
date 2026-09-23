"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  IDENTITY,
  TransactionHistory,
  appendPaths,
  copyPose,
  createDocument,
  createId,
  createLayer,
  createPath,
  createSheet,
  exportArtworkSvg,
  exportPipelinePair,
  exportPipelineSvg,
  getActiveSheet,
  getRenderPaths,
  mapPoseNodes,
  parseDocument,
  rasterDimensions,
  serializeDocument,
  transformCommands,
  updatePose,
  type DrawingStyle,
  type EditorTool,
  type Id,
  type Layer,
  type Matrix,
  type NewSheetOptions,
  type PathCommand,
  type PathNode,
  type Pose,
  type StudioDocument,
  type StudioSession,
  type VectorNode,
} from "./studio-core";

import {
  FabricWorkspace,
  type WorkspaceHandle,
} from "./FabricWorkspace";

import {
  DocumentDialog,
  StudioPanels,
  buttonClass,
  inputClass,
} from "./StudioPanels";

const RECOVERY_KEY = "betwixt-vector-studio:recovery:v1";

const TOOLS: readonly [EditorTool, string, string][] = [
  ["select", "Sélection", "V"],
  ["pan", "Pan", "H"],
  ["brush", "Pinceau", "B"],
  ["pen", "Plume", "P"],
  ["nodes", "Nœuds", "N"],
  ["line", "Ligne", "L"],
  ["rectangle", "Rectangle", "R"],
  ["ellipse", "Ellipse", "E"],
];

interface Props {
  onClose?: () => void;
}

function filename(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim() || "document";
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadText(content: string, name: string, type: string): void {
  download(new Blob([content], { type }), name);
}

function cloneNodeWithNewIds(node: VectorNode): VectorNode {
  const copied = structuredClone(node);

  if (copied.kind === "group") {
    return {
      ...copied,
      id: createId(),
      children: copied.children.map(cloneNodeWithNewIds),
    };
  }

  return { ...copied, id: createId() };
}

async function artworkPng(
  svg: string,
  width: number,
  height: number,
): Promise<Blob> {
  // Limite de sécurité de l’export raster, pas du document vectoriel.
  if (width > 16384 || height > 16384 || width * height > 64_000_000) {
    throw new Error(
      "Export PNG trop grand pour cette version. Réduis les DPI ou utilise le SVG.",
    );
  }

  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );

try {
    const image = new Image();

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Impossible de rasteriser le SVG."));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Contexte PNG indisponible.");

    context.drawImage(image, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Export PNG impossible.")),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function CanvasAnimationPro({ onClose }: Props) {
  const [session, setSession] = useState<StudioSession | null>(null);
  const historyRef = useRef<TransactionHistory<StudioSession> | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const workspaceRef = useRef<WorkspaceHandle>(null);
  const openRef = useRef<HTMLInputElement>(null);
  const clipboardRef = useRef<PathNode[]>([]);
  const savedDocumentRef = useRef<StudioDocument | null>(null);

  const [dialog, setDialog] = useState<"document" | "sheet" | null>("document");
  const [tool, setTool] = useState<EditorTool>("select");
  const [selectedIds, setSelectedIds] = useState<Id[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<Id>("");
  const [style, setStyle] = useState<DrawingStyle>({
    stroke: "#000000",
    fill: null,
    strokeWidth: 2,
    opacity: 1,
  });

  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState(false);
  const [onion, setOnion] = useState(false);
  const [onionOpacity, setOnionOpacity] = useState(0.25);
  const [onionColor, setOnionColor] = useState("#ef4444");
  const [panels, setPanels] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const sheet = session ? getActiveSheet(session) : null;
  const pose = session && sheet ? sheet.poses[session.activePose] : null;
  const dirty = Boolean(session && session.document !== savedDocumentRef.current);

  function report(error: unknown) {
    setMessage(error instanceof Error ? error.message : String(error));
  }

  function install(next: StudioSession, saved = false) {
    historyRef.current = new TransactionHistory(next);
    sessionRef.current = next;
    setSession(next);
    setSelectedIds([]);

    const active = getActiveSheet(next);
    setActiveLayerId(active.poses[next.activePose].layers[0]?.id ?? "");

    savedDocumentRef.current = saved ? next.document : null;
  }

  function commit(label: string, next: StudioSession) {
    historyRef.current?.commit(label, next);
    sessionRef.current = next;
    setSession(next);
  }

function editPose(label: string, update: (current: Pose) => Pose) {
    const current = sessionRef.current;
    if (!current) return;

    const document = updatePose(
      current.document,
      current.activeSheetId,
      current.activePose,
      update,
    );

    if (document !== current.document) {
      commit(label, { ...current, document });
    }
  }

  function changeContext(next: StudioSession, label: string) {
    workspaceRef.current?.cancelGesture();
    commit(label, next);
    setSelectedIds([]);

    const nextSheet = getActiveSheet(next);
    setActiveLayerId(nextSheet.poses[next.activePose].layers[0]?.id ?? "");
  }

  function restore(direction: "undo" | "redo") {
    const history = historyRef.current;
    if (!history) return;

    workspaceRef.current?.cancelGesture();

    const next = direction === "undo" ? history.undo() : history.redo();
    sessionRef.current = next;
    setSession(next);
    setSelectedIds([]);

    const active = getActiveSheet(next);
    setActiveLayerId(active.poses[next.activePose].layers[0]?.id ?? "");
  }

  function confirmDiscard(): boolean {
    return !dirty || window.confirm("Continuer sans enregistrer les modifications ?");
  }

function createFromDialog(options: NewSheetOptions) {
    try {
      if (dialog === "sheet" && session) {
        const created = createSheet(options);

        changeContext({
          ...session,
          activeSheetId: created.id,
          document: {
            ...session.document,
            sheets: [...session.document.sheets, created],
          },
        }, "Créer une feuille");
      } else {
        install(createDocument("Sans titre", options));
      }

      setDialog(null);
      setMessage("");
    } catch (error) {
      report(error);
    }
  }

function select(ids: Id[]) {
    setSelectedIds(ids);

    if (pose && ids.length === 1) {
      const entry = getRenderPaths(pose).find((item) => item.node.id === ids[0]);

      if (entry) {
        setStyle({
          stroke: entry.node.stroke,
          fill: entry.node.fill,
          strokeWidth: entry.node.strokeWidth,
          opacity: entry.node.opacity,
        });
        setActiveLayerId(entry.layerId);
      }
    }
  }

  function createGeometry(commands: readonly PathCommand[]) {
    try {
      const path: PathNode = {
        ...createPath(commands, `Tracé ${getRenderPaths(pose!).length + 1}`),
        ...style,
      };

      editPose("Créer un tracé", (current) =>
        appendPaths(current, activeLayerId, [path]),
      );

      setSelectedIds([path.id]);
    } catch (error) {
      report(error);
    }
  }

  function transformObjects(transforms: ReadonlyMap<Id, Matrix>) {
    editPose("Transformer", (current) => mapPoseNodes(current, (node) => {
      const transform = transforms.get(node.id);
      return transform ? { ...node, transform } : node;
    }));
  }

  function editGeometry(id: Id, commands: readonly PathCommand[]) {
    editPose("Modifier les points", (current) =>
      mapPoseNodes(current, (node) =>
        node.id === id && node.kind === "path"
          ? { ...node, commands }
          : node,
      ),
    );
  }

function editableSelection(): Set<Id> {
    if (!pose) return new Set();

    return new Set(
      getRenderPaths(pose)
        .filter((entry) => selectedIds.includes(entry.node.id) && !entry.locked)
        .map((entry) => entry.node.id),
    );
  }

  function deleteSelection() {
    const ids = editableSelection();

    editPose("Supprimer les objets", (current) =>
      mapPoseNodes(current, (node) => ids.has(node.id) ? null : node),
    );

    setSelectedIds([]);
  }

  function copySelection() {
    if (!pose) return;

    clipboardRef.current = getRenderPaths(pose)
      .filter((entry) => selectedIds.includes(entry.node.id))
      .map((entry) => ({
        ...structuredClone(entry.node),
        transform: IDENTITY,
        commands: transformCommands(entry.node.commands, entry.world),
      }));
  }

  function pasteSelection() {
    if (!clipboardRef.current.length) return;

    try {
      const paths = clipboardRef.current.map((node): PathNode => ({
        ...structuredClone(node),
        id: createId(),
        name: `${node.name} copie`,
        transform: [1, 0, 0, 1, 20, 20],
      }));

      editPose("Coller", (current) => appendPaths(current, activeLayerId, paths));
      setSelectedIds(paths.map((node) => node.id));
    } catch (error) {
      report(error);
    }
  }

function changeStyle(next: DrawingStyle) {
    setStyle(next);

    const ids = editableSelection();
    if (!ids.size) return;

    editPose("Modifier le style", (current) =>
      mapPoseNodes(current, (node) =>
        ids.has(node.id) && node.kind === "path"
          ? { ...node, ...next }
          : node,
      ),
    );
  }

function layerAction(
    action: "add" | "delete" | "up" | "down" | "duplicate",
    id?: Id,
  ) {
    editPose("Modifier les calques", (current) => {
      const layers = [...current.layers];

      if (action === "add") {
        const layer = createLayer(`Calque ${layers.length + 1}`);
        layers.push(layer);
        setActiveLayerId(layer.id);
        return { ...current, layers };
      }

      const index = layers.findIndex((layer) => layer.id === id);
      if (index < 0) return current;

      if (action === "delete") {
        if (
          layers[index].children.length &&
          !window.confirm("Supprimer ce calque et ses objets ?")
        ) return current;

        layers.splice(index, 1);

        if (activeLayerId === id) {
          setActiveLayerId(layers.at(-1)?.id ?? "");
        }
        setSelectedIds([]);
      } else if (action === "duplicate") {
        const original = layers[index];
        const duplicate: Layer = {
          ...structuredClone(original),
          id: createId(),
          name: `${original.name} copie`,
          children: original.children.map(cloneNodeWithNewIds),
        };

        layers.splice(index + 1, 0, duplicate);
        setActiveLayerId(duplicate.id);
      } else {
        const target = index + (action === "up" ? 1 : -1);
        if (target < 0 || target >= layers.length) return current;

        [layers[index], layers[target]] = [layers[target], layers[index]];
      }

      return { ...current, layers };
    });
  }

function save(as = false) {
    if (!session) return;

    try {
      workspaceRef.current?.finishPath();

      const current = sessionRef.current;
      if (!current) return;

      const name = as
        ? window.prompt("Nom du document", current.document.name)
        : current.document.name;

      if (!name?.trim()) return;

      const document = name === current.document.name
        ? current.document
        : { ...current.document, name: name.trim() };

      if (document !== current.document) {
        commit("Renommer le document", { ...current, document });
      }

      const text = serializeDocument(document);

      downloadText(
        text,
        `${filename(document.name)}.betwixt.json`,
        "application/json",
      );

      savedDocumentRef.current = document;

      try {
        localStorage.setItem(RECOVERY_KEY, text);
        setMessage("Document téléchargé. Copie locale de récupération enregistrée.");
      } catch {
        setMessage("Document téléchargé. Stockage local indisponible ou plein.");
      }
    } catch (error) {
      report(error);
    }
  }

async function openFile(file: File) {
    if (!confirmDiscard()) return;

    try {
      if (file.size > 50_000_000) throw new Error("Fichier trop volumineux.");

      const document = parseDocument(await file.text());

      install({
        document,
        activeSheetId: document.sheets[0].id,
        activePose: "A",
      }, true);

      setDialog(null);
      setMessage("Document ouvert.");
    } catch (error) {
      report(error);
    }
  }

  function recover() {
    if (!confirmDiscard()) return;

    try {
      const value = localStorage.getItem(RECOVERY_KEY);
      if (!value) throw new Error("Aucune copie locale disponible.");

      const document = parseDocument(value);

      install({
        document,
        activeSheetId: document.sheets[0].id,
        activePose: "A",
      });

      setDialog(null);
      setMessage("Copie locale restaurée. Enregistre un fichier pour la conserver.");
    } catch (error) {
      report(error);
    }
  }

async function exportFile(kind: string) {
    if (!session || !sheet) return;

    workspaceRef.current?.finishPath();

    const current = sessionRef.current;
    if (!current) return;

    const active = getActiveSheet(current);
    const base = `${filename(current.document.name)}-${filename(active.name)}`;

    setBusy(true);
    setMessage("");

    try {
      if (kind === "pair") {
        const pair = exportPipelinePair(active);

        // Sans dépendance ZIP : téléchargement d’un paquet JSON explicite.
        downloadText(
          JSON.stringify(pair, null, 2),
          `${base}-poses.json`,
          "application/json",
        );

        setMessage("Paquet exporté : SVG A, SVG B et manifeste dans un fichier JSON.");
        return;
      }

      if (kind === "pipeline" || kind === "A" || kind === "B") {
        const poseKey = kind === "A" || kind === "B" ? kind : current.activePose;

        downloadText(
          exportPipelineSvg(active, poseKey),
          `${base}-${poseKey}-pipeline.svg`,
          "image/svg+xml;charset=utf-8",
        );
        return;
      }

      const selected = kind === "selection"
        ? new Set(selectedIds)
        : undefined;

      if (selected && selected.size === 0) {
        throw new Error("Sélectionne au moins un objet.");
      }

const svg = exportArtworkSvg(active, current.activePose, selected);

      if (kind === "png") {
        const dimensions = rasterDimensions(active);

        download(
          await artworkPng(svg, dimensions.width, dimensions.height),
          `${base}-${current.activePose}.png`,
        );
      } else {
        downloadText(
          svg,
          `${base}-${current.activePose}${selected ? "-selection" : ""}.svg`,
          "image/svg+xml;charset=utf-8",
        );
      }
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }

function sheetAction(action: "duplicate" | "delete" | "rename" | "left" | "right") {
    if (!session || !sheet) return;

    const sheets = [...session.document.sheets];
    const index = sheets.findIndex((item) => item.id === sheet.id);
    let activeSheetId = sheet.id;

    if (action === "duplicate") {
      const duplicate = {
        ...structuredClone(sheet),
        id: createId(),
        name: `${sheet.name} copie`,
      };

      sheets.splice(index + 1, 0, duplicate);
      activeSheetId = duplicate.id;
    } else if (action === "delete") {
      if (sheets.length === 1) {
        setMessage("Ferme le document pour supprimer sa dernière feuille.");
        return;
      }

      if (!window.confirm(`Supprimer « ${sheet.name} » ?`)) return;

      sheets.splice(index, 1);
      activeSheetId = sheets[Math.min(index, sheets.length - 1)].id;
    } else if (action === "rename") {
      const name = window.prompt("Nom de la feuille", sheet.name);
      if (!name?.trim()) return;
      sheets[index] = { ...sheet, name: name.trim() };
    } else {
      const target = index + (action === "left" ? -1 : 1);
      if (target < 0 || target >= sheets.length) return;

      [sheets[index], sheets[target]] = [sheets[target], sheets[index]];
    }

    changeContext({
      ...session,
      activeSheetId,
      document: { ...session.document, sheets },
    }, "Modifier les feuilles");
  }

function closeDocument() {
    if (!confirmDiscard()) return;

    workspaceRef.current?.cancelGesture();
    historyRef.current = null;
    sessionRef.current = null;
    setSession(null);
    setSelectedIds([]);
    setDialog(null);
    savedDocumentRef.current = null;

    onClose?.();
  }

  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (
      dialog ||
      busy ||
      (event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable=true]"))
    ) return;

    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (modifier) {
      if (["z", "y", "c", "v", "d", "s"].includes(key)) event.preventDefault();

      if (key === "z") restore(event.shiftKey ? "redo" : "undo");
      else if (key === "y") restore("redo");
      else if (key === "c") copySelection();
      else if (key === "v") pasteSelection();
      else if (key === "d") {
        copySelection();
        pasteSelection();
      } else if (key === "s") save(event.shiftKey);

      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelection();
      return;
    }

    const nextTool = TOOLS.find(([, , shortcut]) => shortcut.toLowerCase() === key);
    if (nextTool) setTool(nextTool[0]);
  }

useEffect(() => {
    if (!session) return;

    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(RECOVERY_KEY, serializeDocument(session.document));
      } catch {
        // La sauvegarde fichier reste disponible.
      }
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [session?.document]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      const current = sessionRef.current;

      if (current && current.document !== savedDocumentRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    }

    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  return (
    <section
      data-vector-studio
      tabIndex={0}
      onKeyDown={keyboard}
      className="relative flex h-[calc(100dvh-80px)] min-h-[560px] flex-col overflow-hidden bg-white text-slate-900 outline-none"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-300 p-2">
        <strong className="mr-2 text-sm">
          {session?.document.name ?? "Studio vectoriel"}{dirty ? " *" : ""}
        </strong>

        <button
          className={buttonClass}
          onClick={() => {
            if (confirmDiscard()) setDialog("document");
          }}
        >
          Nouveau
        </button>

<button className={buttonClass} onClick={() => openRef.current?.click()}>
          Ouvrir
        </button>

        <button className={buttonClass} onClick={recover}>Récupérer</button>
        <button className={buttonClass} disabled={!session} onClick={() => save()}>Sauvegarder</button>
        <button className={buttonClass} disabled={!session} onClick={() => save(true)}>Enregistrer sous</button>
        <button className={buttonClass} disabled={!session} onClick={closeDocument}>Fermer</button>

        <span className="mx-1 h-5 border-l border-slate-300" />

        <button className={buttonClass} disabled={!historyRef.current?.canUndo} onClick={() => restore("undo")}>↶</button>
        <button className={buttonClass} disabled={!historyRef.current?.canRedo} onClick={() => restore("redo")}>↷</button>

        {session && (["A", "B"] as const).map((key) => (
          <button
            key={key}
            className={`${buttonClass} ${session.activePose === key ? "!bg-indigo-100 !border-indigo-500" : ""}`}
            onClick={() => changeContext({ ...session, activePose: key }, `Passer à ${key}`)}
          >
            Pose {key}
          </button>
        ))}

        <button
          className={buttonClass}
          disabled={!session}
          onClick={() => {
            if (!session) return;

            if (!window.confirm("Remplacer B par une copie indépendante de A ?")) return;

            changeContext({
              ...session,
              activePose: "B",
              document: copyPose(session.document, session.activeSheetId, "A", "B"),
            }, "Copier A vers B");
          }}
        >
          A → B
        </button>

        <button className={buttonClass} onClick={() => setPanels((value) => !value)}>
          Propriétés
        </button>

        <select
          aria-label="Exporter"
          value=""
          className={inputClass}
          disabled={!session || busy}
          onChange={(event) => {
            if (event.target.value) void exportFile(event.target.value);
          }}
        >
<option value="">Exporter…</option>
          <option value="artwork">SVG illustration</option>
          <option value="selection">SVG sélection, cadre feuille</option>
          <option value="png">PNG feuille</option>
          <option value="pipeline">SVG pipeline — pose courante</option>
          <option value="A">SVG pipeline — A</option>
          <option value="B">SVG pipeline — B</option>
          <option value="pair">Paquet A/B JSON</option>
        </select>

        <input
          ref={openRef}
          type="file"
          accept=".json,.betwixt.json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void openFile(file);
          }}
        />
      </header>

      {message && (
        <div role="status" className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs">
          <span>{message}</span>
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}

      {session && sheet && pose ? (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 p-2 text-xs">
            <button className={buttonClass} onClick={() => workspaceRef.current?.zoomBy(0.8)}>−</button>
            <span className="w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button className={buttonClass} onClick={() => workspaceRef.current?.zoomBy(1.25)}>+</button>
            <button className={buttonClass} onClick={() => workspaceRef.current?.actualSize()}>100 %</button>
            <button className={buttonClass} onClick={() => workspaceRef.current?.fit()}>Ajuster / centrer</button>

            <label className="flex items-center gap-1">
              <input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} />
              Grille
            </label>

            <label className="flex items-center gap-1">
              <input type="checkbox" checked={onion} onChange={(event) => setOnion(event.target.checked)} />
              Onion Skin
            </label>

<input
              aria-label="Couleur onion skin"
              type="color"
              value={onionColor}
              onChange={(event) => setOnionColor(event.target.value)}
              className="h-6 w-8"
            />

            <input
              aria-label="Opacité onion skin"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={onionOpacity}
              onChange={(event) => setOnionOpacity(Number(event.target.value))}
              className="w-20"
            />

            <button
              className={buttonClass}
              disabled={!selectedIds.length}
              onClick={() => {
                copySelection();
                pasteSelection();
              }}
            >
              Dupliquer
            </button>

            <button className={buttonClass} disabled={!selectedIds.length} onClick={deleteSelection}>
              Supprimer
            </button>

            {tool === "pen" && (
              <button className={buttonClass} onClick={() => workspaceRef.current?.finishPath()}>
                Terminer le tracé — Entrée
              </button>
            )}
          </div>

<div className="flex min-h-0 flex-1">
            <nav aria-label="Outils" className="flex w-24 shrink-0 flex-col gap-1 overflow-y-auto border-r border-slate-200 p-2">
              {TOOLS.map(([value, label, shortcut]) => (
                <button
                  key={value}
                  title={`${label} — ${shortcut}`}
                  aria-pressed={tool === value}
                  className={`rounded px-2 py-3 text-left text-xs ${
                    tool === value ? "bg-indigo-600 text-white" : "hover:bg-slate-100"
                  }`}
                  onClick={() => setTool(value)}
                >
                  {label}
                  <span className="ml-1 opacity-50">{shortcut}</span>
                </button>
              ))}
            </nav>

            <main className="relative min-h-0 min-w-0 flex-1">
              <FabricWorkspace
                ref={workspaceRef}
                sheet={sheet}
                pose={pose}
                tool={tool}
                style={style}
                selectedIds={selectedIds}
                onionPose={onion ? sheet.poses[session.activePose === "A" ? "B" : "A"] : null}
                onionOpacity={onionOpacity}
                onionColor={onionColor}
                grid={grid}
                onSelect={select}
                onCreate={createGeometry}
                onTransforms={transformObjects}
                onGeometry={editGeometry}
                onZoom={setZoom}
                onError={setMessage}
              />
            </main>

{panels && (
              <StudioPanels
                sheet={sheet}
                pose={pose}
                activeLayerId={activeLayerId}
                selectedIds={selectedIds}
                style={style}
                onStyle={changeStyle}
                onSelect={select}
                onActiveLayer={setActiveLayerId}
                onLayerAction={layerAction}
                onLayerPatch={(id, patch) => editPose("Modifier un calque", (current) => ({
                  ...current,
                  layers: current.layers.map((layer) =>
                    layer.id === id ? { ...layer, ...patch } : layer,
                  ),
                }))}
                onObjectPatch={(id, patch) => editPose("Modifier un objet", (current) =>
                  mapPoseNodes(current, (node) =>
                    node.id === id ? { ...node, ...patch } : node,
                  ),
                )}
              />
            )}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center gap-1 border-t border-slate-300 bg-slate-50 p-2">
            {session.document.sheets.map((item) => (
              <button
                key={item.id}
                className={`${buttonClass} ${item.id === sheet.id ? "!bg-indigo-100 !border-indigo-500" : ""}`}
                onClick={() => changeContext({ ...session, activeSheetId: item.id }, "Changer de feuille")}
              >
                {item.name}
              </button>
            ))}

<button className={buttonClass} onClick={() => setDialog("sheet")}>+ Feuille</button>
            <button className={buttonClass} onClick={() => sheetAction("rename")}>Renommer</button>
            <button className={buttonClass} onClick={() => sheetAction("duplicate")}>Dupliquer</button>
            <button className={buttonClass} onClick={() => sheetAction("left")}>←</button>
            <button className={buttonClass} onClick={() => sheetAction("right")}>→</button>
            <button className={buttonClass} onClick={() => sheetAction("delete")}>Supprimer</button>

            <span className="ml-auto text-[10px] text-slate-500">
              {Math.round(sheet.width)} × {Math.round(sheet.height)} unités · {sheet.dpi} DPI · Espace : Pan
            </span>
          </footer>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <h1 className="text-xl font-semibold">Studio vectoriel</h1>
          <p className="text-sm text-slate-500">Crée ou ouvre un document pour commencer.</p>
          <button className={buttonClass} onClick={() => setDialog("document")}>
            Nouveau document
          </button>
        </div>
      )}

      {dialog && (
        <DocumentDialog
          title={dialog === "document" ? "Nouveau document" : "Nouvelle feuille"}
          onConfirm={createFromDialog}
          onCancel={() => setDialog(null)}
        />
      )}

      {busy && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/70 text-sm">
          Export en cours…
        </div>
      )}
    </section>
  );
}

