"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

import type {
  Canvas,
  FabricObject,
  Path,
} from "fabric";

import {
  IDENTITY,
  commandsToString,
  ellipseCommands,
  getRenderPaths,
  invertMatrix,
  lineCommands,
  multiplyMatrices,
  pointsToCommands,
  rectangleCommands,
  transformCommands,
  transformPoint,
  type DrawingStyle,
  type EditorTool,
  type Id,
  type Matrix,
  type PathCommand,
  type Point,
  type Pose,
  type RenderPath,
  type Sheet,
} from "./studio-core";

type FabricModule = typeof import("fabric");

export interface WorkspaceHandle {
  fit(): void;
  actualSize(): void;
  zoomBy(factor: number): void;
  finishPath(): void;
  cancelGesture(): void;
}

interface Props {
  sheet: Sheet;
  pose: Pose;
  tool: EditorTool;
  style: DrawingStyle;
  selectedIds: readonly Id[];
  onionPose: Pose | null;
  onionOpacity: number;
  onionColor: string;
  grid: boolean;
  onSelect(ids: Id[]): void;
  onCreate(commands: readonly PathCommand[]): void;
  onTransforms(transforms: ReadonlyMap<Id, Matrix>): void;
  onGeometry(id: Id, commands: readonly PathCommand[]): void;
  onZoom(value: number): void;
  onError(message: string): void;
}

interface Entry {
  object: Path;
  source: RenderPath;
  signature: string;
  baseline: Matrix;
}

interface HandlePoint {
  command: number;
  index: number;
  x: number;
  y: number;
  anchor: boolean;
}

type Gesture =
  | { kind: "pan"; x: number; y: number }
  | { kind: "draw"; start: Point; points: Point[] }
  | {
      kind: "node";
      id: Id;
      handle: HandlePoint;
      commands: readonly PathCommand[];
      inverse: Matrix;
    };

interface Engine {
  mod: FabricModule;
  canvas: Canvas;
  overlay: HTMLCanvasElement;
  entries: Map<Id, Entry>;
  ghosts: FabricObject[];
  paper: FabricObject | null;
  preview: Path | null;
  pen: Point[];
  draft: readonly PathCommand[] | null;
  gesture: Gesture | null;
  space: boolean;
  reconciling: boolean;
  disposed: boolean;
  drawOverlay(): void;
  reconcile(): void;
  refreshInteraction(): void;
  fit(): void;
  finish(): void;
  cancel(): void;
}

function matrix(value: readonly number[]): Matrix {
  return [...value] as unknown as Matrix;
}

function handles(commands: readonly PathCommand[]): HandlePoint[] {
  const result: HandlePoint[] = [];

  commands.forEach((command, commandIndex) => {
    if (command[0] === "M") {
      result.push({
        command: commandIndex,
        index: 1,
        x: command[1],
        y: command[2],
        anchor: true,
      });
    } else if (command[0] === "C") {
      for (const index of [1, 3, 5]) {
        result.push({
          command: commandIndex,
          index,
          x: command[index] as number,
          y: command[index + 1] as number,
          anchor: index === 5,
        });
      }
    }
  });

  return result;
}

function moveHandle(
  commands: readonly PathCommand[],
  handle: HandlePoint,
  point: Point,
): readonly PathCommand[] {
  const output = commands.map((command) => [...command]);
  const command = output[handle.command];
  const oldX = command[handle.index] as number;
  const oldY = command[handle.index + 1] as number;
  const dx = point.x - oldX;
  const dy = point.y - oldY;

  command[handle.index] = point.x;
  command[handle.index + 1] = point.y;

  // Une ancre déplace aussi ses poignées adjacentes.
  if (handle.anchor) {
    if (command[0] === "C") {
      command[3] = (command[3] as number) + dx;
      command[4] = (command[4] as number) + dy;
    }

    const next = output[handle.command + 1];

    if (next?.[0] === "C") {
      next[1] = (next[1] as number) + dx;
      next[2] = (next[2] as number) + dy;
    }
  }

  return output as unknown as readonly PathCommand[];
}

export const FabricWorkspace = forwardRef<WorkspaceHandle, Props>(
  function FabricWorkspace(props, forwardedRef) {
    const hostRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<Engine | null>(null);
    const propsRef = useRef(props);
    propsRef.current = props;

    useImperativeHandle(forwardedRef, () => ({
      fit: () => engineRef.current?.fit(),

      actualSize: () => {
        const engine = engineRef.current;
        if (!engine) return;

        const { sheet } = propsRef.current;

        engine.canvas.setViewportTransform([
          1, 0, 0, 1,
          (engine.canvas.width - sheet.width) / 2,
          (engine.canvas.height - sheet.height) / 2,
        ]);

        propsRef.current.onZoom(1);
        engine.canvas.requestRenderAll();
      },

      zoomBy: (factor) => {
        const engine = engineRef.current;
        if (!engine) return;

        const zoom = Math.min(64, Math.max(0.01, engine.canvas.getZoom() * factor));

        engine.canvas.zoomToPoint(
          new engine.mod.Point(engine.canvas.width / 2, engine.canvas.height / 2),
          zoom,
        );

        propsRef.current.onZoom(zoom);
        engine.canvas.requestRenderAll();
      },

      finishPath: () => engineRef.current?.finish(),
      cancelGesture: () => engineRef.current?.cancel(),
    }), []);

useEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      let cancelled = false;
      let observer: ResizeObserver | undefined;
      let cleanup = () => {};

      async function initialize() {
        const mod = await import("fabric");
        if (cancelled || !host) return;

        const element = document.createElement("canvas");
        const overlay = document.createElement("canvas");

        host.appendChild(element);

        const canvas = new mod.Canvas(element, {
          preserveObjectStacking: true,
          enableRetinaScaling: true,
          enablePointerEvents: true,
          selection: true,
          backgroundColor: "#e5e7eb",
        });

overlay.className = "absolute inset-0 pointer-events-none";
        host.appendChild(overlay);
        canvas.upperCanvasEl.style.touchAction = "none";

        const engine: Engine = {
          mod,
          canvas,
          overlay,
          entries: new Map(),
          ghosts: [],
          paper: null,
          preview: null,
          pen: [],
          draft: null,
          gesture: null,
          space: false,
          reconciling: false,
          disposed: false,
          drawOverlay: () => {},
          reconcile: () => {},
          refreshInteraction: () => {},
          fit: () => {},
          finish: () => {},
          cancel: () => {},
        };

        engineRef.current = engine;

        function removePreview() {
          if (engine.preview) canvas.remove(engine.preview);
          engine.preview = null;
        }

function preview(commands: readonly PathCommand[]) {
          removePreview();
          if (commands.length === 0) return;

          const settings = propsRef.current.style;

          engine.preview = new mod.Path(commandsToString(commands), {
            fill: settings.fill ?? "",
            stroke: settings.stroke ?? "",
            strokeWidth: settings.strokeWidth,
            opacity: settings.opacity,
            strokeUniform: true,
            selectable: false,
            evented: false,
            objectCaching: false,
          });

          canvas.add(engine.preview);
          canvas.requestRenderAll();
        }

function activeEntry(): Entry | undefined {
          const ids = propsRef.current.selectedIds;
          return ids.length === 1 ? engine.entries.get(ids[0]) : undefined;
        }

        engine.drawOverlay = () => {
          const context = overlay.getContext("2d");
          if (!context) return;

          const ratio = window.devicePixelRatio || 1;
          context.setTransform(ratio, 0, 0, ratio, 0, 0);
          context.clearRect(0, 0, canvas.width, canvas.height);

          const current = propsRef.current;
          const viewport = matrix(canvas.viewportTransform);
          const zoom = canvas.getZoom();

          if (current.grid) {
            // Grille adaptative limitée au papier.
            const step = 25 * Math.pow(2, Math.ceil(Math.log2(12 / (25 * zoom))));
            const origin = transformPoint(viewport, 0, 0);
            const end = transformPoint(viewport, current.sheet.width, current.sheet.height);

            context.save();
            context.beginPath();
            context.rect(origin.x, origin.y, end.x - origin.x, end.y - origin.y);
            context.clip();
            context.strokeStyle = "rgba(100,116,139,0.2)";
            context.lineWidth = 1;
            context.beginPath();

            const minX = Math.max(0, -viewport[4] / zoom);
            const maxX = Math.min(current.sheet.width, (canvas.width - viewport[4]) / zoom);
            const minY = Math.max(0, -viewport[5] / zoom);
            const maxY = Math.min(current.sheet.height, (canvas.height - viewport[5]) / zoom);

            for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
              const screen = transformPoint(viewport, x, 0);
              context.moveTo(screen.x, origin.y);
              context.lineTo(screen.x, end.y);
            }

            for (let y = Math.ceil(minY / step) * step; y <= maxY; y += step) {
              const screen = transformPoint(viewport, 0, y);
              context.moveTo(origin.x, screen.y);
              context.lineTo(end.x, screen.y);
            }

            context.stroke();
            context.restore();
          }

if (current.tool !== "nodes") return;

          const entry = activeEntry();
          if (!entry || entry.source.locked) return;

          const commands = transformCommands(
            engine.draft ?? entry.source.node.commands,
            entry.source.world,
          );

          let previous: Point | null = null;

          context.strokeStyle = "#818cf8";
          context.lineWidth = 1;

          for (const command of commands) {
            if (command[0] === "M") {
              previous = { x: command[1], y: command[2] };
            } else if (command[0] === "C") {
              const first = transformPoint(viewport, command[1], command[2]);
              const second = transformPoint(viewport, command[3], command[4]);
              const end = transformPoint(viewport, command[5], command[6]);

              context.beginPath();

              if (previous) {
                const start = transformPoint(viewport, previous.x, previous.y);
                context.moveTo(start.x, start.y);
                context.lineTo(first.x, first.y);
              }

              context.moveTo(second.x, second.y);
              context.lineTo(end.x, end.y);
              context.stroke();

              previous = { x: command[5], y: command[6] };
            }
          }

for (const handle of handles(commands)) {
            const point = transformPoint(viewport, handle.x, handle.y);

            context.fillStyle = handle.anchor ? "#ffffff" : "#6366f1";
            context.strokeStyle = "#4338ca";
            context.beginPath();

            if (handle.anchor) {
              context.rect(point.x - 4, point.y - 4, 8, 8);
            } else {
              context.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
            }

            context.fill();
            context.stroke();
          }
        };

        engine.refreshInteraction = () => {
          const current = propsRef.current;
          const selecting = current.tool === "select" && !engine.space;

          canvas.selection = selecting;
          canvas.skipTargetFind = !selecting;
          canvas.defaultCursor =
            engine.space || current.tool === "pan"
              ? "grab"
              : selecting
                ? "default"
                : "crosshair";

          for (const entry of engine.entries.values()) {
            entry.object.set({
              selectable: selecting && !entry.source.locked,
              evented: selecting && !entry.source.locked,
            });
          }

          canvas.requestRenderAll();
        };

        engine.reconcile = () => {
          if (engine.disposed) return;
          engine.reconciling = true;

          try {
            const current = propsRef.current;
            const desired = getRenderPaths(current.pose);
            const ids = new Set(desired.map((item) => item.node.id));

            canvas.discardActiveObject();

            if (engine.paper) canvas.remove(engine.paper);
            engine.paper = new mod.Rect({
              left: 0,
              top: 0,
              originX: "left",
              originY: "top",
              width: current.sheet.width,
              height: current.sheet.height,
              fill: current.sheet.background ?? "#ffffff",
              stroke: "#94a3b8",
              strokeWidth: 1,
              strokeUniform: true,
              selectable: false,
              evented: false,
              excludeFromExport: true,
            });

canvas.add(engine.paper);
            canvas.moveObjectTo(engine.paper, 0);

            for (const ghost of engine.ghosts) canvas.remove(ghost);
            engine.ghosts = [];

            if (current.onionPose) {
              for (const source of getRenderPaths(current.onionPose)) {
                if (!source.visible) continue;

                const ghost = new mod.Path(
                  commandsToString(transformCommands(source.node.commands, source.world)),
                  {
                    fill: source.node.fill ? current.onionColor : "",
                    stroke: source.node.stroke ? current.onionColor : "",
                    strokeWidth: source.node.strokeWidth,
                    opacity: current.onionOpacity * source.opacity,
                    selectable: false,
                    evented: false,
                    strokeUniform: true,
                  },
                );

                canvas.add(ghost);
                engine.ghosts.push(ghost);
              }
            }

            for (const [id, entry] of engine.entries) {
              if (!ids.has(id)) {
                canvas.remove(entry.object);
                engine.entries.delete(id);
              }
            }

            let order = 1;

            for (const ghost of engine.ghosts) {
              canvas.moveObjectTo(ghost, order++);
            }

for (const source of desired) {
              const { node } = source;

              // Le renderer ne sérialise pas le document pour l’historique.
              // Cette signature concerne uniquement la réconciliation visuelle.
              const signature = JSON.stringify([
                node.commands,
                source.world,
                source.visible,
                source.locked,
                source.opacity,
                node.fill,
                node.stroke,
                node.strokeWidth,
                node.lineCap,
                node.lineJoin,
              ]);

              let entry = engine.entries.get(node.id);

              if (!entry || entry.signature !== signature) {
                if (entry) canvas.remove(entry.object);

                const object = new mod.Path(
                  commandsToString(transformCommands(node.commands, source.world)),
                  {
                    fill: node.fill ?? "",
                    stroke: node.stroke ?? "",
                    strokeWidth: node.strokeWidth,
                    strokeLineCap: node.lineCap,
                    strokeLineJoin: node.lineJoin,
                    opacity: source.opacity,
                    visible: source.visible,
                    strokeUniform: true,
                    minScaleLimit: 0.001,
                  },
                );

                canvas.add(object);

                entry = {
                  object,
                  source,
                  signature,
                  baseline: matrix(object.calcTransformMatrix()),
                };

engine.entries.set(node.id, entry);
              } else {
                entry.source = source;
              }

              canvas.moveObjectTo(entry.object, order++);
            }

            if (current.tool === "select") {
              const selected = current.selectedIds
                .map((id) => engine.entries.get(id))
                .filter((entry): entry is Entry =>
                  Boolean(entry && entry.source.visible && !entry.source.locked),
                )
                .map((entry) => entry.object);

              if (selected.length === 1) {
                canvas.setActiveObject(selected[0]);
              } else if (selected.length > 1) {
                canvas.setActiveObject(new mod.ActiveSelection(selected, { canvas }));
              }
            }

            engine.refreshInteraction();
          } finally {
            engine.reconciling = false;
          }
        };

        engine.fit = () => {
          const { sheet } = propsRef.current;
          const zoom = Math.max(
            0.01,
            Math.min(
              Math.max(1, canvas.width - 80) / sheet.width,
              Math.max(1, canvas.height - 80) / sheet.height,
            ),
          );

          canvas.setViewportTransform([
            zoom, 0, 0, zoom,
            (canvas.width - sheet.width * zoom) / 2,
            (canvas.height - sheet.height * zoom) / 2,
          ]);

          propsRef.current.onZoom(zoom);
          canvas.requestRenderAll();
        };

engine.finish = () => {
          if (engine.pen.length >= 2) {
            const output: PathCommand[] = [
              ["M", engine.pen[0].x, engine.pen[0].y],
            ];

            for (let index = 1; index < engine.pen.length; index += 1) {
              output.push(lineCommands(engine.pen[index - 1], engine.pen[index])[1]);
            }

            propsRef.current.onCreate(output);
          }

          engine.pen = [];
          removePreview();
          canvas.requestRenderAll();
        };

        engine.cancel = () => {
          engine.gesture = null;
          engine.pen = [];
          engine.draft = null;
          removePreview();
          engine.reconcile();
        };

        function selectedChanged() {
          if (engine.reconciling) return;

          const active = new Set(canvas.getActiveObjects());

          propsRef.current.onSelect(
            [...engine.entries]
              .filter(([, entry]) => active.has(entry.object))
              .map(([id]) => id),
          );
        }

canvas.on("selection:created", selectedChanged);
        canvas.on("selection:updated", selectedChanged);
        canvas.on("selection:cleared", selectedChanged);
        canvas.on("after:render", engine.drawOverlay);

        canvas.on("object:modified", () => {
          const transforms = new Map<Id, Matrix>();

          try {
            for (const [id, entry] of engine.entries) {
              if (!canvas.getActiveObjects().includes(entry.object)) continue;

              const delta = multiplyMatrices(
                matrix(entry.object.calcTransformMatrix()),
                invertMatrix(entry.baseline),
              );

              const local = multiplyMatrices(
                invertMatrix(entry.source.parentWorld),
                multiplyMatrices(
                  delta,
                  multiplyMatrices(entry.source.parentWorld, entry.source.node.transform),
                ),
              );

              transforms.set(id, local);
            }

            if (transforms.size) propsRef.current.onTransforms(transforms);
          } catch (error) {
            propsRef.current.onError(String(error));
            engine.reconcile();
          }
        });

        canvas.on("mouse:wheel", ({ e }) => {
          e.preventDefault();
          e.stopPropagation();

          const zoom = Math.min(
            64,
            Math.max(0.01, canvas.getZoom() * Math.exp(-e.deltaY * 0.0015)),
          );

          const point = canvas.getViewportPoint(e);
          canvas.zoomToPoint(new mod.Point(point.x, point.y), zoom);
          propsRef.current.onZoom(zoom);
          canvas.requestRenderAll();
        });

canvas.on("mouse:down", ({ e }) => {
          const pointer = e as PointerEvent;

          if (typeof pointer.button === "number" && pointer.button !== 0) return;

          const current = propsRef.current;
          const scene = canvas.getScenePoint(e);
          const point = { x: scene.x, y: scene.y };

          if (engine.space || current.tool === "pan") {
            engine.gesture = {
              kind: "pan",
              x: pointer.clientX,
              y: pointer.clientY,
            };
            return;
          }

          if (current.tool === "nodes") {
            const entry = activeEntry();
            if (!entry || entry.source.locked) return;

            const world = transformCommands(entry.source.node.commands, entry.source.world);

            const hit = handles(world).reverse().find(
              (handle) =>
                Math.hypot(handle.x - point.x, handle.y - point.y) * canvas.getZoom() < 10,
            );

            if (!hit) return;

            engine.gesture = {
              kind: "node",
              id: entry.source.node.id,
              handle: hit,
              commands: entry.source.node.commands,
              inverse: invertMatrix(entry.source.world),
            };

            return;
          }
if (current.tool === "pen") {
            engine.pen.push(point);

            if (engine.pen.length >= 2) {
              const output: PathCommand[] = [["M", engine.pen[0].x, engine.pen[0].y]];

              for (let index = 1; index < engine.pen.length; index += 1) {
                output.push(lineCommands(engine.pen[index - 1], engine.pen[index])[1]);
              }

              preview(output);
            }
            return;
          }

          if (["brush", "line", "rectangle", "ellipse"].includes(current.tool)) {
            engine.gesture = { kind: "draw", start: point, points: [point] };
          }
        });

canvas.on("mouse:move", ({ e }) => {
          const gesture = engine.gesture;
          if (!gesture) return;

          const pointer = e as PointerEvent;

          if (gesture.kind === "pan") {
            const viewport = [...canvas.viewportTransform] as [
              number, number, number, number, number, number,
            ];

            viewport[4] += pointer.clientX - gesture.x;
            viewport[5] += pointer.clientY - gesture.y;
            gesture.x = pointer.clientX;
            gesture.y = pointer.clientY;

            canvas.setViewportTransform(viewport);
            canvas.requestRenderAll();
            return;
          }

          const scene = canvas.getScenePoint(e);
          let point: Point = { x: scene.x, y: scene.y };

          if (gesture.kind === "node") {
            const local = transformPoint(gesture.inverse, point.x, point.y);
            engine.draft = moveHandle(gesture.commands, gesture.handle, local);

            const entry = engine.entries.get(gesture.id);
            if (!entry) return;

            entry.object.set({ visible: false });
            preview(transformCommands(engine.draft, entry.source.world));
            engine.drawOverlay();
            return;
          }

const current = propsRef.current;

          if (pointer.shiftKey && current.tool !== "brush") {
            const dx = point.x - gesture.start.x;
            const dy = point.y - gesture.start.y;

            if (current.tool === "line") {
              const length = Math.hypot(dx, dy);
              const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);

              point = {
                x: gesture.start.x + Math.cos(angle) * length,
                y: gesture.start.y + Math.sin(angle) * length,
              };
            } else {
              const side = Math.max(Math.abs(dx), Math.abs(dy));

              point = {
                x: gesture.start.x + (Math.sign(dx) || 1) * side,
                y: gesture.start.y + (Math.sign(dy) || 1) * side,
              };
            }
          }

          if (current.tool === "brush") {
            const last = gesture.points[gesture.points.length - 1];

            if (Math.hypot(point.x - last.x, point.y - last.y) * canvas.getZoom() < 2) return;

            gesture.points.push(point);
            engine.draft = pointsToCommands(gesture.points);
          } else if (current.tool === "line") {
            engine.draft = lineCommands(gesture.start, point);
          } else if (current.tool === "rectangle") {
            engine.draft = rectangleCommands(gesture.start, point);
          } else {
            engine.draft = ellipseCommands(gesture.start, point);
          }

          preview(engine.draft);
        });

function finishGesture() {
          const gesture = engine.gesture;
          if (!gesture) return;

          engine.gesture = null;

          if (gesture.kind === "node" && engine.draft) {
            propsRef.current.onGeometry(gesture.id, engine.draft);
          } else if (gesture.kind === "draw" && engine.draft?.length) {
            propsRef.current.onCreate(engine.draft);
          }

          engine.draft = null;
          removePreview();

          if (gesture.kind === "node") engine.reconcile();
          canvas.requestRenderAll();
        }

        canvas.on("mouse:up", finishGesture);

        function onKeyDown(event: KeyboardEvent) {
          if (
            !(event.target instanceof HTMLElement) ||
            event.target.closest("input, textarea, select, [contenteditable=true]")
          ) return;

          // Les raccourcis du workspace sont actifs uniquement dans le studio.
          if (!host?.closest("[data-vector-studio]")?.contains(event.target)) return;

          if (event.code === "Space") {
            event.preventDefault();
            engine.space = true;
            engine.refreshInteraction();
          }

          if (event.key === "Enter" && propsRef.current.tool === "pen") {
            event.preventDefault();
            engine.finish();
          }

          if (event.key === "Escape") engine.cancel();
        }

        function onKeyUp(event: KeyboardEvent) {
          if (event.code !== "Space") return;
          engine.space = false;
          engine.refreshInteraction();
        }

function onBlur() {
          engine.space = false;
          engine.cancel();
        }

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
        window.addEventListener("pointerup", finishGesture);
        window.addEventListener("pointercancel", onBlur);

        let firstResize = true;

        observer = new ResizeObserver(() => {
          if (!host || engine.disposed) return;

          const bounds = host.getBoundingClientRect();
          canvas.setDimensions({
            width: Math.max(1, Math.floor(bounds.width)),
            height: Math.max(1, Math.floor(bounds.height)),
          });

          const ratio = window.devicePixelRatio || 1;
          overlay.width = Math.round(canvas.width * ratio);
          overlay.height = Math.round(canvas.height * ratio);
          overlay.style.width = `${canvas.width}px`;
          overlay.style.height = `${canvas.height}px`;

          canvas.calcOffset();

          if (firstResize) {
            firstResize = false;
            engine.fit();
          }

          canvas.requestRenderAll();
        });

        observer.observe(host);
        engine.reconcile();

        cleanup = () => {
          window.removeEventListener("keydown", onKeyDown);
          window.removeEventListener("keyup", onKeyUp);
          window.removeEventListener("blur", onBlur);
          window.removeEventListener("pointerup", finishGesture);
          window.removeEventListener("pointercancel", onBlur);
          engine.disposed = true;
          void canvas.dispose().catch(console.error);
          overlay.remove();
        };
      }

void initialize().catch((error) => {
        if (!cancelled) propsRef.current.onError(String(error));
      });

      return () => {
        cancelled = true;
        observer?.disconnect();
        cleanup();
        engineRef.current = null;
        host.replaceChildren();
      };
    }, []);

    useEffect(() => {
      engineRef.current?.reconcile();
    }, [
      props.pose,
      props.sheet.width,
      props.sheet.height,
      props.sheet.background,
      props.onionPose,
      props.onionOpacity,
      props.onionColor,
    ]);

    useEffect(() => {
      const engine = engineRef.current;
      if (!engine) return;

      engine.cancel();
      engine.refreshInteraction();
    }, [props.tool]);

    useEffect(() => {
      const engine = engineRef.current;
      if (!engine) return;

      engine.reconcile();
    }, [props.selectedIds]);

    useEffect(() => {
      engineRef.current?.drawOverlay();
    }, [props.grid]);

useEffect(() => {
      engineRef.current?.cancel();
      engineRef.current?.fit();
    }, [props.sheet.id]);

    return (
      <div
        ref={hostRef}
        className="relative h-full min-h-0 w-full overflow-hidden"
        onPointerDown={(event) => {
          event.currentTarget.closest<HTMLElement>("[data-vector-studio]")?.focus({
            preventScroll: true,
          });
        }}
      />
    );
  },
);

