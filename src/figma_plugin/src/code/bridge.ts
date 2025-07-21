// @ts-nocheck

type FetchedNode = Record<string, any>;
type XYWH = { x: number; y: number; width: number; height: number };
function clone(val) {
  return JSON.parse(JSON.stringify(val));
}
/** Cofactor / determinant for a 3×3 matrix */
function det3(m: Mat3): number {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

/** Classical-adjugate inverse. Returns null if the matrix is singular. */
function inv3(m: Mat3): Mat3 | null {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const det = det3(m);
  if (Math.abs(det) < 1e-8) return null; // avoid blowing up

  const invDet = 1 / det;
  return [
    [
      (e * i - f * h) * invDet,
      (c * h - b * i) * invDet,
      (b * f - c * e) * invDet,
    ],
    [
      (f * g - d * i) * invDet,
      (a * i - c * g) * invDet,
      (c * d - a * f) * invDet,
    ],
    [
      (d * h - e * g) * invDet,
      (b * g - a * h) * invDet,
      (a * e - b * d) * invDet,
    ],
  ];
}

/** Standard 3×3 matrix multiply */
function mul3(a: Mat3, b: Mat3): Mat3 {
  const r: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
    }
  }
  return r;
}
type Transform = [[number, number, number], [number, number, number]];
const IDENTITY_HANDLES: Mat3 = [
  [0, 1, 0], // x-coords of (0,0.5) (1,0.5) (0,1)
  [0.5, 0.5, 1], // y-coords
  [1, 1, 1], // homogeneous row
];

function handlesToTransform(h: Vector[]): Transform {
  // Build D = [ p0 | p1 | p2 ]
  const D: Mat3 = [
    [h[0].x, h[1].x, h[2].x],
    [h[0].y, h[1].y, h[2].y],
    [1, 1, 1],
  ];

  const invD = inv3(D) ?? IDENTITY_HANDLES; // sane fallback
  const M = mul3(IDENTITY_HANDLES, invD); // M = O · D⁻¹
  return [M[0] as any, M[1] as any]; // top two rows only
}

function sanitisePathData(path: string): string {
  return (
    path
      // 1. space *after* command letter (if next char isn’t whitespace/comma)
      .replace(/([MLHVCSQTAZmlhvcsqtaz])(?=[^\s,])/g, "$1 ")
      // 2. space *before* command letter (if prev char isn’t whitespace/comma)
      .replace(/([^\s,])([MLHVCSQTAZmlhvcsqtaz])/g, "$1 $2")
      // 3. space before a minus-sign that follows a digit or dot
      .replace(/([0-9.])(-)/g, "$1 $2")
      // 4. collapse whitespace noise
      .replace(/\s+/g, " ")
      .trim()
  );
}

function degFromMatrix(t: Transform): number {
  const [[a, b], [c, d]] = t; // ignore translation
  const radians = Math.atan2(c, a); // atan2(m10, m00)
  return (radians * 180) / Math.PI;
}

/** Smallest absolute difference between two angles (deg). */
function deltaDeg(a: number, b: number): number {
  return Math.abs(((a - b + 180) % 360) - 180);
}

// ─── helper ────────────────────────────────────────────────────────────────
function wantsAbsolute(staticNode: FetchedNode): boolean {
  return (
    (staticNode as any).layoutPositioning === "ABSOLUTE" ||
    (staticNode as any).ignoreAutoLayout === true
  );
}

function finaliseAbsolutePositioning(
  liveChild: SceneNode,
  staticChild: FetchedNode,
  liveParent: SceneNode & ChildrenMixin
) {
  try {
    if (
      !wantsAbsolute(staticChild) || // not requested
      !("layoutMode" in liveParent) || // parent not a frame
      liveParent.layoutMode === "NONE" || // parent not auto-layout
      !("layoutPositioning" in liveChild) // property not supported
    ) {
      return;
    }

    // 1 — switch to ABSOLUTE *now that the parent is valid*
    if ("layoutPositioning" in liveChild) {
      (liveChild as any).layoutPositioning = "ABSOLUTE";
    }

    // 2 — apply the stored matrix translation as x / y (parent-space)
    if (
      Array.isArray(staticChild.relativeTransform) &&
      staticChild.relativeTransform.length === 2
    ) {
      const T = staticChild.relativeTransform as Transform;
      liveChild.x = T[0][2];
      liveChild.y = T[1][2];
    } else if (staticChild.absoluteBoundingBox) {
      const { x, y } = staticChild.absoluteBoundingBox as XYWH;
      liveChild.x = x - liveParent.x;
      liveChild.y = y - liveParent.y;
    }
  } catch (err) {
    console.warn("finaliseAbsolutePositioning →", err);
  }
}

function formatPaint(p: any): Paint | undefined {
  if (!p?.type) return;

  const rgb = ({ r, g, b }: any): RGB => ({ r, g, b });
  const rgba = ({ r, g, b, a }: any): RGBA => ({ r, g, b, a: a ?? 1 });

  switch (p.type) {
    /* ────────── SOLID ────────── */
    case "SOLID": {
      if (!p.color) return; // invalid
      return {
        type: "SOLID",
        color: rgb(p.color),
        opacity: p.opacity ?? p.color.a ?? 1,
        visible: p.visible ?? true,
        blendMode: p.blendMode,
      };
    }

    /* ────────── IMAGE ────────── */
    case "IMAGE": {
      return {
        type: "IMAGE",
        imageHash: p.imageHash,
        scaleMode: p.scaleMode ?? "FILL",
        imageTransform: p.imageTransform ?? [
          [1, 0, 0],
          [0, 1, 0],
        ],
        opacity: p.opacity ?? 1,
        visible: p.visible ?? true,
      };
    }

    /* ────────── GRADIENTS ────────── */
    case "GRADIENT_LINEAR":
    case "GRADIENT_RADIAL":
    case "GRADIENT_ANGULAR":
    case "GRADIENT_DIAMOND": {
      if (!Array.isArray(p.gradientStops) || p.gradientStops.length < 2) return;

      const transform: Transform =
        p.gradientTransform ??
        (Array.isArray(p.gradientHandlePositions) &&
        p.gradientHandlePositions.length === 3
          ? handlesToTransform(p.gradientHandlePositions)
          : [
              [1, 0, 0],
              [0, 1, 0],
            ]); // ultimate fallback

      return {
        type: p.type,
        gradientTransform: transform, // ✔ plugin-safe
        gradientStops: p.gradientStops.map((s: any) => ({
          position: s.position,
          color: rgba(s.color),
        })),
        opacity: p.opacity ?? 1,
        visible: p.visible ?? true,
        blendMode: p.blendMode,
      };
    }
  }
}

const assignPaints = (
  key: "fills" | "strokes",
  target: GeometryMixin,
  source: any
) => {
  if (!(key in source && key in target)) return;

  const rawArr = source[key] as any[];

  // 1. Empty array → explicitly clear paints on the liveNode
  if (rawArr.length === 0) {
    (target as any)[key] = [];
    return;
  }

  // 2. Otherwise map & assign as before
  const paints = rawArr
    .map(formatPaint)
    .filter((p): p is Paint => p !== undefined);

  (target as any)[key] = paints; // even if paints.length === 0
};

/**
 * Entrypoint used from code.ts
 */
export async function createNode(
  staticNode: FetchedNode,
  parentNode: BaseNode & ChildrenMixin,
  staticParentNode: FetchedNode
): Promise<SceneNode | null> {
  // 1 – instantiate an empty SceneNode of the right kind
  const liveNode = await instantiateNode(staticNode);
  if (!liveNode) return null;

  /* 2 — vector geometry must exist before we resize the liveNode ------------------------- */
  applyVectorData(liveNode, staticNode);

  // 2 – apply every group of properties that the API exposes
  applyCommonProps(liveNode, staticNode); // name, visibility, rotation, opacity
  applyTransform(liveNode, staticNode, staticParentNode); // x, y, w, h, resize, relativeTransform
  applyGeometry(liveNode, staticNode); // fills, strokes, effects, corner radius…
  applyBackground(liveNode, staticNode);
  applyStrokeProps(liveNode, staticNode); // strokeCap, strokeJoin, strokeAlign, dashPattern, strokeMiterLimit
  applyShapeProps(liveNode, staticNode); // arcData, rectangleCornerRadius, pointCount, innerRadius
  await applyText(liveNode, staticNode); // characters, fonts, paragraph & run styles
  applyAutoLayout(liveNode, staticNode); // layoutMode, padding*, itemSpacing…
  applyConstraints(liveNode, staticNode); // constraints, layoutAlign, layoutGrow…
  applyBlend(liveNode, staticNode); // blendMode, opacity, masks

  // 3 – recurse for children. Groups & boolean ops need a special path
  if (Array.isArray(staticNode.children) && "appendChild" in liveNode) {
    for (const staticChildNode of staticNode.children) {
      const liveChildNode = await createNode(
        staticChildNode,
        liveNode,
        staticNode
      );
      if (liveChildNode) {
        (liveNode as SceneNode & ChildrenMixin).appendChild(liveChildNode);
        finaliseAbsolutePositioning(liveChildNode, staticChildNode, liveNode);
      }
    }

    // If the JSON layer was a GROUP, convert the temporary Frame
    if (staticNode.type === "GROUP") {
      const group = figma.group(
        (liveNode as FrameNode).children,
        liveNode.parent as PageNode | (BaseNode & ChildrenMixin)
      );
      group.name = liveNode.name;
      liveNode.remove();
      return group;
    }

    // If the JSON layer was a BOOLEAN_OPERATION, convert the temporary Frame
    if (staticNode.type === "BOOLEAN_OPERATION") {
      const boolNode = applyBoolean(liveNode, staticNode, parentNode);
      if (boolNode) {
        // re-apply properties that must live on the final node
        applyCommonProps(boolNode, staticNode);
        applyTransform(boolNode, staticNode, staticParentNode);
        applyGeometry(boolNode, staticNode);
        applyBackground(boolNode, staticNode);
        applyBlend(boolNode, staticNode);
        return boolNode; // ← return the real Boolean group
      }
    }
  }
  return liveNode;
}

// ───────────────────── creators ─────────────────────

async function instantiateNode(
  staticNode: FetchedNode
): Promise<SceneNode | null> {
  const map: Record<string, () => SceneNode> = {
    FRAME: () => figma.createFrame(),
    GROUP: () => figma.createFrame(), // temporary (re-group later)
    SECTION: () => figma.createSection?.() || figma.createFrame(),
    RECTANGLE: () => figma.createRectangle(),
    ELLIPSE: () => figma.createEllipse(),
    LINE: () => figma.createLine(),
    POLYGON: () => figma.createPolygon(),
    STAR: () => figma.createStar(),
    VECTOR: () => figma.createVector(),
    BOOLEAN_OPERATION: () => figma.createFrame(),
    SLICE: () => figma.createSlice(),
    TEXT: () => figma.createText(),
  };
  const ctor = map[staticNode.type];
  return ctor ? ctor() : null;
}

// ───────────────────── applicators ─────────────────────

function applyVectorData(liveNode: SceneNode, staticNode: FetchedNode) {
  try {
    if (staticNode.type !== "VECTOR") return; // bail on non-vectors

    const vector = liveNode as VectorNode;

    // Prefer fill geometry → fallback to stroke geometry → bail if none
    const geo =
      (staticNode.fillGeometry?.length
        ? staticNode.fillGeometry
        : staticNode.strokeGeometry) ?? [];
    if (!geo.length) return;

    // Convert Figma REST JSON → Plugin API VectorPath[]
    vector.vectorPaths = geo.map((g: any) => ({
      windingRule: (g.windingRule as WindingRule) ?? "NONZERO",
      data: sanitisePathData(g.path as string),
    }));

    // Basic stroke props that live on VectorNode itself
    if ("strokeCap" in staticNode) vector.strokeCap = staticNode.strokeCap;
    if ("strokeJoin" in staticNode) vector.strokeJoin = staticNode.strokeJoin;
    if ("strokeWeight" in staticNode)
      vector.strokeWeight = staticNode.strokeWeight;
  } catch (e) {
    console.error("Error applying vector data:", e);
  }
}

function applyCommonProps(liveNode: SceneNode, staticNode: FetchedNode) {
  try {
    liveNode.name = staticNode.name ?? staticNode.type;
    if ("visible" in staticNode) liveNode.visible = staticNode.visible;
    if ("opacity" in staticNode) (liveNode as any).opacity = staticNode.opacity;
  } catch (e) {
    console.error("Error applying common props:", e);
  }
}

function applyTransform(
  liveNode: SceneNode,
  staticNode: FetchedNode,
  staticParentNode: FetchedNode
) {
  try {
    /* 0 – flags --------------------------------------------------------- */
    const parentIsAutoLayout =
      typeof staticParentNode.layoutMode === "string" &&
      staticParentNode.layoutMode !== "NONE";

    const absoluteLater = parentIsAutoLayout && wantsAbsolute(staticNode);

    /* 1 – size (unchanged) --------------------------------------------- */
    const w =
      staticNode.absoluteBoundingBox?.width ??
      staticNode.size?.x ??
      liveNode.width;
    const h =
      staticNode.absoluteBoundingBox?.height ??
      staticNode.size?.y ??
      liveNode.height;

    if (
      "resize" in liveNode &&
      w != null &&
      h != null &&
      liveNode.type !== "VECTOR"
    ) {
      (liveNode as LayoutMixin).resize(w, h);
    }

    /* 2 – position / rotation ------------------------------------------ */
    const canEditXYNow = !parentIsAutoLayout && !absoluteLater;
    const isRoot =
      staticParentNode.type === "DOCUMENT" || staticParentNode.type === "PAGE";

    if (
      canEditXYNow &&
      Array.isArray(staticNode.relativeTransform) &&
      staticNode.relativeTransform.length === 2 &&
      !isRoot
    ) {
      const T = staticNode.relativeTransform as Transform;
      liveNode.x = T[0][2];
      liveNode.y = T[1][2];
      const angleCW = -degFromMatrix(T);
      if (angleCW) liveNode.rotation = angleCW;
      return;
    }

    /* 3 – legacy fallback (same gate) ---------------------------------- */
    if (canEditXYNow && staticNode.absoluteBoundingBox) {
      const { x, y } = staticNode.absoluteBoundingBox as XYWH;
      liveNode.x = x - (staticParentNode.absoluteBoundingBox?.x ?? 0);
      liveNode.y = y - (staticParentNode.absoluteBoundingBox?.y ?? 0);
      if (typeof staticNode.rotation === "number") {
        const raw =
          Math.abs(staticNode.rotation) <= 2 * Math.PI
            ? (staticNode.rotation * 180) / Math.PI
            : staticNode.rotation;
        liveNode.rotation = -raw;
      }
    }
  } catch (e) {
    console.error("Error applying transform:", e);
  }
}

function applyGeometry(liveNode: SceneNode, staticNode: FetchedNode) {
  try {
    const DEFAULT_GRADIENT_HANDLES: Vector[] = [
      { x: 0.0, y: 0.0 }, // start
      { x: 1.0, y: 0.0 }, // end
      { x: 0.0, y: 1.0 }, // width-direction (any non-collinear third point works)
    ];

    if ("fills" in liveNode) {
      assignPaints("fills", liveNode as GeometryMixin, staticNode);
    }
    if ("strokes" in liveNode) {
      assignPaints("strokes", liveNode as GeometryMixin, staticNode);
    }

    if ("strokeWeight" in staticNode && "strokeWeight" in liveNode) {
      (liveNode as GeometryMixin).strokeWeight = staticNode.strokeWeight;
    }
    if ("cornerRadius" in liveNode) {
      const tgt = liveNode as unknown as CornerMixin;

      // 1 · bulk array from REST   ──────────────────────────────
      if (Array.isArray(staticNode.rectangleCornerRadii)) {
        const [tl, tr, br, bl] = staticNode.rectangleCornerRadii;
        if ("topLeftRadius" in staticNode) tgt.topLeftRadius = tl;
        if ("topRightRadius" in staticNode) tgt.topRightRadius = tr;
        if ("bottomRightRadius" in staticNode) tgt.bottomRightRadius = br;
        if ("bottomLeftRadius" in staticNode) tgt.bottomLeftRadius = bl;
      } else {
        // 2 · individual props from REST ───────────────────────
        if ("topLeftRadius" in staticNode)
          tgt.topLeftRadius = staticNode.topLeftRadius;
        if ("topRightRadius" in staticNode)
          tgt.topRightRadius = staticNode.topRightRadius;
        if ("bottomRightRadius" in staticNode)
          tgt.bottomRightRadius = staticNode.bottomRightRadius;
        if ("bottomLeftRadius" in staticNode)
          tgt.bottomLeftRadius = staticNode.bottomLeftRadius;
      }

      // 3 · fallback to uniform radius (keeps old behaviour) ───
      if (
        !("rectangleCornerRadii" in staticNode) &&
        !("topLeftRadius" in staticNode) &&
        "cornerRadius" in staticNode
      ) {
        tgt.cornerRadius = staticNode.cornerRadius;
      }

      // Optional smoothing (supported by CornerMixin)
      if ("cornerSmoothing" in staticNode)
        tgt.cornerSmoothing = staticNode.cornerSmoothing;
    }
    if ("effects" in staticNode && "effects" in liveNode) {
      (liveNode as GeometryMixin).effects = staticNode.effects;
    }
  } catch (e) {
    console.error("Error applying geometry:", e);
  }
}

function applyBackground(liveNode: SceneNode, staticNode: FetchedNode) {
  /* 0 — quick bail-out if the JSON carries no background info */
  const hasBgInput =
    staticNode.backgroundColor != null ||
    (Array.isArray(staticNode.background) &&
      staticNode.background.length > 0) ||
    typeof staticNode.backgroundStyleId === "string";
  if (!hasBgInput) return;

  /* ───────────────── 1 · PAGE nodes ───────────────── */
  if (liveNode.type === "PAGE" || staticNode.type === "PAGE") {
    if (staticNode.backgroundColor) {
      const { r, g, b } = staticNode.backgroundColor;
      (liveNode as PageNode).backgroundColor = { r, g, b };
    }
    if (
      typeof staticNode.backgroundStyleId === "string" &&
      "backgroundStyleId" in liveNode
    ) {
      try {
        // since API 1.105 pages can reference a paint style
        (liveNode as any).backgroundStyleId = staticNode.backgroundStyleId;
      } catch (err) {
        console.error("Error applying background style:", err);
      }
    }
    return;
  }

  /* ─────── 2 · nodes that expose `backgrounds` (Frame / Component / Instance) ─────── */
  if ("background" in liveNode) {
    const frameLike = liveNode as FrameNode | ComponentNode | InstanceNode;

    /* 2 a – paint style */
    if (
      typeof staticNode.backgroundStyleId === "string" &&
      "backgroundStyleId" in frameLike
    ) {
      try {
        (frameLike as any).backgroundStyleId = staticNode.backgroundStyleId;
      } catch {
        console.error(
          "Error applying background style:",
          staticNode.backgroundStyleId
        );
      }
    }

    /* 2 b – explicit `background` array */
    if (Array.isArray(staticNode.background) && staticNode.background.length) {
      const paints = staticNode.background
        .map(formatPaint)
        .filter(Boolean) as Paint[];

      if (JSON.stringify(paints) !== JSON.stringify(frameLike.background)) {
        frameLike.background = paints;
      }
      return;
    }

    /* 2 c – fallback solid if absolutely nothing else was set */
    if (
      staticNode.backgroundColor &&
      (!frameLike.background || frameLike.background.length === 0) &&
      typeof staticNode.backgroundStyleId !== "string"
    ) {
      const { r, g, b, a } = staticNode.backgroundColor;
      frameLike.background = [
        { type: "SOLID", color: { r, g, b }, opacity: a ?? 1 },
      ];
    }
    return;
  }

  /* ───────────── 3 · Geometry nodes (RECTANGLE, VECTOR, …) ───────────── */
  if ("fills" in liveNode) {
    const geo = liveNode as GeometryMixin & { fillStyleId?: string };

    const jsonHasPaint =
      (Array.isArray(staticNode.fills) && staticNode.fills.length > 0) ||
      typeof staticNode.fillStyleId === "string";
    const liveHasPaint =
      (Array.isArray(geo.fills) && geo.fills.length > 0) ||
      typeof geo.fillStyleId === "string";

    /* fallback */
    if (!liveHasPaint && staticNode.backgroundColor) {
      const { r, g, b, a } = staticNode.backgroundColor;
      geo.fills = [{ type: "SOLID", color: { r, g, b }, opacity: a ?? 1 }];
    }
  }
}

function applyStrokeProps(liveNode: SceneNode, staticNode: FetchedNode) {
  if (!("strokes" in liveNode)) return; // nothing to do

  const target = liveNode as unknown as {
    strokeCap?: StrokeCap;
    strokeJoin?: StrokeJoin;
    strokeAlign?: StrokeAlign;
    dashPattern?: number[];
    strokeMiterLimit?: number;
  };

  if ("strokeCap" in staticNode) target.strokeCap = staticNode.strokeCap;
  if ("strokeJoin" in staticNode) target.strokeJoin = staticNode.strokeJoin;
  if ("strokeAlign" in staticNode) target.strokeAlign = staticNode.strokeAlign;
  if ("dashPattern" in staticNode) target.dashPattern = staticNode.dashPattern;
  if ("strokeMiterLimit" in staticNode)
    target.strokeMiterLimit = staticNode.strokeMiterLimit;
}

function applyShapeProps(liveNode: SceneNode, staticNode: FetchedNode) {
  switch (staticNode.type) {
    /* ──────────────── ELLIPSE ──────────────── */
    case "ELLIPSE": {
      if ("arcData" in staticNode) {
        const src = staticNode.arcData;
        // REST % (0-100)  → plugin 0-1
        const inner =
          typeof src.innerRadius === "number" && src.innerRadius > 1
            ? src.innerRadius / 100
            : (src.innerRadius ?? 0);
        (liveNode as EllipseNode).arcData = {
          startingAngle: src.startingAngle ?? 0,
          endingAngle: src.endingAngle ?? 0,
          innerRadius: inner,
        };
      }
      break;
    }

    /* ─────────────── RECTANGLE ─────────────── */
    case "RECTANGLE": {
      const r = liveNode as RectangleNode;

      if ("cornerSmoothing" in staticNode)
        r.cornerSmoothing = staticNode.cornerSmoothing;

      if (Array.isArray(staticNode.rectangleCornerRadii)) {
        const [tl, tr, br, bl] = staticNode.rectangleCornerRadii;
        r.topLeftRadius = tl;
        r.topRightRadius = tr;
        r.bottomRightRadius = br;
        r.bottomLeftRadius = bl;
      } else {
        if ("topLeftRadius" in staticNode)
          r.topLeftRadius = staticNode.topLeftRadius;
        if ("topRightRadius" in staticNode)
          r.topRightRadius = staticNode.topRightRadius;
        if ("bottomRightRadius" in staticNode)
          r.bottomRightRadius = staticNode.bottomRightRadius;
        if ("bottomLeftRadius" in staticNode)
          r.bottomLeftRadius = staticNode.bottomLeftRadius;
      }
      break;
    }

    /* ──────────────── POLYGON ──────────────── */
    case "POLYGON": {
      const p = liveNode as PolygonNode;
      if ("pointCount" in staticNode) p.pointCount = staticNode.pointCount; // :contentReference[oaicite:1]{index=1}
      if ("cornerRadius" in staticNode)
        p.cornerRadius = staticNode.cornerRadius;
      break;
    }

    /* ───────────────── STAR ────────────────── */
    case "STAR": {
      const s = liveNode as StarNode;
      if ("pointCount" in staticNode) s.pointCount = staticNode.pointCount; // :contentReference[oaicite:2]{index=2}
      if ("innerRadius" in staticNode)
        s.innerRadius =
          staticNode.innerRadius > 1
            ? staticNode.innerRadius / 100
            : staticNode.innerRadius; // :contentReference[oaicite:3]{index=3}
      break;
    }

    /* ──────────────── LINE ─────────────────── */
    case "LINE":
      /* nothing extra – stroke props were handled above */
      break;
  }
}

async function applyText(
  liveNode: SceneNode,
  staticNode: FetchedNode
): Promise<void> {
  if (staticNode.type !== "TEXT") return;
  const txt = liveNode as TextNode;

  /* ───── helpers ───── */
  const FALLBACK_FAMILY = "Inter";

  async function loadFontOrFallback(requested: FontName): Promise<FontName> {
    try {
      await figma.loadFontAsync(requested);
      return requested;
    } catch {
      const sameStyle: FontName = {
        family: FALLBACK_FAMILY,
        style: requested.style,
      };
      try {
        await figma.loadFontAsync(sameStyle);
        return sameStyle;
      } catch {
        const regular: FontName = { family: FALLBACK_FAMILY, style: "Regular" };
        await figma.loadFontAsync(regular);
        return regular;
      }
    }
  }

  const toPaints = (fills: any[] = []): Paint[] =>
    fills
      .filter((p) => p.type === "SOLID" && p.color)
      .map((p) => ({
        type: "SOLID",
        color: { r: p.color.r, g: p.color.g, b: p.color.b },
        opacity: p.opacity ?? p.color.a ?? 1,
      })) as Paint[];

  /* ───── style look-ups ───── */
  const rootStyle = staticNode.style ?? {};
  const overrides = staticNode.characterStyleOverrides ?? [];
  const table = staticNode.styleOverrideTable ?? {};

  const lookupFont = (s: any): FontName => ({
    family: s.fontFamily ?? (txt.fontName as FontName).family,
    style: s.fontStyle ?? (txt.fontName as FontName).style,
  });

  /* ───── 0 · preload every font we’ll need ───── */
  await figma.loadFontAsync(txt.fontName as FontName); // default font
  const fontMap = new Map<string, FontName>();
  async function register(fn: FontName) {
    fontMap.set(JSON.stringify(fn), await loadFontOrFallback(fn));
  }
  await register(lookupFont(rootStyle));
  for (const s of Object.values(table)) await register(lookupFont(s as any));
  const safe = (fn: FontName) => fontMap.get(JSON.stringify(fn))!;

  /* ───── 1 · basic node values ───── */
  txt.characters = staticNode.characters ?? "";
  txt.fontName = safe(lookupFont(rootStyle));
  if ("fontSize" in rootStyle) txt.fontSize = rootStyle.fontSize;

  /* ───── 2 · auto-resize BEFORE alignment ───── */
  txt.textAutoResize = (staticNode.textAutoResize ??
    rootStyle.textAutoResize ??
    "NONE") as any; // NONE | WIDTH | HEIGHT | TRUNCATE

  /* ───── 3 · resolve & apply alignment ───── */
  const resolveAlignment = (): {
    h: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
    v: "TOP" | "CENTER" | "BOTTOM";
  } => {
    const h = (
      staticNode.textAlignHorizontal ??
      rootStyle.textAlignHorizontal ??
      "LEFT"
    ).toUpperCase();
    const v = (
      staticNode.textAlignVertical ??
      rootStyle.textAlignVertical ??
      "TOP"
    ).toUpperCase();
    const horiz: any = ["LEFT", "CENTER", "RIGHT", "JUSTIFIED"].includes(h)
      ? h
      : "LEFT";
    const vert: any = ["TOP", "CENTER", "BOTTOM"].includes(v) ? v : "TOP";
    return { h: horiz, v: vert };
  };

  const { h, v } = resolveAlignment();
  txt.textAlignHorizontal = h; // works for every resize mode
  if (txt.textAutoResize === "NONE") {
    txt.textAlignVertical = v;
  }

  /* ───── 4 · additional node-level props ───── */
  if ("textCase" in rootStyle) {
    try {
      txt.textCase = rootStyle.textCase;
    } catch {
      /* small-caps not supported */
    }
  }
  if ("textDecoration" in rootStyle)
    txt.textDecoration = rootStyle.textDecoration;
  if ("paragraphIndent" in rootStyle)
    txt.paragraphIndent = rootStyle.paragraphIndent;
  if ("paragraphSpacing" in rootStyle)
    txt.paragraphSpacing = rootStyle.paragraphSpacing;

  if (rootStyle.lineHeightUnit === "AUTO") {
    txt.lineHeight = { unit: "AUTO" };
  } else if ("lineHeightPx" in rootStyle) {
    txt.lineHeight = { value: rootStyle.lineHeightPx, unit: "PIXELS" };
  } else if ("lineHeightPercent" in rootStyle) {
    txt.lineHeight = { value: rootStyle.lineHeightPercent, unit: "PERCENT" };
  }

  if ("letterSpacing" in rootStyle) {
    txt.letterSpacing = {
      value: rootStyle.letterSpacing,
      unit: rootStyle.letterSpacingUnit === "PERCENT" ? "PERCENT" : "PIXELS",
    };
  }

  /* root-level fills (if geometry pass didn’t set them) */
  if ("fills" in staticNode && (!txt.fills || txt.fills.length === 0)) {
    const paints = toPaints(staticNode.fills);
    if (paints.length) txt.fills = paints;
  }

  /* ───── 5 · range-level overrides (unchanged) ───── */
  if (overrides.length && Object.keys(table).length) {
    let start = 0;
    while (start < overrides.length) {
      const styleId = overrides[start];
      let end = start;
      while (end < overrides.length && overrides[end] === styleId) end++;

      const o = table[styleId];
      if (o) {
        const sf = safe(lookupFont(o));
        txt.setRangeFontName(start, end, sf);
        if ("fontSize" in o) txt.setRangeFontSize(start, end, o.fontSize);
        if ("textCase" in o) {
          try {
            txt.setRangeTextCase(start, end, o.textCase);
          } catch {}
        }
        if ("textDecoration" in o)
          txt.setRangeTextDecoration(start, end, o.textDecoration);

        // line-height per range
        if (o.lineHeightUnit === "AUTO") {
          txt.setRangeLineHeight(start, end, { unit: "AUTO" });
        } else if ("lineHeightPx" in o) {
          txt.setRangeLineHeight(start, end, {
            value: o.lineHeightPx,
            unit: "PIXELS",
          });
        } else if ("lineHeightPercent" in o) {
          txt.setRangeLineHeight(start, end, {
            value: o.lineHeightPercent,
            unit: "PERCENT",
          });
        }

        // tracking per range
        if ("letterSpacing" in o) {
          txt.setRangeLetterSpacing(start, end, {
            value: o.letterSpacing,
            unit: o.letterSpacingUnit === "PERCENT" ? "PERCENT" : "PIXELS",
          });
        }

        // fills per range
        if (Array.isArray(o.fills) && o.fills.length) {
          txt.setRangeFills(start, end, toPaints(o.fills));
        }
        if ("inheritFillStyleId" in o) {
          try {
            txt.setRangeFillStyleId(start, end, o.inheritFillStyleId);
          } catch {}
        }
      }
      start = end;
    }
  }
}

function applyAutoLayout(liveNode: SceneNode, staticNode: FetchedNode) {
  try {
    if ("clipsContent" in liveNode) {
      const clip =
        (staticNode as any).clipsContent ?? (staticNode as any).clipContent; // legacy alias
      if (typeof clip === "boolean") {
        (liveNode as FrameNode).clipsContent = clip;
      }
    }

    if (!("layoutMode" in staticNode) || !("layoutMode" in liveNode)) return;
    const frame = liveNode as FrameNode;

    /* 0 — basic direction -------------------------------------------------- */
    frame.layoutMode = staticNode.layoutMode; // NONE | HORIZONTAL | …
    const isContainer = frame.layoutMode !== "NONE"; // only TRUE for real A-L frames

    /* 1 — container-only props -------------------------------------------- */
    if (isContainer) {
      // Modern sizing: allow HUG / FIXED, silently downgrade an illegal FILL
      if (
        "layoutSizingHorizontal" in staticNode &&
        staticNode.layoutSizingHorizontal !== "FILL"
      ) {
        frame.layoutSizingHorizontal = staticNode.layoutSizingHorizontal as any;
      }
      if (
        "layoutSizingVertical" in staticNode &&
        staticNode.layoutSizingVertical !== "FILL"
      ) {
        frame.layoutSizingVertical = staticNode.layoutSizingVertical as any;
      }

      // Legacy props for back-compat
      if ("primaryAxisSizingMode" in staticNode)
        frame.primaryAxisSizingMode = staticNode.primaryAxisSizingMode;
      if ("counterAxisSizingMode" in staticNode)
        frame.counterAxisSizingMode = staticNode.counterAxisSizingMode;

      // Alignment, wrapping, gaps, grid …
      if ("primaryAxisAlignItems" in staticNode)
        frame.primaryAxisAlignItems = staticNode.primaryAxisAlignItems;
      if ("counterAxisAlignItems" in staticNode)
        frame.counterAxisAlignItems = staticNode.counterAxisAlignItems;
      if ("layoutWrap" in staticNode) frame.layoutWrap = staticNode.layoutWrap; // WRAP / NO_WRAP :contentReference[oaicite:4]{index=4}
      if ("counterAxisSpacing" in staticNode)
        frame.counterAxisSpacing = staticNode.counterAxisSpacing ?? 0;

      /* Grid-flow props (only when layoutMode === "GRID") */
      if (staticNode.layoutMode === "GRID") {
        if ("gridRowCount" in staticNode)
          frame.gridRowCount = staticNode.gridRowCount;
        if ("gridColumnCount" in staticNode)
          frame.gridColumnCount = staticNode.gridColumnCount;
        if ("gridRowGap" in staticNode)
          frame.gridRowGap = staticNode.gridRowGap;
        if ("gridColumnGap" in staticNode)
          frame.gridColumnGap = staticNode.gridColumnGap;
        if ("gridColumnsSizing" in staticNode)
          frame.gridColumnsSizing = staticNode.gridColumnsSizing;
        if ("gridRowsSizing" in staticNode)
          frame.gridRowsSizing = staticNode.gridRowsSizing;
      }

      /* Spacing & padding -------------------------------------------------- */
      frame.itemSpacing = staticNode.itemSpacing ?? frame.itemSpacing ?? 0;

      frame.paddingLeft =
        staticNode.paddingLeft ??
        staticNode.horizontalPadding ??
        frame.paddingLeft ??
        0;
      frame.paddingRight =
        staticNode.paddingRight ??
        staticNode.horizontalPadding ??
        frame.paddingRight ??
        0;
      frame.paddingTop =
        staticNode.paddingTop ??
        staticNode.verticalPadding ??
        frame.paddingTop ??
        0;
      frame.paddingBottom =
        staticNode.paddingBottom ??
        staticNode.verticalPadding ??
        frame.paddingBottom ??
        0;
    }

    // If the liveNode is *not* an auto-layout container we bail out here;
    // its sizing will be handled in applyConstraints (see below).
  } catch (err) {
    console.error("applyAutoLayout →", err);
  }
}

function applyConstraints(
  liveNode: SceneNode,
  staticNode: FetchedNode,
  parent?: BaseNode & ChildrenMixin
) {
  try {
    // --- 1. Persist the original JSON constraints for reference -----------
    if ("constraints" in staticNode) {
      liveNode.setPluginData?.(
        "__constraints",
        JSON.stringify(staticNode.constraints)
      );
    }

    // --- 2. Handle layoutAlign / layoutGrow safely ------------------------
    const parentIsAutoLayout =
      parent &&
      "layoutMode" in parent &&
      (parent as FrameNode).layoutMode !== "NONE";

    if (parentIsAutoLayout) {
      // existing: layoutAlign / layoutGrow …
      if ("layoutAlign" in staticNode && "layoutAlign" in liveNode)
        (liveNode as any).layoutAlign = staticNode.layoutAlign;
      if ("layoutGrow" in staticNode && "layoutGrow" in liveNode)
        (liveNode as any).layoutGrow = staticNode.layoutGrow;

      // NEW: children-only sizing
      if (
        "layoutSizingHorizontal" in staticNode &&
        "layoutSizingHorizontal" in liveNode
      )
        (liveNode as any).layoutSizingHorizontal =
          staticNode.layoutSizingHorizontal;
      if (
        "layoutSizingVertical" in staticNode &&
        "layoutSizingVertical" in liveNode
      )
        (liveNode as any).layoutSizingVertical =
          staticNode.layoutSizingVertical;
    }
  } catch (err) {
    console.error("applyConstraints →", err);
  }
}

function resolveMaskType(staticNode: FetchedNode): MaskType {
  if (typeof staticNode.maskType === "string") {
    const t = staticNode.maskType.toUpperCase();
    if (t === "ALPHA" || t === "VECTOR" || t === "LUMINANCE")
      return t as MaskType;
  }
  if (staticNode.isMaskOutline === true) return "VECTOR";
  return "ALPHA";
}

function applyBlend(liveNode: SceneNode, staticNode: FetchedNode) {
  try {
    // ── existing logic ───────────────────────────────
    if ("opacity" in staticNode && "opacity" in liveNode) {
      (liveNode as GeometryMixin).opacity = staticNode.opacity;
    }
    if ("blendMode" in staticNode && "blendMode" in liveNode) {
      (liveNode as BlendMixin).blendMode = staticNode.blendMode;
    }
    if ("isMask" in staticNode && "isMask" in liveNode) {
      (liveNode as GeometryMixin).isMask = staticNode.isMask;
    }

    if ("maskType" in liveNode) {
      (liveNode as unknown as { maskType: MaskType }).maskType =
        resolveMaskType(staticNode);
    }
  } catch (e) {
    console.error("Error applying blend / maskType:", e);
  }
}

function applyBoolean(
  placeholder: SceneNode, // the temporary frame you created
  staticNode: FetchedNode,
  parentNode: BaseNode & ChildrenMixin // real parent on the canvas
): BooleanOperationNode | void {
  try {
    if (staticNode.type !== "BOOLEAN_OPERATION") return;

    // 1 – Validate we have enough shapes to combine
    const shapes = (placeholder as ChildrenMixin).children as SceneNode[];
    if (shapes.length < 2) {
      console.warn(
        `[applyBoolean] “${staticNode.name}” needs ≥2 children, got ${shapes.length}.`
      );
      return;
    }

    // 2 – Pick the helper that matches the JSON operator
    const op = (staticNode.booleanOperation ?? "UNION").toUpperCase();
    const opMap: Record<
      string,
      (nodes: SceneNode[], p: BaseNode & ChildrenMixin) => BooleanOperationNode
    > = {
      UNION: figma.union,
      SUBTRACT: figma.subtract,
      INTERSECT: figma.intersect,
      EXCLUDE: figma.exclude,
    };
    const builder = opMap[op] ?? figma.union;

    // 3 – Create the Boolean group in the correct parent & z-index
    let z = parentNode.children.indexOf(placeholder);
    const boolNode =
      z >= 0 ? builder(shapes, parentNode, z) : builder(shapes, parentNode);

    // 4 – Transfer metadata & clean up placeholder
    boolNode.name = staticNode.name ?? "Boolean";
    if ("touching" in staticNode)
      (boolNode as any).touching = staticNode.touching; // still supported in 2025 typings
    if (placeholder.parent) placeholder.remove();

    return boolNode;
  } catch (err) {
    console.error("applyBoolean →", err);
  }
}
