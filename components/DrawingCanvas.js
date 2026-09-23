"use client";

import { useEffect, useRef, useState } from "react";

const DOCUMENT_SIZE = 512;
const HISTORY_LIMIT = 80;

function catmullRom2bezier(points) {
  if (points.length < 2) return "";

  let d = `M ${points[0].x},${points[0].y}`;

  if (points.length === 2) {
    const [p0, p1] = points;
    const c1x = p0.x + (p1.x - p0.x) / 3;
    const c1y = p0.y + (p1.y - p0.y) / 3;
    const c2x = p0.x + (2 * (p1.x - p0.x)) / 3;
    const c2y = p0.y + (2 * (p1.y - p0.y)) / 3;
    return `${d} C ${c1x},${c1y} ${c2x},${c2y} ${p1.x},${p1.y}`;
  }

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    d += ` C ${
      p1.x + (p2.x - p0.x) / 6
    },${
      p1.y + (p2.y - p0.y) / 6
    } ${
      p2.x - (p3.x - p1.x) / 6
    },${
      p2.y - (p3.y - p1.y) / 6
    } ${p2.x},${p2.y}`;
  }

  return d;
}

function simplifyDouglasPeucker(points, epsilon) {
  if (points.length < 3) return points;

  const perpendicularDistance = (pt, lineStart, lineEnd) => {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    if (dx === 0 && dy === 0) {
      return Math.hypot(pt.x - lineStart.x, pt.y - lineStart.y);
    }
    const num = Math.abs(dy * pt.x - dx * pt.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
    const den = Math.hypot(dx, dy);
    return num / den;
  };

  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyDouglasPeucker(points.slice(0, index + 1), epsilon);
    const right = simplifyDouglasPeucker(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }

  return [points[0], points[points.length - 1]];
}

function Icon({ name, size = 18 }) {
  const paths = {
    select: "M4 3l7 17 2.5-7.5L21 10 4 3z",
    path: "M4 18C8 18 8 6 12 6s4 8 8 8",
    undo: "M4 9h10a6 6 0 010 12h-3M4 9l5-5M4 9l5 5",
    redo: "M20 9H10a6 6 0 000 12h3M20 9l-5-5M20 9l-5 5",
    trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
    clear: "M4 4l16 16M20 4L4 20",
    panel: "M3 4h18v16H3zM15 4v16",
    eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z",
    hidden: "M3 3l18 18M10 5h2c6 0 10 7 10 7s-1 2-3 4M6 6c-3 2-4 6-4 6s4 7 10 7c2 0 4-1 5-2",
    lock: "M7 10V7a5 5 0 0110 0v3M5 10h14v11H5z",
    layers: "M12 3L2 8l10 5 10-5-10-5zM2 12l10 5 10-5M2 16l10 5 10-5",
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.select} />
      {name === "eye" && <circle cx="12" cy="12" r="3" />}
      {name === "path" && (
        <>
          <circle cx="4" cy="18" r="1.5" />
          <circle cx="12" cy="6" r="1.5" />
          <circle cx="20" cy="14" r="1.5" />
        </>
      )}
    </svg>
  );
}

function ToolButton({ name, label, active, disabled, onClick }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border transition
        disabled:cursor-not-allowed disabled:opacity-30
        ${
          active
            ? "border-black bg-black text-white"
            : "border-neutral-200 bg-white text-black hover:border-black"
        }`}
    >
      <Icon name={name} />
    </button>
  );
}

// Actualise les interactions sans recréer le canvas.
function configureEngine(engine, settings) {
  if (!engine || engine.disposed) return;

  const { canvas } = engine;
  const selectable = settings.tool === "select" && !engine.busy;

  canvas.isDrawingMode = false;
  canvas.selection = selectable;
  canvas.skipTargetFind = !selectable;
  canvas.defaultCursor = settings.tool === "path" ? "crosshair" : "default";

  canvas.forEachObject((object) => {
    const editable =
      object.__role !== "background" &&
      object.__role !== "preview";

    object.set({
      selectable: editable && selectable,
      evented: editable && selectable,
    });

    if (object.__role === "trace" || object.__role === undefined) {
      object.set({ visible: settings.drawVisible !== false });
    }
  });

  if (!selectable) {
    canvas.discardActiveObject();
  }

  const background = canvas
    .getObjects()
    .find((object) => object.__role === "background");

  if (background) {
    background.set({
      opacity: settings.bgOpacity,
      visible: settings.bgVisible,
      selectable: false,
      evented: false,
    });
  }

  canvas.requestRenderAll();
}

export default function DrawingCanvas({
  backgroundImageUrl,
  onSave,
  onCancel,
  t = {},
}) {
  const rootRef = useRef(null);
  const workspaceRef = useRef(null);
  const canvasHostRef = useRef(null);
  const engineRef = useRef(null);
  const actionsRef = useRef({});

  const [tool, setTool] = useState(
    backgroundImageUrl ? "path" : "select"
  );
  const [pathStrokeWidth, setPathStrokeWidth] = useState(2);
  const [bgOpacity, setBgOpacity] = useState(0.35);
  const [bgVisible, setBgVisible] = useState(true);
  const [drawVisible, setDrawVisible] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [includeReference, setIncludeReference] = useState(false);

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [selectionCount, setSelectionCount] = useState(0);
  const [objectCount, setObjectCount] = useState(0);
  const [pathPointCount, setPathPointCount] = useState(0);
  const [zoomPercent, setZoomPercent] = useState(100);

  const settingsRef = useRef({});
  settingsRef.current = {
    tool,
    pathStrokeWidth,
    bgOpacity,
    bgVisible,
    drawVisible,
  };

  const disabled = !ready || busy;

  const toolNames = {
    select: t.toolSelectLabel,
    path: t.toolPathLabel,
  };

  function syncHistory(engine) {
    setCanUndo(engine.historyIndex > 0);
    setCanRedo(engine.historyIndex < engine.history.length - 1);

    setObjectCount(
      engine.canvas
        .getObjects()
        .filter(
          (object) =>
            object.__role !== "background" &&
            object.__role !== "preview"
        ).length
    );
  }

  function saveHistory(engine) {
    if (!engine || engine.disposed || engine.busy || engine.suspended) {
      return;
    }

    // Fabric 6/7 : toObject permet d'ajouter les propriétés personnalisées.
    const json = JSON.stringify(
      engine.canvas.toObject(["__role"])
    );

    if (engine.history[engine.historyIndex] === json) return;

    engine.history = engine.history.slice(0, engine.historyIndex + 1);
    engine.history.push(json);

    if (engine.history.length > HISTORY_LIMIT) {
      engine.history.shift();
    }

    engine.historyIndex = engine.history.length - 1;
    syncHistory(engine);
  }

  function cancelPath(engine = engineRef.current) {
    if (!engine || engine.disposed) return;

    if (engine.preview) {
      engine.canvas.remove(engine.preview);
      engine.preview = null;
    }

    engine.points = [];
    setPathPointCount(0);
    engine.canvas.requestRenderAll();
  }

  function updatePreview(engine = engineRef.current) {
    if (!engine || engine.disposed) return;

    if (engine.preview) {
      engine.canvas.remove(engine.preview);
      engine.preview = null;
    }

    const points = engine.points;

    if (!points.length) {
      engine.canvas.requestRenderAll();
      return;
    }

    const width = settingsRef.current.pathStrokeWidth;
    let preview;

    if (points.length === 1) {
      preview = new engine.mod.Circle({
        left: points[0].x,
        top: points[0].y,
        originX: "center",
        originY: "center",
        radius: Math.max(2, width / 2),
        fill: "#e11d48",
      });
    } else {
      preview = new engine.mod.Path(catmullRom2bezier(points), {
        fill: "",
        stroke: "#e11d48",
        strokeWidth: width,
        strokeDashArray: [4, 3],
        strokeLineCap: "round",
        strokeLineJoin: "round",
      });
    }

    preview.set({
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    preview.__role = "preview";

    engine.preview = preview;
    engine.canvas.add(preview);
    engine.canvas.requestRenderAll();
  }

  function finishPath() {
    const engine = engineRef.current;
    if (!engine || engine.busy || engine.points.length < 2) return;

    const points = [...engine.points];

    cancelPath(engine);

    const dString = catmullRom2bezier(points);

    const path = new engine.mod.Path(dString, {
      fill: "",
      stroke: "#000000",
      strokeWidth: settingsRef.current.pathStrokeWidth,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      selectable: false,
      evented: false,
    });

    path.__role = "trace";
    path.__dString = dString;
    path.__strokeWidth = settingsRef.current.pathStrokeWidth;
    engine.canvas.add(path);
    engine.canvas.requestRenderAll();
  }

  function removeLastPoint() {
    const engine = engineRef.current;
    if (!engine || engine.busy || !engine.points.length) return;

    engine.points.pop();
    setPathPointCount(engine.points.length);
    updatePreview(engine);
  }

  // Initialisation : indépendante de l'ouverture du panneau.
  useEffect(() => {
    let cancelled = false;
    let engine = null;
    let observer = null;

    const host = canvasHostRef.current;
    const workspace = workspaceRef.current;

    setReady(false);
    setBusy(false);
    setError("");
    setCanUndo(false);
    setCanRedo(false);
    setSelectionCount(0);
    setObjectCount(0);
    setPathPointCount(0);

    async function initialize() {
      try {
        const mod = await import("fabric");
        if (cancelled || !host || !workspace) return;

        // Élément propre à cette instance, y compris en React Strict Mode.
        const canvasElement = document.createElement("canvas");
        host.appendChild(canvasElement);

        const canvas = new mod.Canvas(canvasElement, {
          width: DOCUMENT_SIZE,
          height: DOCUMENT_SIZE,
          backgroundColor: "#ffffff",
          preserveObjectStacking: true,
          enableRetinaScaling: true,
        });

        engine = {
          mod,
          canvas,
          disposed: false,
          busy: false,
          suspended: true,
          points: [],
          preview: null,
          history: [],
          historyIndex: -1,
        };

        engineRef.current = engine;

        const fitToWorkspace = () => {
          if (cancelled || engine.disposed) return;

          const rect = workspace.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) return;

          const side = Math.max(
            1,
            Math.floor(Math.min(rect.width, rect.height, 900))
          );

          const zoom = side / DOCUMENT_SIZE;

          canvas.setDimensions({
            width: side,
            height: side,
          });

          // Le document reste en 512 × 512.
          // Seule sa vue change : aucun objet n'est déplacé.
          canvas.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
          canvas.calcOffset();
          canvas.requestRenderAll();

          setZoomPercent(Math.round(zoom * 100));
        };

        observer = new ResizeObserver(fitToWorkspace);
        observer.observe(workspace);
        fitToWorkspace();

        const updateSelection = () => {
          if (!cancelled) {
            setSelectionCount(canvas.getActiveObjects().length);
          }
        };

        canvas.on("selection:created", updateSelection);
        canvas.on("selection:updated", updateSelection);
        canvas.on("selection:cleared", updateSelection);

        canvas.on("object:added", ({ target }) => {
          if (!target || target.__role === "preview") return;

          if (!target.__role) target.__role = "trace";

          if (target.__role !== "background") {
            const selectable = settingsRef.current.tool === "select";
            target.set({
              selectable,
              evented: selectable,
            });
          }

          saveHistory(engine);
        });

        canvas.on("object:modified", () => saveHistory(engine));

        canvas.on("object:removed", ({ target }) => {
          if (target?.__role !== "preview") {
            saveHistory(engine);
          }
        });

        engine.dragging = false;
        engine.dragPoints = [];
        engine.dragStart = null;

        canvas.on("mouse:down", ({ e }) => {
          if (
            engine.busy ||
            settingsRef.current.tool !== "path" ||
            (typeof e.button === "number" && e.button !== 0)
          ) {
            return;
          }

          if (e.detail > 1) return;

          const point = canvas.getScenePoint(e);

          if (
            point.x < 0 ||
            point.y < 0 ||
            point.x > DOCUMENT_SIZE ||
            point.y > DOCUMENT_SIZE
          ) {
            return;
          }

          engine.dragStart = { x: point.x, y: point.y };
          engine.dragPoints = [{ x: point.x, y: point.y }];
          engine.dragging = false;
        });

        canvas.on("mouse:move", ({ e }) => {
          if (
            engine.busy ||
            settingsRef.current.tool !== "path" ||
            !engine.dragStart
          ) {
            return;
          }

          const point = canvas.getScenePoint(e);
          const last = engine.dragPoints[engine.dragPoints.length - 1];
          const dist = Math.hypot(point.x - last.x, point.y - last.y);

          if (!engine.dragging && dist > 6) {
            engine.dragging = true;
          }

          if (engine.dragging && dist > 8) {
            engine.dragPoints.push({ x: point.x, y: point.y });
            engine.points = engine.dragPoints;
            setPathPointCount(engine.points.length);
            updatePreview(engine);
          }
        });

        canvas.on("mouse:up", () => {
          if (settingsRef.current.tool !== "path") {
            engine.dragStart = null;
            return;
          }

          if (engine.dragging && engine.dragPoints.length >= 2) {
            const simplified = simplifyDouglasPeucker(engine.dragPoints, 2.5);
            engine.points = simplified;
            setPathPointCount(engine.points.length);
            updatePreview(engine);
            actionsRef.current.finishPath?.();
          }
          // Un simple tap sans glisse ne fait rien : il faut glisser pour tracer.

          engine.dragStart = null;
          engine.dragging = false;
          engine.dragPoints = [];
        });

        canvas.on("mouse:dblclick", ({ e }) => {
          if (settingsRef.current.tool !== "path" || engine.busy) return;

          e.preventDefault();
          actionsRef.current.finishPath?.();
        });

        if (backgroundImageUrl) {
          try {
            const FabricImage = mod.FabricImage || mod.Image;
            const image = await FabricImage.fromURL(
              backgroundImageUrl,
              { crossOrigin: "anonymous" }
            );

            if (cancelled || engine.disposed) return;

            if (!image.width || !image.height) {
              throw new Error("Dimensions de référence invalides.");
            }

            const scale = Math.min(
              DOCUMENT_SIZE / image.width,
              DOCUMENT_SIZE / image.height
            );

            image.set({
              originX: "left",
              originY: "top",
              left: (DOCUMENT_SIZE - image.width * scale) / 2,
              top: (DOCUMENT_SIZE - image.height * scale) / 2,
              scaleX: scale,
              scaleY: scale,
              selectable: false,
              evented: false,
              opacity: settingsRef.current.bgOpacity,
              visible: settingsRef.current.bgVisible,
            });

            image.__role = "background";
            canvas.add(image);
          } catch (imageError) {
            if (cancelled) return;

            console.error(imageError);
            setError(t.errorReferenceLoad);
          }
        }

        if (cancelled || engine.disposed) return;

        engine.suspended = false;
        configureEngine(engine, settingsRef.current);
        saveHistory(engine);
        fitToWorkspace();
        setReady(true);
      } catch (initializationError) {
        if (cancelled) return;

        console.error(initializationError);
        setError(t.errorInitEditor);
      }
    }

    initialize();

    return () => {
      cancelled = true;
      observer?.disconnect();

      if (engine) {
        engine.disposed = true;

        if (engineRef.current === engine) {
          engineRef.current = null;
        }

        // Fabric 6/7 peut effectuer une destruction asynchrone.
        Promise.resolve(engine.canvas.dispose()).catch(console.error);
      }

      host?.replaceChildren();
    };
  }, [backgroundImageUrl]);

  useEffect(() => {
    if (!ready) return;

    const engine = engineRef.current;
    if (!engine) return;

    if (tool !== "path") {
      cancelPath(engine);
    }

    configureEngine(engine, settingsRef.current);
  }, [tool, bgOpacity, bgVisible, ready]);

  useEffect(() => {
    if (engineRef.current?.preview) {
      updatePreview();
    }
  }, [pathStrokeWidth]);

  // Sur mobile normal, le panneau commence fermé.
  useEffect(() => {
    setRightPanelOpen(window.innerWidth >= 768);
  }, []);

  async function restoreHistory(direction) {
    const engine = engineRef.current;
    if (!engine || engine.busy) return;

    const nextIndex = engine.historyIndex + direction;

    if (nextIndex < 0 || nextIndex >= engine.history.length) return;

    cancelPath(engine);
    engine.canvas.discardActiveObject();
    engine.busy = true;
    setBusy(true);
    setError("");
    configureEngine(engine, settingsRef.current);

    try {
      await engine.canvas.loadFromJSON(
        JSON.parse(engine.history[nextIndex])
      );

      if (engine.disposed) return;

      engine.historyIndex = nextIndex;
      syncHistory(engine);
      setSelectionCount(0);
    } catch (restoreError) {
      if (!engine.disposed) {
        console.error(restoreError);
        setError(t.errorRestoreStep);
      }
    } finally {
      if (!engine.disposed) {
        engine.busy = false;
        configureEngine(engine, settingsRef.current);
        setBusy(false);
      }
    }
  }

  function deleteSelected() {
    const engine = engineRef.current;
    if (!engine || engine.busy) return;

    const selected = engine.canvas
      .getActiveObjects()
      .filter((object) => object.__role !== "background");

    if (!selected.length) return;

    engine.suspended = true;
    engine.canvas.discardActiveObject();

    selected.forEach((object) => engine.canvas.remove(object));

    engine.suspended = false;
    engine.canvas.requestRenderAll();
    setSelectionCount(0);
    saveHistory(engine);
  }

  function clearAll() {
    const engine = engineRef.current;
    if (!engine || engine.busy) return;

    const objects = engine.canvas
      .getObjects()
      .filter(
        (object) =>
          object.__role !== "background" &&
          object.__role !== "preview"
      );

    if (
      objects.length &&
      !window.confirm(t.confirmClearAll)
    ) {
      return;
    }

    cancelPath(engine);

    if (!objects.length) return;

    engine.suspended = true;
    engine.canvas.discardActiveObject();
    objects.forEach((object) => engine.canvas.remove(object));
    engine.suspended = false;

    setSelectionCount(0);
    engine.canvas.requestRenderAll();
    saveHistory(engine);
  }

  function changeTool(nextTool) {
    const engine = engineRef.current;

    if (nextTool === tool || disabled) return;

    if (
      engine?.points.length &&
      !window.confirm(t.confirmChangeTool)
    ) {
      return;
    }

    cancelPath(engine);
    setTool(nextTool);
  }

  function requestClose() {
    const engine = engineRef.current;

    if (
      (engine?.historyIndex > 0 || engine?.points.length) &&
      !window.confirm(t.confirmCloseEditor)
    ) {
      return;
    }

    onCancel?.();
  }

  async function exportDocument(format) {
    const engine = engineRef.current;
    if (!engine || engine.busy || !ready) return;

    if (engine.points.length === 1) {
      setError(t.errorNeedSecondPoint);
      return;
    }

    // Un trait valide en cours est finalisé avant l'export.
    if (engine.points.length >= 2) finishPath();

    const json = engine.canvas.toObject(["__role"]);

    json.objects = (json.objects || []).filter((object) => {
      if (object.__role === "preview") return false;
      return includeReference || object.__role !== "background";
    });

    engine.busy = true;
    setBusy(true);
    setError("");
    configureEngine(engine, settingsRef.current);

    let output = null;

    try {
      // Export séparé : aucune modification du canvas affiché.
      output = new engine.mod.StaticCanvas(
        document.createElement("canvas"),
        {
          width: DOCUMENT_SIZE,
          height: DOCUMENT_SIZE,
          enableRetinaScaling: false,
        }
      );

      await output.loadFromJSON(json);
      if (engine.disposed) return;

      output.setDimensions({
        width: DOCUMENT_SIZE,
        height: DOCUMENT_SIZE,
      });
      output.setViewportTransform([1, 0, 0, 1, 0, 0]);
      output.renderAll();

      if (format === "svg") {
        // Export maison : chaque trait ecrit son transform directement sur
        // le <path>, matrice identite, valeurs separees par des espaces --
        // format attendu par le parseur svg_parse.py de LayerInbetween
        // (qui ignore tout transform pose sur un <g> parent).
        const traceObjects = engine.canvas
          .getObjects()
          .filter((o) => o.__role === "trace" && o.__dString);

        const pathElements = traceObjects
          .map((o) => {
            const sw = o.__strokeWidth || 2;
            return `<path transform="matrix(1 0 0 1 0 0)" style="stroke:#000000; stroke-width:${sw}; fill:none;" d="${o.__dString}" />`;
          })
          .join("\n");

        const svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${DOCUMENT_SIZE}" height="${DOCUMENT_SIZE}" viewBox="0 0 ${DOCUMENT_SIZE} ${DOCUMENT_SIZE}">
${pathElements}
</svg>
`;

        const blob = new Blob([svg], {
          type: "image/svg+xml;charset=utf-8",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "trace.svg";
        document.body.appendChild(link);
        link.click();
        link.remove();

        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const dataUrl = output.toDataURL({
          format: "png",
          multiplier: 1,
        });

        const response = await fetch(dataUrl);
        const blob = await response.blob();

        if (!engine.disposed) {
          await onSave(blob);
        }
      }
    } catch (exportError) {
      if (!engine.disposed) {
        console.error(exportError);
        setError(t.errorExportFailed);
      }
    } finally {
      if (output) {
        await Promise.resolve(output.dispose()).catch(console.error);
      }

      if (!engine.disposed) {
        engine.busy = false;
        configureEngine(engine, settingsRef.current);
        setBusy(false);
      }
    }
  }

  actionsRef.current = {
    finishPath,
    cancelPath: () => cancelPath(),
    removeLastPoint,
    undo: () => restoreHistory(-1),
    redo: () => restoreHistory(1),
    deleteSelected,
    disabled,
    tool,
  };

  // Raccourcis limités à l'éditeur.
  useEffect(() => {
    const root = rootRef.current;
    const previousFocus = document.activeElement;

    root?.focus();

    const handleKeyDown = (event) => {
      const actions = actionsRef.current;

      // Conserve le focus dans cette fenêtre modale.
      if (event.key === "Tab") {
        const focusable = [...root.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"]'
        )].filter((element) => element.getClientRects().length);

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (!first) {
          event.preventDefault();
          return;
        }

        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === root)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === root)
        ) {
          event.preventDefault();
          first.focus();
        }

        return;
      }

      if (actions.disabled) return;

      const target = event.target;
      if (
        target?.matches?.("input, textarea, select") ||
        target?.isContentEditable
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;

      if (modifier && key === "z") {
        event.preventDefault();
        event.shiftKey ? actions.redo() : actions.undo();
      } else if (modifier && key === "y") {
        event.preventDefault();
        actions.redo();
      } else if (
        event.key === "Enter" &&
        actions.tool === "path" &&
        !target?.closest?.("button")
      ) {
        event.preventDefault();
        actions.finishPath();
      } else if (event.key === "Escape") {
        actions.cancelPath();
      } else if (
        event.key === "Backspace" &&
        actions.tool === "path"
      ) {
        event.preventDefault();
        actions.removeLastPoint();
      } else if (
        event.key === "Delete" ||
        event.key === "Backspace"
      ) {
        event.preventDefault();
        actions.deleteSelected();
      }
    };

    root?.addEventListener("keydown", handleKeyDown);

    return () => {
      root?.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, []);

  const smallButton =
    "rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs " +
    "transition hover:border-black disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={t.editTitle}
      tabIndex={-1}
      className="drawing-editor fixed inset-0 z-50 flex flex-col overflow-hidden bg-white text-black outline-none"
      style={{ height: "100dvh" }}
    >
      {/* Barre principale */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-black px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg italic">
            {t.editTitle}
          </h2>
          <p className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">
            {t.editorSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            className={smallButton}
          >
            {t.close}
          </button>

          <button
            type="button"
            onClick={() => exportDocument("svg")}
            disabled={disabled}
            className={smallButton}
          >
            {t.exportSvg}
          </button>

          <button
            type="button"
            onClick={() => exportDocument("png")}
            disabled={disabled}
            className="rounded-md bg-black px-3 py-2 font-mono text-xs text-white disabled:opacity-30"
          >
            {busy ? t.busyWait : t.save}
          </button>

          <button
            type="button"
            onClick={() => setRightPanelOpen((value) => !value)}
            aria-label={
              rightPanelOpen ? t.hidePanel : t.showPanel
            }
            aria-expanded={rightPanelOpen}
            aria-controls="drawing-settings-panel"
            title={t.togglePanel}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 hover:border-black"
          >
            <Icon name="panel" />
          </button>
        </div>
      </header>

      {/* Options contextuelles : restent accessibles sans le panneau */}
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-2">
        <span className="font-mono text-xs">
          {toolNames[tool]}
        </span>

        {tool === "path" && (
          <>
            <span className="font-mono text-xs text-neutral-500">
              {pathPointCount} {t.pointLabel}{pathPointCount > 1 ? "s" : ""}
            </span>

            <button
              type="button"
              onClick={finishPath}
              disabled={disabled || pathPointCount < 2}
              className="rounded bg-black px-3 py-1.5 font-mono text-xs text-white disabled:opacity-30"
            >
              {t.finishPath}
            </button>

            <button
              type="button"
              onClick={removeLastPoint}
              disabled={disabled || !pathPointCount}
              className={smallButton}
            >
              {t.removePoint}
            </button>

            <button
              type="button"
              onClick={() => cancelPath()}
              disabled={disabled || !pathPointCount}
              className={smallButton}
            >
              {t.abandonPath}
            </button>
          </>
        )}

      </div>

      {error && (
        <div
          role="alert"
          className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Espace de travail */}
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* Outils à gauche */}
        <nav
          aria-label={t.toolsNavLabel}
          className="flex w-16 shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-neutral-200 bg-white py-3"
        >
          {[
            ["select", "select", t.toolSelectLabel],
            ["path", "path", t.toolPathLabel],
          ].map(([value, icon, label]) => (
            <ToolButton
              key={value}
              name={icon}
              label={label}
              active={tool === value}
              disabled={disabled}
              onClick={() => changeTool(value)}
            />
          ))}

          <div className="my-1 w-8 border-t border-neutral-200" />

          <ToolButton
            name="undo"
            label={t.undoShortcut}
            disabled={disabled || !canUndo}
            onClick={() => restoreHistory(-1)}
          />
          <ToolButton
            name="redo"
            label={t.redoShortcut}
            disabled={disabled || !canRedo}
            onClick={() => restoreHistory(1)}
          />
          <ToolButton
            name="trash"
            label={t.deleteSelectionLabel}
            disabled={disabled || !selectionCount}
            onClick={deleteSelected}
          />
          <ToolButton
            name="clear"
            label={t.clearAllLabel}
            disabled={disabled || (!objectCount && !pathPointCount)}
            onClick={clearAll}
          />
        </nav>

        {/* Document centré horizontalement, positionné en haut */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-neutral-100">
          <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-3">
            <span className="truncate font-mono text-[11px] text-neutral-600">
              {t.documentLabel} · {DOCUMENT_SIZE} × {DOCUMENT_SIZE} px
            </span>
            <span className="shrink-0 font-mono text-[11px] text-neutral-500">
              {zoomPercent} %
            </span>
          </div>

          <div className="relative min-h-0 flex-1 p-3 sm:p-4">
            <div
              ref={workspaceRef}
              className="relative h-full w-full"
            >
              <div
                ref={canvasHostRef}
                className="drawing-canvas-host absolute left-1/2 top-0 -translate-x-1/2 bg-white"
                style={{
                  boxShadow:
                    "0 0 0 1px #d4d4d4, 0 6px 24px rgba(0,0,0,0.08)",
                }}
              />

              {(!ready || busy) && (
                <div
                  role="status"
                  className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-100/70 px-4 text-center font-mono text-xs"
                >
                  {busy
                    ? t.statusProcessing
                    : error
                      ? t.statusUnavailable
                      : t.statusLoadingDoc}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Panneau droit : dock sur ordinateur, superposition sur mobile */}
        {rightPanelOpen && (
          <aside
            id="drawing-settings-panel"
            aria-label={t.settingsPanelLabel}
            className="drawing-settings-panel flex shrink-0 flex-col overflow-y-auto border-l border-neutral-200 bg-white"
          >
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <h3 className="font-mono text-xs uppercase tracking-wider">
                {t.propertiesTitle}
              </h3>
              <button
                type="button"
                onClick={() => setRightPanelOpen(false)}
                aria-label={t.hideProperties}
                className="flex h-8 w-8 items-center justify-center rounded hover:bg-neutral-100"
              >
                <Icon name="clear" size={15} />
              </button>
            </div>

            <div className="space-y-5 p-4">
              <section>
                <h4 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
                  {t.activeToolTitle}
                </h4>

                <div className="rounded-lg border border-neutral-200 p-3">
                  <p className="mb-3 text-sm font-medium">
                    {toolNames[tool]}
                  </p>

                  {tool === "path" && (
                    <>
                      <label className="block font-mono text-xs">
                        {t.strokeWidthLabel} : {pathStrokeWidth} px
                        <input
                          type="range"
                          min="1"
                          max="10"
                          value={pathStrokeWidth}
                          disabled={disabled}
                          onChange={(event) =>
                            setPathStrokeWidth(Number(event.target.value))
                          }
                          className="mt-3 block w-full accent-black"
                        />
                      </label>

                      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                        {t.pathHelperText}
                      </p>
                    </>
                  )}

                  {tool === "select" && (
                    <p className="text-xs leading-relaxed text-neutral-500">
                      {t.selectHelperText}
                    </p>
                  )}
                </div>
              </section>

              <section>
                <h4 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
                  <Icon name="layers" size={14} />
                  {t.contentTitle}
                </h4>

                <div className="flex flex-col gap-2">
                  <div className="rounded-lg border border-neutral-200 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDrawVisible((value) => !value)}
                        disabled={disabled}
                        aria-label={drawVisible ? t.hideDrawing : t.showDrawing}
                        aria-pressed={drawVisible}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-neutral-100 disabled:opacity-30"
                      >
                        <Icon name={drawVisible ? "eye" : "hidden"} />
                      </button>

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-neutral-300 bg-white">
                        <Icon name="path" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{t.drawingLabel}</p>
                        <p className="font-mono text-[10px] text-neutral-500">
                          {objectCount} {t.objectLabel}{objectCount > 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                  </div>

                  {backgroundImageUrl && (
                    <div className="rounded-lg border border-neutral-200 px-3 py-3">
                      <div className="mb-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setBgVisible((value) => !value)}
                          disabled={disabled}
                          aria-label={
                            bgVisible
                              ? t.hideReference
                              : t.showReference
                          }
                          aria-pressed={bgVisible}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-neutral-100 disabled:opacity-30"
                        >
                          <Icon name={bgVisible ? "eye" : "hidden"} />
                        </button>

                        <img
                          src={backgroundImageUrl}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded border border-neutral-200 object-contain"
                        />

                        <span className="min-w-0 flex-1 text-xs">
                          {t.referenceLabel}
                        </span>

                        <span title={t.referenceLockedTitle}>
                          <Icon name="lock" size={14} />
                        </span>
                      </div>

                      <label className="block font-mono text-[11px]">
                        {t.opacity} : {Math.round(bgOpacity * 100)} %
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={bgOpacity}
                          disabled={disabled}
                          onChange={(event) =>
                            setBgOpacity(Number(event.target.value))
                          }
                          className="mt-2 block w-full accent-black"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h4 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
                  {t.exportTitle}
                </h4>

                {backgroundImageUrl && (
                  <label className="flex items-start gap-2 text-xs leading-relaxed">
                    <input
                      type="checkbox"
                      checked={includeReference}
                      disabled={disabled}
                      onChange={(event) =>
                        setIncludeReference(event.target.checked)
                      }
                      className="mt-0.5 accent-black"
                    />
                    {t.includeReferenceLabel}
                  </label>
                )}

                <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                  PNG : {DOCUMENT_SIZE} × {DOCUMENT_SIZE} px.
                  <br />
                  {t.exportSvgInfo}
                </p>
              </section>
            </div>
          </aside>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-neutral-200 bg-white px-3 py-2 font-mono text-[10px] text-neutral-500">
        <span className="truncate">
          {tool === "path"
            ? t.footerPathHint
            : t.footerSelectHint}
        </span>
        <span className="shrink-0">
          {busy ? t.statusProcessingShort : ready ? t.statusReady : t.statusLoading}
        </span>
      </footer>

      <style jsx global>{`
        .drawing-editor .drawing-settings-panel {
          width: 248px;
        }

        .drawing-editor .drawing-canvas-host .canvas-container {
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          box-sizing: content-box !important;
        }

        .drawing-editor .drawing-canvas-host canvas {
          display: block !important;
          max-width: none !important;
          max-height: none !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-sizing: content-box !important;
          touch-action: none;
        }

        .drawing-editor button:focus-visible,
        .drawing-editor input:focus-visible {
          outline: 2px solid #111;
          outline-offset: 3px;
        }

        @media (max-width: 767px) {
          .drawing-editor .drawing-settings-panel {
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            z-index: 20;
            width: min(248px, calc(100% - 64px));
            box-shadow: -8px 0 24px rgba(0, 0, 0, 0.08);
          }
        }
      `}</style>
    </div>
  );
}
