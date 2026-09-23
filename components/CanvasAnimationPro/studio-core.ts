export type Id = string;
export type PoseKey = "A" | "B";
export type Unit = "px" | "mm" | "cm" | "in";

export type Matrix = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
];

export type MoveCommand = readonly ["M", number, number];

export type CubicCommand = readonly [
  "C",
  number,
  number,
  number,
  number,
  number,
  number,
];

export type CloseCommand = readonly ["Z"];

export type PathCommand =
  | MoveCommand
  | CubicCommand
  | CloseCommand;

export type Point = Readonly<{
  x: number;
  y: number;
}>;

export interface NodeBase {
  readonly id: Id;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
  readonly transform: Matrix;
}

export interface PathNode extends NodeBase {
  readonly kind: "path";
  readonly commands: readonly PathCommand[];
  readonly fill: string | null;
  readonly stroke: string | null;

  /**
   * Épaisseur en unités document.
   * Une transformation géométrique ne la modifie pas implicitement.
   */
  readonly strokeWidth: number;
  readonly lineCap: "butt" | "round" | "square";
  readonly lineJoin: "miter" | "round" | "bevel";
}

export interface GroupNode extends NodeBase {
  readonly kind: "group";
  readonly children: readonly VectorNode[];
}

export type VectorNode = PathNode | GroupNode;

export interface Layer {
  readonly id: Id;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;

  /** Ordre de peinture : arrière-plan vers premier plan. */
  readonly children: readonly VectorNode[];
}

export interface Pose {
  readonly layers: readonly Layer[];
}

export interface Sheet {
  readonly id: Id;
  readonly name: string;

  /** Dimensions internes, indépendantes des DPI. */
  readonly width: number;
  readonly height: number;

  readonly displayUnit: Unit;
  readonly dpi: number;
  readonly background: string | null;
  readonly poses: Readonly<Record<PoseKey, Pose>>;
}

export interface StudioDocument {
  readonly format: "betwixt-vector-studio";
  readonly version: 1;
  readonly id: Id;
  readonly name: string;
  readonly sheets: readonly Sheet[];
}

export interface StudioSession {
  readonly document: StudioDocument;
  readonly activeSheetId: Id;
  readonly activePose: PoseKey;
}

export interface NewSheetOptions {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly unit: Unit;
  readonly dpi: number;
  readonly background: string | null;
}

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export const DOCUMENT_PRESETS = {
  A5: { width: 148, height: 210, unit: "mm" },
  A4: { width: 210, height: 297, unit: "mm" },
  A3: { width: 297, height: 420, unit: "mm" },
  square: { width: 1024, height: 1024, unit: "px" },
  "16:9": { width: 1920, height: 1080, unit: "px" },
  "4:3": { width: 1600, height: 1200, unit: "px" },
} as const satisfies Record<
  string,
  { width: number; height: number; unit: Unit }
>;

export function createId(): Id {
  return crypto.randomUUID();
}

function requirePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} doit être un nombre positif fini.`);
  }
}

function requireOpacity(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("Opacité invalide.");
  }
}

export function toDocumentUnits(value: number, unit: Unit): number {
  requirePositive(value, "Dimension");

  switch (unit) {
    case "px":
      return value;
    case "mm":
      return (value * 96) / 25.4;
    case "cm":
      return (value * 96) / 2.54;
    case "in":
      return value * 96;
  }
}

export function fromDocumentUnits(value: number, unit: Unit): number {
  switch (unit) {
    case "px":
      return value;
    case "mm":
      return (value * 25.4) / 96;
    case "cm":
      return (value * 2.54) / 96;
    case "in":
      return value / 96;
  }
}

export function rasterDimensions(
  sheet: Pick<Sheet, "width" | "height" | "dpi">,
): { width: number; height: number } {
  requirePositive(sheet.width, "Largeur");
  requirePositive(sheet.height, "Hauteur");
  requirePositive(sheet.dpi, "DPI");

  return {
    width: Math.max(1, Math.round((sheet.width * sheet.dpi) / 96)),
    height: Math.max(1, Math.round((sheet.height * sheet.dpi) / 96)),
  };
}

export function createLayer(name = "Calque 1"): Layer {
  return {
    id: createId(),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    children: [],
  };
}

export function createSheet(options: NewSheetOptions): Sheet {
  requirePositive(options.dpi, "DPI");

  const poseA: Pose = {
    layers: [createLayer()],
  };

  return {
    id: createId(),
    name: options.name.trim() || "Feuille",
    width: toDocumentUnits(options.width, options.unit),
    height: toDocumentUnits(options.height, options.unit),
    displayUnit: options.unit,
    dpi: options.dpi,
    background: options.background,
    poses: {
      A: poseA,
      B: structuredClone(poseA),
    },
  };
}

export function createDocument(
  name: string,
  options: NewSheetOptions,
): StudioSession {
  const sheet = createSheet(options);

  return {
    document: {
      format: "betwixt-vector-studio",
      version: 1,
      id: createId(),
      name: name.trim() || "Sans titre",
      sheets: [sheet],
    },
    activeSheetId: sheet.id,
    activePose: "A",
  };
}

export function getActiveSheet(session: StudioSession): Sheet {
  const sheet = session.document.sheets.find(
    (item) => item.id === session.activeSheetId,
  );

  if (!sheet) {
    throw new Error("La feuille active est introuvable.");
  }

  return sheet;
}

export function updateSheet(
  document: StudioDocument,
  sheetId: Id,
  update: (sheet: Sheet) => Sheet,
): StudioDocument {
  const index = document.sheets.findIndex(
    (sheet) => sheet.id === sheetId,
  );

  if (index < 0) {
    throw new Error("Feuille introuvable.");
  }

  const previous = document.sheets[index];
  const next = update(previous);

  if (previous === next) return document;

  if (next.id !== previous.id) {
    throw new Error("Une modification ne peut pas changer l’identité d’une feuille.");
  }

  const sheets = [...document.sheets];
  sheets[index] = next;

  return { ...document, sheets };
}

export function updatePose(
  document: StudioDocument,
  sheetId: Id,
  poseKey: PoseKey,
  update: (pose: Pose) => Pose,
): StudioDocument {
  return updateSheet(document, sheetId, (sheet) => {
    const previous = sheet.poses[poseKey];
    const next = update(previous);

    if (previous === next) return sheet;

    return {
      ...sheet,
      poses: {
        ...sheet.poses,
        [poseKey]: next,
      },
    };
  });
}

/**
 * Les identifiants sont conservés pour établir les correspondances A/B.
 * Toutes les données imbriquées sont copiées.
 */
export function copyPose(
  document: StudioDocument,
  sheetId: Id,
  source: PoseKey,
  target: PoseKey,
): StudioDocument {
  if (source === target) return document;

  return updateSheet(document, sheetId, (sheet) => ({
    ...sheet,
    poses: {
      ...sheet.poses,
      [target]: structuredClone(sheet.poses[source]),
    },
  }));
}

export function createPath(
  commands: readonly PathCommand[],
  name = "Tracé",
): PathNode {
  assertPathCommands(commands);

  return {
    id: createId(),
    name,
    kind: "path",
    visible: true,
    locked: false,
    opacity: 1,
    transform: IDENTITY,
    commands: structuredClone(commands),
    fill: null,
    stroke: "#000000",
    strokeWidth: 2,
    lineCap: "round",
    lineJoin: "round",
  };
}

export function lineCommands(
  start: Point,
  end: Point,
): readonly PathCommand[] {
  return [
    ["M", start.x, start.y],
    [
      "C",
      start.x + (end.x - start.x) / 3,
      start.y + (end.y - start.y) / 3,
      start.x + (2 * (end.x - start.x)) / 3,
      start.y + (2 * (end.y - start.y)) / 3,
      end.x,
      end.y,
    ],
  ];
}

export function assertPathCommands(
  commands: readonly PathCommand[],
): void {
  if (commands.length === 0 || commands[0][0] !== "M") {
    throw new Error("Un chemin doit commencer par M.");
  }

  let subpathOpen = false;

  for (const command of commands) {
    const expectedLength =
      command[0] === "M" ? 3 :
      command[0] === "C" ? 7 :
      command[0] === "Z" ? 1 :
      0;

    if (expectedLength === 0 || command.length !== expectedLength) {
      throw new Error("Commande vectorielle invalide.");
    }

    for (let index = 1; index < command.length; index += 1) {
      if (!Number.isFinite(command[index])) {
        throw new Error("Coordonnée vectorielle invalide.");
      }
    }

    if (command[0] === "M") {
      subpathOpen = true;
    } else if (!subpathOpen) {
      throw new Error("Commande sans sous-chemin actif.");
    } else if (command[0] === "Z") {
      subpathOpen = false;
    }
  }
}

/** Composition : résultat = parent × enfant. */
export function multiplyMatrices(
  parent: Matrix,
  child: Matrix,
): Matrix {
  const [a, b, c, d, e, f] = parent;
  const [g, h, i, j, k, l] = child;

  return [
    a * g + c * h,
    b * g + d * h,
    a * i + c * j,
    b * i + d * j,
    a * k + c * l + e,
    b * k + d * l + f,
  ];
}

export function transformPoint(
  matrix: Matrix,
  x: number,
  y: number,
): Point {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

export function transformCommands(
  commands: readonly PathCommand[],
  matrix: Matrix,
): readonly PathCommand[] {
  return commands.map((command): PathCommand => {
    if (command[0] === "Z") return ["Z"];

    if (command[0] === "M") {
      const point = transformPoint(matrix, command[1], command[2]);
      return ["M", point.x, point.y];
    }

    const first = transformPoint(matrix, command[1], command[2]);
    const second = transformPoint(matrix, command[3], command[4]);
    const end = transformPoint(matrix, command[5], command[6]);

    return [
      "C",
      first.x,
      first.y,
      second.x,
      second.y,
      end.x,
      end.y,
    ];
  });
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Impossible d’exporter une coordonnée non finie.");
  }

  // Évite une notation exponentielle pour des coordonnées extrêmes.
  if (Math.abs(value) >= 1e21) {
    throw new Error("Coordonnée trop grande pour cet export SVG.");
  }

  const rounded = Number(value.toFixed(6));
  if (rounded === 0) return "0";

  return rounded.toFixed(6).replace(/\.?0+$/, "");
}

export function commandsToString(
  commands: readonly PathCommand[],
): string {
  assertPathCommands(commands);

  return commands.map((command) => {
    if (command[0] === "Z") return "Z";

    return [
      command[0],
      ...command.slice(1).map((value) => formatNumber(value as number)),
    ].join(" ");
  }).join(" ");
}

interface FlatPath {
  readonly node: PathNode;
  readonly worldTransform: Matrix;
  readonly visible: boolean;
  readonly effectiveOpacity: number;
}

function flattenPose(pose: Pose): readonly FlatPath[] {
  const result: FlatPath[] = [];

  function visit(
    nodes: readonly VectorNode[],
    parentTransform: Matrix,
    parentVisible: boolean,
    parentOpacity: number,
  ): void {
    for (const node of nodes) {
      requireOpacity(node.opacity);

      if (
        node.transform.length !== 6 ||
        !node.transform.every(Number.isFinite)
      ) {
        throw new Error(`Transformation invalide : ${node.name}`);
      }

      const worldTransform = multiplyMatrices(
        parentTransform,
        node.transform,
      );

      const visible = parentVisible && node.visible;
      const effectiveOpacity = parentOpacity * node.opacity;

      if (node.kind === "group") {
        visit(
          node.children,
          worldTransform,
          visible,
          effectiveOpacity,
        );
      } else {
        result.push({
          node,
          worldTransform,
          visible,
          effectiveOpacity,
        });
      }
    }
  }

for (const layer of pose.layers) {
    requireOpacity(layer.opacity);

    visit(
      layer.children,
      IDENTITY,
      layer.visible,
      layer.opacity,
    );
  }

  return result;
}

export interface CompatibilityRow {
  readonly pathId: Id;
  readonly name: string;
  readonly segmentsA: number | null;
  readonly segmentsB: number | null;
  readonly compatible: boolean;
  readonly reason: string;
}

function commandSignature(path: PathNode): string {
  return path.commands.map((command) => command[0]).join("");
}

function segmentCount(path: PathNode): number {
  return path.commands.filter((command) => command[0] === "C").length;
}

function indexPaths(pose: Pose): Map<Id, PathNode> {
  const paths = new Map<Id, PathNode>();

  for (const { node } of flattenPose(pose)) {
    if (paths.has(node.id)) {
      throw new Error(`Identifiant de chemin dupliqué : ${node.id}`);
    }

    paths.set(node.id, node);
  }

  return paths;
}

/**
* Vérification topologique, pas garantie de qualité de l’interpolation.
 * L’ordre M/C/Z est comparé, pas seulement le nombre de segments.
 */
export function validatePoseCompatibility(
  sheet: Sheet,
): readonly CompatibilityRow[] {
  const poseA = indexPaths(sheet.poses.A);
  const poseB = indexPaths(sheet.poses.B);
  const ids = new Set([...poseA.keys(), ...poseB.keys()]);

  return [...ids].map((pathId) => {
    const a = poseA.get(pathId);
    const b = poseB.get(pathId);

    const compatible =
      Boolean(a && b) &&
      commandSignature(a!) === commandSignature(b!);

    return {
      pathId,
      name: a?.name ?? b?.name ?? "Tracé",
      segmentsA: a ? segmentCount(a) : null,
      segmentsB: b ? segmentCount(b) : null,
      compatible,
      reason: !a
        ? "Absent de la pose A"
        : !b
          ? "Absent de la pose B"
          : compatible
            ? "Structure M/C/Z identique"
            : "Nombre ou ordre des commandes différent",
    };
  });
}

function orderedVisiblePaths(
  pose: Pose,
  requestedOrder?: readonly Id[],
): readonly FlatPath[] {
  const paths = flattenPose(pose).filter(
    (entry) => entry.visible && entry.effectiveOpacity > 0,
  );

  const byId = new Map<Id, FlatPath>();

  for (const entry of paths) {
    if (byId.has(entry.node.id)) {
      throw new Error(`Identifiant dupliqué : ${entry.node.id}`);
    }
    byId.set(entry.node.id, entry);
  }

  if (!requestedOrder) return paths;

  if (
    requestedOrder.length !== paths.length ||
    new Set(requestedOrder).size !== requestedOrder.length
  ) {
    throw new Error("L’ordre d’export ne correspond pas aux chemins visibles.");
  }

  return requestedOrder.map((id) => {
    const entry = byId.get(id);

    if (!entry) {
      throw new Error(`Chemin manquant dans l’export : ${id}`);
    }

    return entry;
  });
}

/**
* Export strict du profil actuellement connu de LayerInbetween.
 *
 * Aucun changement implicite :
 * - pas de conversion automatique en noir ;
 * - pas de suppression silencieuse des remplissages ;
 * - pas de référence raster ;
 * - pas de redimensionnement automatique en 512 × 512.
 *
 * Les styles non couverts par le contrat actuel sont refusés.
 * Un futur export d’illustration sera distinct de ce profil.
 */
export function exportPipelineSvg(
  sheet: Sheet,
  poseKey: PoseKey,
  requestedOrder?: readonly Id[],
): string {
  requirePositive(sheet.width, "Largeur");
  requirePositive(sheet.height, "Hauteur");

  const paths = orderedVisiblePaths(
    sheet.poses[poseKey],
    requestedOrder,
  );

  const elements = paths.map(({ node, worldTransform, effectiveOpacity }) => {
    if (
      node.fill !== null ||
      node.stroke?.toLowerCase() !== "#000000" ||
      Math.abs(effectiveOpacity - 1) > 1e-9
    ) {
      throw new Error(
        `« ${node.name} » : le profil pipeline actuel exige ` +
        "un contour #000000 opaque et aucun remplissage. " +
        "Utiliser un export d’illustration pour les autres styles.",
      );
    }
requirePositive(node.strokeWidth, "Épaisseur");

    const commands = transformCommands(
      node.commands,
      worldTransform,
    );

    const d = commandsToString(commands);
    const width = formatNumber(node.strokeWidth);

    return (
      '<path transform="matrix(1 0 0 1 0 0)" ' +
      `style="stroke:#000000; stroke-width:${width}; fill:none;" ` +
      `d="${d}" />`
    );
  });

  const width = formatNumber(sheet.width);
  const height = formatNumber(sheet.height);

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" ` +
      `height="${height}" viewBox="0 0 ${width} ${height}">`,
    ...elements,
    "</svg>",
    "",
  ].join("\n");
}

/**
 * L’export de paire impose le même ordre des chemins dans A et B.
 * Le manifeste conserve les identités sans ajouter de métadonnées au SVG.
 */

export function exportPipelinePair(sheet: Sheet): {
  poseA: string;
  poseB: string;
  manifest: {
    version: 1;
    sheetId: Id;
    pathOrder: readonly Id[];
  };
} {
  const incompatible = validatePoseCompatibility(sheet).filter(
    (row) => !row.compatible,
  );

  if (incompatible.length > 0) {
    throw new Error(
      "Poses incompatibles : " +
      incompatible.map((row) => row.name).join(", "),
    );
  }

  const pathOrder = orderedVisiblePaths(sheet.poses.A).map(
    (entry) => entry.node.id,
  );

  return {
    poseA: exportPipelineSvg(sheet, "A", pathOrder),
    poseB: exportPipelineSvg(sheet, "B", pathOrder),
    manifest: {
      version: 1,
      sheetId: sheet.id,
      pathOrder,
    },
  };
}

interface HistoryEntry<T> {
  readonly label: string;
  readonly before: T;
  readonly after: T;
}

/**
* Historique de transactions immuables.
 *
 * Aucune sérialisation Fabric/JSON.
 * Les états partagent leurs branches inchangées.
 *
 * Pendant un geste, le renderer utilise un brouillon local.
 * commit() est appelé à la validation du geste, pas à chaque mouvement.
 */
export class TransactionHistory<T> {
  private entries: HistoryEntry<T>[] = [];
  private cursor = 0;
  private current: T;

  constructor(
    initial: T,
    private readonly capacity = 200,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("Capacité d’historique invalide.");
    }

    this.current = initial;
  }

  get value(): T {
    return this.current;
  }

  get canUndo(): boolean {
    return this.cursor > 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.entries.length;
  }
get undoLabel(): string | null {
    return this.entries[this.cursor - 1]?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.entries[this.cursor]?.label ?? null;
  }

  commit(label: string, next: T): T {
    if (Object.is(next, this.current)) return this.current;

    this.entries = this.entries.slice(0, this.cursor);
    this.entries.push({
      label,
      before: this.current,
      after: next,
    });

    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }

    this.cursor = this.entries.length;
    this.current = next;

    return this.current;
  }

  undo(): T {
    if (!this.canUndo) return this.current;

    this.cursor -= 1;
    this.current = this.entries[this.cursor].before;

    return this.current;
  }

  redo(): T {
    if (!this.canRedo) return this.current;

    this.current = this.entries[this.cursor].after;
    this.cursor += 1;

    return this.current;
  }

reset(next: T): void {
    this.entries = [];
    this.cursor = 0;
    this.current = next;
  }
}

export function serializeDocument(document: StudioDocument): string {
  return JSON.stringify(document, null, 2);
}

// ---------------------------------------------------------------------------
// Extensions du socle
// ---------------------------------------------------------------------------

export type EditorTool =
  | "select"
  | "pan"
  | "brush"
  | "pen"
  | "nodes"
  | "line"
  | "rectangle"
  | "ellipse";

export interface DrawingStyle {
  readonly stroke: string | null;
  readonly fill: string | null;
  readonly strokeWidth: number;
  readonly opacity: number;
}

export interface RenderPath {
  readonly node: PathNode;
  readonly layerId: Id;
  readonly world: Matrix;
  readonly parentWorld: Matrix;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
}

/**
 * Vue aplatie pour le renderer.
 * Le modèle de groupes reste intact.
 */
export function getRenderPaths(pose: Pose): RenderPath[] {
  const result: RenderPath[] = [];

function visit(
    nodes: readonly VectorNode[],
    layerId: Id,
    parentWorld: Matrix,
    visible: boolean,
    locked: boolean,
    opacity: number,
  ): void {
    for (const node of nodes) {
      const world = multiplyMatrices(parentWorld, node.transform);
      const nextVisible = visible && node.visible;
      const nextLocked = locked || node.locked;
      const nextOpacity = opacity * node.opacity;

      if (node.kind === "group") {
        visit(
          node.children,
          layerId,
          world,
          nextVisible,
          nextLocked,
          nextOpacity,
        );
      } else {
        result.push({
          node,
          layerId,
          world,
          parentWorld,
          visible: nextVisible,
          locked: nextLocked,
          opacity: nextOpacity,
        });
      }
    }
  }

  for (const layer of pose.layers) {
    visit(
      layer.children,
      layer.id,
      IDENTITY,
      layer.visible,
      layer.locked,
      layer.opacity,
    );
  }

  return result;
}

export function invertMatrix(matrix: Matrix): Matrix {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;

  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    throw new Error("Transformation non inversible.");
  }

  return [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    (b * e - a * f) / determinant,
  ];
}

/**
 * Le callback retourne null pour supprimer un objet.
 * Les branches inchangées conservent leur référence.
 */
export function mapPoseNodes(
  pose: Pose,
  update: (node: VectorNode) => VectorNode | null,
): Pose {
  function visit(nodes: readonly VectorNode[]): readonly VectorNode[] {
    let changed = false;
    const output: VectorNode[] = [];

    for (const original of nodes) {
      let next = update(original);

      if (next?.kind === "group") {
        const children = visit(next.children);
        if (children !== next.children) next = { ...next, children };
      }

      if (next !== original) changed = true;
      if (next) output.push(next);
    }

    return changed ? output : nodes;
  }

let changed = false;

  const layers = pose.layers.map((layer) => {
    const children = visit(layer.children);

    if (children === layer.children) return layer;

    changed = true;
    return { ...layer, children };
  });

  return changed ? { ...pose, layers } : pose;
}

export function appendPaths(
  pose: Pose,
  layerId: Id,
  paths: readonly PathNode[],
): Pose {
  const target = pose.layers.find((layer) => layer.id === layerId);

  if (!target) throw new Error("Sélectionne un calque.");
  if (target.locked || !target.visible) {
    throw new Error("Le calque actif est verrouillé ou masqué.");
  }

  return {
    ...pose,
    layers: pose.layers.map((layer) =>
      layer.id === layerId
        ? { ...layer, children: [...layer.children, ...paths] }
        : layer,
    ),
  };
}

export function pointsToCommands(
  points: readonly Point[],
): readonly PathCommand[] {
  if (points.length < 2) return [];

  const commands: PathCommand[] = [
    ["M", points[0].x, points[0].y],
  ];

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;

    commands.push([
      "C",
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    ]);
  }

  return commands;
}

export function rectangleCommands(
  a: Point,
  b: Point,
): readonly PathCommand[] {
  const vertices = [
    a,
    { x: b.x, y: a.y },
    b,
    { x: a.x, y: b.y },
    a,
  ];

  const output: PathCommand[] = [["M", a.x, a.y]];

  for (let index = 1; index < vertices.length; index += 1) {
    output.push(lineCommands(vertices[index - 1], vertices[index])[1]);
  }

  output.push(["Z"]);
  return output;
}

export function ellipseCommands(
  a: Point,
  b: Point,
): readonly PathCommand[] {
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rx = Math.abs(b.x - a.x) / 2;
  const ry = Math.abs(b.y - a.y) / 2;
  const k = 0.5522847498307936;

  return [
    ["M", cx + rx, cy],
    ["C", cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry],
    ["C", cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy],
    ["C", cx - rx, cy - k * ry, cx - k * rx, cy - ry, cx, cy - ry],
    ["C", cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy],
    ["Z"],
  ];
}

function xmlAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]!);
}

/**
* SVG d’illustration :
 * - M/C/Z uniquement ;
 * - transformations géométriques intégrées aux coordonnées ;
 * - groupes conservés UNIQUEMENT pour la composition des opacités ;
 * - aucun transform sur un groupe.
 *
 * Ce n’est PAS le profil LayerInbetween.
 */
export function exportArtworkSvg(
  sheet: Sheet,
  poseKey: PoseKey,
  selectedIds?: ReadonlySet<Id>,
): string {
  function visit(
    nodes: readonly VectorNode[],
    parent: Matrix,
    inheritedSelected: boolean,
  ): string {
    return nodes.map((node) => {
      if (!node.visible || node.opacity === 0) return "";

      const selected =
        inheritedSelected ||
        selectedIds === undefined ||
        selectedIds.has(node.id);

      const world = multiplyMatrices(parent, node.transform);

      if (node.kind === "group") {
        const children = visit(node.children, world, selected);
        if (!children) return "";

        return `<g opacity="${formatNumber(node.opacity)}">${children}</g>`;
      }

      if (!selected) return "";

      const d = commandsToString(transformCommands(node.commands, world));

      return (
        `<path transform="matrix(1 0 0 1 0 0)" d="${d}" ` +
        `fill="${xmlAttribute(node.fill ?? "none")}" ` +
        `stroke="${xmlAttribute(node.stroke ?? "none")}" ` +
        `stroke-width="${formatNumber(node.strokeWidth)}" ` +
        `stroke-linecap="${node.lineCap}" ` +
        `stroke-linejoin="${node.lineJoin}" ` +
        `opacity="${formatNumber(node.opacity)}" />`
      );
    }).join("\n");
  }

const content = sheet.poses[poseKey].layers.map((layer) => {
    if (!layer.visible || layer.opacity === 0) return "";

    const children = visit(layer.children, IDENTITY, false);
    if (!children) return "";

    return `<g opacity="${formatNumber(layer.opacity)}">${children}</g>`;
  }).join("\n");

  const width = formatNumber(sheet.width);
  const height = formatNumber(sheet.height);

  // Un export de sélection n’inclut pas le fond de feuille.
  const background = sheet.background && !selectedIds
    ? `<rect width="${width}" height="${height}" fill="${xmlAttribute(sheet.background)}" />`
    : "";

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">\n` +
    `${background}\n${content}\n</svg>\n`
  );
}


// ---------------------------------------------------------------------------
// Lecture validée du document.
// Les limites ci-dessous protègent l’import, pas le nombre d’objets créables.
// ---------------------------------------------------------------------------

export function parseDocument(source: string): StudioDocument {
  if (source.length > 50_000_000) {
    throw new Error("Le fichier dépasse la limite d’import de 50 Mo.");
  }

  const input: unknown = JSON.parse(source);
  let nodeCount = 0;
  let commandCount = 0;

  function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Structure de document invalide.");
    }
    return value as Record<string, unknown>;
  }

  function text(value: unknown, label: string): string {
    if (typeof value !== "string" || value.length === 0 || value.length > 500) {
      throw new Error(`${label} invalide.`);
    }
    return value;
  }

  function boolean(value: unknown): boolean {
    if (typeof value !== "boolean") throw new Error("Booléen invalide.");
    return value;
  }

  function number(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("Nombre invalide.");
    }
    return value;
  }

  function opacity(value: unknown): number {
    const result = number(value);
    requireOpacity(result);
    return result;
  }

  function positive(value: unknown, label: string): number {
    const result = number(value);
    requirePositive(result, label);
    return result;
  }

function array(value: unknown): unknown[] {
    if (!Array.isArray(value)) throw new Error("Liste invalide.");
    return value;
  }

  function color(value: unknown): string | null {
    if (value === null) return null;

    if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
      throw new Error("Couleur invalide : format #RRGGBB attendu.");
    }
    return value;
  }

  function matrix(value: unknown): Matrix {
    const values = array(value).map(number);

    if (values.length !== 6) throw new Error("Matrice invalide.");

    const result = values as unknown as Matrix;
    invertMatrix(result);
    return result;
  }

  function commands(value: unknown): readonly PathCommand[] {
    const output = array(value).map((raw): PathCommand => {
      commandCount += 1;

      if (commandCount > 2_000_000) {
        throw new Error("Ce fichier contient trop de commandes pour cet import.");
      }

      const command = array(raw);

      if (command[0] === "Z" && command.length === 1) return ["Z"];

      if (command[0] === "M" && command.length === 3) {
        return ["M", number(command[1]), number(command[2])];
      }

      if (command[0] === "C" && command.length === 7) {
        return [
          "C",
          number(command[1]), number(command[2]),
          number(command[3]), number(command[4]),
          number(command[5]), number(command[6]),
        ];
      }

      throw new Error("Seules les commandes M/C/Z sont acceptées.");
    });

    assertPathCommands(output);
    return output;
  }

function uniqueId(value: unknown, ids: Set<string>): string {
    const id = text(value, "Identifiant");

    if (ids.has(id)) throw new Error(`Identifiant dupliqué : ${id}`);

    ids.add(id);
    return id;
  }

  function node(value: unknown, ids: Set<string>, depth: number): VectorNode {
    if (depth > 64) throw new Error("Imbrication des groupes trop profonde.");

    nodeCount += 1;
    if (nodeCount > 200_000) throw new Error("Fichier trop volumineux pour cet import.");

    const raw = record(value);
    const base: NodeBase = {
      id: uniqueId(raw.id, ids),
      name: text(raw.name, "Nom d’objet"),
      visible: boolean(raw.visible),
      locked: boolean(raw.locked),
      opacity: opacity(raw.opacity),
      transform: matrix(raw.transform),
    };

    if (raw.kind === "group") {
      return {
        ...base,
        kind: "group",
        children: array(raw.children).map((item) => node(item, ids, depth + 1)),
      };
    }

    if (raw.kind !== "path") throw new Error("Type d’objet inconnu.");

    if (!["butt", "round", "square"].includes(String(raw.lineCap))) {
      throw new Error("Terminaison de contour invalide.");
    }

    if (!["miter", "round", "bevel"].includes(String(raw.lineJoin))) {
      throw new Error("Jonction de contour invalide.");
    }

    const strokeWidth = number(raw.strokeWidth);
    if (strokeWidth < 0) throw new Error("Épaisseur négative.");

return {
      ...base,
      kind: "path",
      commands: commands(raw.commands),
      fill: color(raw.fill),
      stroke: color(raw.stroke),
      strokeWidth,
      lineCap: raw.lineCap as PathNode["lineCap"],
      lineJoin: raw.lineJoin as PathNode["lineJoin"],
    };
  }

  function pose(value: unknown): Pose {
    const raw = record(value);
    const ids = new Set<string>();

    return {
      layers: array(raw.layers).map((item): Layer => {
        const layer = record(item);

        return {
          id: uniqueId(layer.id, ids),
          name: text(layer.name, "Nom de calque"),
          visible: boolean(layer.visible),
          locked: boolean(layer.locked),
          opacity: opacity(layer.opacity),
          children: array(layer.children).map((child) => node(child, ids, 0)),
        };
      }),
    };
  }

const root = record(input);

  if (root.format !== "betwixt-vector-studio" || root.version !== 1) {
    throw new Error("Format ou version de document non pris en charge.");
  }

  const sheetIds = new Set<string>();

  const sheets = array(root.sheets).map((item): Sheet => {
    const raw = record(item);
    const poses = record(raw.poses);

    if (!["px", "mm", "cm", "in"].includes(String(raw.displayUnit))) {
      throw new Error("Unité invalide.");
    }

    return {
      id: uniqueId(raw.id, sheetIds),
      name: text(raw.name, "Nom de feuille"),
      width: positive(raw.width, "Largeur"),
      height: positive(raw.height, "Hauteur"),
      displayUnit: raw.displayUnit as Unit,
      dpi: positive(raw.dpi, "DPI"),
      background: color(raw.background),
      poses: {
        A: pose(poses.A),
        B: pose(poses.B),
      },
    };
  });

  if (sheets.length === 0) throw new Error("Le document doit contenir une feuille.");

  return {
    format: "betwixt-vector-studio",
    version: 1,
    id: text(root.id, "Identifiant du document"),
    name: text(root.name, "Nom du document"),
    sheets,
  };
}

