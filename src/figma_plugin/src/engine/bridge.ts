// @ts-nocheck
// Figma runtime objects use dynamic shapes not fully covered by typings.

type FetchedNode = Record<string, any>;
type XYWH = { x: number; y: number; width: number; height: number };
function clone(val) {
  return JSON.parse(JSON.stringify(val));
}

function det3(m: Mat3): number {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}


function inv3(m: Mat3): Mat3 | null {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const det = det3(m);
  if (Math.abs(det) < 1e-8) return null;

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
  [0, 1, 0],
  [0.5, 0.5, 1],
  [1, 1, 1],
];

function handlesToTransform(h: Vector[]): Transform {
  const D: Mat3 = [
    [h[0].x, h[1].x, h[2].x],
    [h[0].y, h[1].y, h[2].y],
    [1, 1, 1],
  ];

  const invD = inv3(D) ?? IDENTITY_HANDLES;
  const M = mul3(IDENTITY_HANDLES, invD);
  return [M[0] as any, M[1] as any];
}

function sanitisePathData(path: string): string {
  return (
    path
      .replace(/([MLHVCSQTAZmlhvcsqtaz])(?=[^\s,])/g, '$1 ')
      .replace(/([^\s,])([MLHVCSQTAZmlhvcsqtaz])/g, '$1 $2')
      .replace(/([0-9.])(-)/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function degFromMatrix(t: Transform): number {
  const [[a, b], [c, d]] = t;
  const radians = Math.atan2(c, a);
  return (radians * 180) / Math.PI;
}


function deltaDeg(a: number, b: number): number {
  return Math.abs(((a - b + 180) % 360) - 180);
}

export function tideFloat(n: number, eps = 1e-6): number {
  return Math.abs(n) < eps ? 0 : Number(n.toFixed(6));
}

function wantsAbsolute(staticNode: FetchedNode): boolean {
  return (
    (staticNode as any).layoutPositioning === 'ABSOLUTE' ||
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
      !wantsAbsolute(staticChild) ||
      !('layoutMode' in liveParent) ||
      liveParent.layoutMode === 'NONE' ||
      !('layoutPositioning' in liveChild)
    ) {
      return;
    }

    if ('layoutPositioning' in liveChild) {
      (liveChild as any).layoutPositioning = 'ABSOLUTE';
    }

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
    console.warn('finaliseAbsolutePositioning →', err);
  }
}

function formatPaint(p: any): Paint | undefined {
  if (!p?.type) return;

  const rgb = ({ r, g, b }: any): RGB => ({ r, g, b });
  const rgba = ({ r, g, b, a }: any): RGBA => ({ r, g, b, a: a ?? 1 });

  switch (p.type) {

    case 'SOLID': {
      if (!p.color) return;
      return {
        type: 'SOLID',
        color: rgb(p.color),
        opacity: p.opacity ?? p.color.a ?? 1,
        visible: p.visible ?? true,
        blendMode: p.blendMode,
      };
    }


    case 'IMAGE': {
      return {
        type: 'IMAGE',
        imageHash: p.imageHash,
        scaleMode: p.scaleMode ?? 'FILL',
        imageTransform: p.imageTransform ?? [
          [1, 0, 0],
          [0, 1, 0],
        ],
        opacity: p.opacity ?? 1,
        visible: p.visible ?? true,
      };
    }


    case 'GRADIENT_LINEAR':
    case 'GRADIENT_RADIAL':
    case 'GRADIENT_ANGULAR':
    case 'GRADIENT_DIAMOND': {
      if (!Array.isArray(p.gradientStops) || p.gradientStops.length < 2) return;

      const transform: Transform =
        p.gradientTransform ??
        (Array.isArray(p.gradientHandlePositions) &&
        p.gradientHandlePositions.length === 3
          ? handlesToTransform(p.gradientHandlePositions)
          : [
              [1, 0, 0],
              [0, 1, 0],
            ]);

      return {
        type: p.type,
        gradientTransform: transform,
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
  key: 'fills' | 'strokes',
  target: GeometryMixin,
  source: any
) => {
  if (!(key in source && key in target)) return;

  const rawArr = source[key] as any[];

  if (rawArr.length === 0) {
    (target as any)[key] = [];
    return;
  }

  const paints = rawArr
    .map(formatPaint)
    .filter((p): p is Paint => p !== undefined);

  (target as any)[key] = paints;
};


export async function createNode(
  staticNode: FetchedNode,
  parentNode: BaseNode & ChildrenMixin,
  staticParentNode: FetchedNode
): Promise<SceneNode | null> {
  const liveNode = await instantiateNode(staticNode);
  if (!liveNode) return null;

  applyCommonProps(liveNode, staticNode);
  applyVectorData(liveNode, staticNode);
  applyTransform(liveNode, staticNode, staticParentNode);
  applyGeometry(liveNode, staticNode);
  applyBackground(liveNode, staticNode);
  applyStrokeProps(liveNode, staticNode);
  applyShapeProps(liveNode, staticNode);
  await applyText(liveNode, staticNode);
  applyAutoLayout(liveNode, staticNode);
  applyConstraints(liveNode, staticNode);
  applyBlend(liveNode, staticNode);

  if (Array.isArray(staticNode.children) && 'appendChild' in liveNode) {
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

    if (staticNode.type === 'GROUP') {
      const group = figma.group(
        (liveNode as FrameNode).children,
        liveNode.parent as PageNode | (BaseNode & ChildrenMixin)
      );
      group.name = liveNode.name;
      liveNode.remove();
      return group;
    }

    if (staticNode.type === 'BOOLEAN_OPERATION') {
      const boolNode = applyBoolean(liveNode, staticNode, parentNode);
      if (boolNode) {
        applyCommonProps(boolNode, staticNode);
        applyTransform(boolNode, staticNode, staticParentNode);
        applyGeometry(boolNode, staticNode);
        applyBackground(boolNode, staticNode);
        applyBlend(boolNode, staticNode);
        return boolNode;
      }
    }
  }
  return liveNode;
}


async function instantiateNode(
  staticNode: FetchedNode
): Promise<SceneNode | null> {
  const map: Record<string, () => SceneNode> = {
    FRAME: () => figma.createFrame(),
    GROUP: () => figma.createFrame(),
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


function applyVectorData(liveNode: SceneNode, staticNode: FetchedNode) {
  try {
    if (staticNode.type !== 'VECTOR') return;
    const vector = liveNode as VectorNode;

    const hasFillGeo =
      Array.isArray(staticNode.fillGeometry) && staticNode.fillGeometry.length;
    const geo: any[] = hasFillGeo
      ? staticNode.fillGeometry
      : (staticNode.strokeGeometry ?? []);

    if (!geo.length) return;

    vector.vectorPaths = geo.map((g: any) => ({
      windingRule: (g.windingRule as WindingRule) ?? 'NONZERO',
      data: sanitisePathData(g.path as string),
    }));

    const strokePaints = Array.isArray(staticNode.strokes)
      ? clone(staticNode.strokes)
      : [];

    staticNode.fills = strokePaints.concat(staticNode.fills ?? []);
    staticNode.strokes = [];
    delete staticNode.strokeWeight;
  } catch (e) {
    console.error('applyVectorData →', e);
  }
}

function applyCommonProps(liveNode: SceneNode, staticNode: FetchedNode) {
  try {
    liveNode.name = staticNode.name ?? staticNode.type;
    if ('visible' in staticNode) liveNode.visible = staticNode.visible;
    if ('opacity' in staticNode) (liveNode as any).opacity = staticNode.opacity;
  } catch (e) {
    console.error('Error applying common props:', e);
  }
}

function applyTransform(
  liveNode: SceneNode,
  staticNode: FetchedNode,
  staticParentNode: FetchedNode
) {
  try {

    const parentIsAutoLayout =
      typeof staticParentNode.layoutMode === 'string' &&
      staticParentNode.layoutMode !== 'NONE';

    const absoluteLater = parentIsAutoLayout && wantsAbsolute(staticNode);


    const w =
      staticNode.size?.x ??
      staticNode.absoluteBoundingBox?.width ??
      liveNode.width;
    const h =
      staticNode.size?.y ??
      staticNode.absoluteBoundingBox?.height ??
      liveNode.height;

    if (
      'resize' in liveNode &&
      w != null &&
      h != null &&
      liveNode.type !== 'VECTOR'
    ) {
      (liveNode as LayoutMixin).resize(w, h);
    }


    const canEditXYNow = !parentIsAutoLayout && !absoluteLater;
    const isRoot =
      staticParentNode.type === 'DOCUMENT' || staticParentNode.type === 'PAGE';

    if (
      canEditXYNow &&
      Array.isArray(staticNode.relativeTransform) &&
      staticNode.relativeTransform.length === 2 &&
      !isRoot &&
      'relativeTransform' in liveNode
    ) {
      const M = staticNode.relativeTransform as Transform;


      const safe: Transform = [
        [tideFloat(M[0][0]), tideFloat(M[0][1]), tideFloat(M[0][2])],
        [tideFloat(M[1][0]), tideFloat(M[1][1]), tideFloat(M[1][2])],
      ];

      try {
        (liveNode as any).relativeTransform = safe;
        return;
      } catch (error) {
        console.error(
          'Error applying relativeTransform:',
          error,
          '→ falling back to absolute positioning'
        );
      }
    }

    if (canEditXYNow && staticNode.absoluteBoundingBox) {
      const { x, y } = staticNode.absoluteBoundingBox as XYWH;
      liveNode.x = x - (staticParentNode.absoluteBoundingBox?.x ?? 0);
      liveNode.y = y - (staticParentNode.absoluteBoundingBox?.y ?? 0);
      if (typeof staticNode.rotation === 'number') {
        const raw =
          Math.abs(staticNode.rotation) <= 2 * Math.PI
            ? (staticNode.rotation * 180) / Math.PI
            : staticNode.rotation;
        liveNode.rotation = raw;
      }
    }
  } catch (e) {
    console.error('Error applying transform:', e);
  }
}

function applyGeometry(liveNode: SceneNode, staticNode: FetchedNode) {
  try {
    const DEFAULT_GRADIENT_HANDLES: Vector[] = [
      { x: 0.0, y: 0.0 },
      { x: 1.0, y: 0.0 },
      { x: 0.0, y: 1.0 },
    ];

    if ('fills' in liveNode) {
      assignPaints('fills', liveNode as GeometryMixin, staticNode);
    }
    if ('strokes' in liveNode) {
      assignPaints('strokes', liveNode as GeometryMixin, staticNode);
    }

    if ('strokeWeight' in staticNode && 'strokeWeight' in liveNode) {
      (liveNode as GeometryMixin).strokeWeight = staticNode.strokeWeight;
    }
    if ('cornerRadius' in liveNode) {
      const tgt = liveNode as unknown as CornerMixin;

      const asNum = (v: any) => (typeof v === 'number' ? v : 0);

      if (
        Array.isArray(staticNode.rectangleCornerRadii) &&
        staticNode.rectangleCornerRadii.length === 4
      ) {
        const [tl, tr, br, bl] = staticNode.rectangleCornerRadii.map(asNum);
        tgt.topLeftRadius = tl;
        tgt.topRightRadius = tr;
        tgt.bottomRightRadius = br;
        tgt.bottomLeftRadius = bl;
      } else {
        if (staticNode.topLeftRadius !== undefined)
          tgt.topLeftRadius = asNum(staticNode.topLeftRadius);
        if (staticNode.topRightRadius !== undefined)
          tgt.topRightRadius = asNum(staticNode.topRightRadius);
        if (staticNode.bottomRightRadius !== undefined)
          tgt.bottomRightRadius = asNum(staticNode.bottomRightRadius);
        if (staticNode.bottomLeftRadius !== undefined)
          tgt.bottomLeftRadius = asNum(staticNode.bottomLeftRadius);
      }

      if (
        staticNode.rectangleCornerRadii === undefined &&
        staticNode.topLeftRadius === undefined &&
        staticNode.cornerRadius !== undefined
      ) {
        tgt.cornerRadius = asNum(staticNode.cornerRadius);
      }

      if (staticNode.cornerSmoothing !== undefined) {
        tgt.cornerSmoothing = staticNode.cornerSmoothing;
      }
    }
    if ('effects' in staticNode && 'effects' in liveNode) {
      (liveNode as GeometryMixin).effects = staticNode.effects;
    }
  } catch (e) {
    console.error('Error applying geometry:', e);
  }
}

function applyBackground(liveNode: SceneNode, staticNode: FetchedNode) {

  const hasBgInput =
    staticNode.backgroundColor != null ||
    (Array.isArray(staticNode.background) &&
      staticNode.background.length > 0) ||
    typeof staticNode.backgroundStyleId === 'string';
  if (!hasBgInput) return;


  if (liveNode.type === 'PAGE' || staticNode.type === 'PAGE') {
    if (staticNode.backgroundColor) {
      const { r, g, b } = staticNode.backgroundColor;
      (liveNode as PageNode).backgroundColor = { r, g, b };
    }
    if (
      typeof staticNode.backgroundStyleId === 'string' &&
      'backgroundStyleId' in liveNode
    ) {
      try {
        (liveNode as any).backgroundStyleId = staticNode.backgroundStyleId;
      } catch (err) {
        console.error('Error applying background style:', err);
      }
    }
    return;
  }


  if ('background' in liveNode) {
    const frameLike = liveNode as FrameNode | ComponentNode | InstanceNode;


    if (
      typeof staticNode.backgroundStyleId === 'string' &&
      'backgroundStyleId' in frameLike
    ) {
      try {
        (frameLike as any).backgroundStyleId = staticNode.backgroundStyleId;
      } catch {
        console.error(
          'Error applying background style:',
          staticNode.backgroundStyleId
        );
      }
    }


    if (Array.isArray(staticNode.background) && staticNode.background.length) {
      const paints = staticNode.background
        .map(formatPaint)
        .filter(Boolean) as Paint[];

      if (JSON.stringify(paints) !== JSON.stringify(frameLike.background)) {
        frameLike.background = paints;
      }
      return;
    }


    if (
      staticNode.backgroundColor &&
      (!frameLike.background || frameLike.background.length === 0) &&
      typeof staticNode.backgroundStyleId !== 'string'
    ) {
      const { r, g, b, a } = staticNode.backgroundColor;
      frameLike.background = [
        { type: 'SOLID', color: { r, g, b }, opacity: a ?? 1 },
      ];
    }
    return;
  }


  if ('fills' in liveNode) {
    const geo = liveNode as GeometryMixin & { fillStyleId?: string };

    const jsonHasPaint =
      (Array.isArray(staticNode.fills) && staticNode.fills.length > 0) ||
      typeof staticNode.fillStyleId === 'string';
    const liveHasPaint =
      (Array.isArray(geo.fills) && geo.fills.length > 0) ||
      typeof geo.fillStyleId === 'string';


    if (!liveHasPaint && staticNode.backgroundColor) {
      const { r, g, b, a } = staticNode.backgroundColor;
      geo.fills = [{ type: 'SOLID', color: { r, g, b }, opacity: a ?? 1 }];
    }
  }
}

function applyStrokeProps(liveNode: SceneNode, staticNode: FetchedNode) {
  if (!('strokes' in liveNode)) return;

  const target = liveNode as unknown as {
    strokeCap?: StrokeCap;
    strokeJoin?: StrokeJoin;
    strokeAlign?: StrokeAlign;
    dashPattern?: number[];
    strokeMiterLimit?: number;
  };

  if ('strokeCap' in staticNode) target.strokeCap = staticNode.strokeCap;
  if ('strokeJoin' in staticNode) target.strokeJoin = staticNode.strokeJoin;
  if ('strokeAlign' in staticNode) target.strokeAlign = staticNode.strokeAlign;
  if ('dashPattern' in staticNode) target.dashPattern = staticNode.dashPattern;
  if ('strokeMiterLimit' in staticNode)
    target.strokeMiterLimit = staticNode.strokeMiterLimit;

  const dash = Array.isArray(staticNode.dashPattern)
    ? staticNode.dashPattern
    : Array.isArray((staticNode as any).strokeDashes)
      ? (staticNode as any).strokeDashes
      : undefined;

  if (dash && dash.length) {
    target.dashPattern = [...dash];
  }

  const indivdualWeights = staticNode.individualStrokeWeights;
  if (!indivdualWeights || typeof indivdualWeights !== 'object') return;

  const top =
    typeof indivdualWeights.top === 'number' ? indivdualWeights.top : undefined;
  const right =
    typeof indivdualWeights.right === 'number'
      ? indivdualWeights.right
      : undefined;
  const bottom =
    typeof indivdualWeights.bottom === 'number'
      ? indivdualWeights.bottom
      : undefined;
  const left =
    typeof indivdualWeights.left === 'number'
      ? indivdualWeights.left
      : undefined;

  if ('individualStrokeWeights' in liveNode) {
    (liveNode as any).individualStrokeWeights = {
      top:
        top ??
        (liveNode as any).individualStrokeWeights?.top ??
        (liveNode as any).strokeWeight ??
        0,
      right:
        right ??
        (liveNode as any).individualStrokeWeights?.right ??
        (liveNode as any).strokeWeight ??
        0,
      bottom:
        bottom ??
        (liveNode as any).individualStrokeWeights?.bottom ??
        (liveNode as any).strokeWeight ??
        0,
      left:
        left ??
        (liveNode as any).individualStrokeWeights?.left ??
        (liveNode as any).strokeWeight ??
        0,
    };
    return;
  }

  if ('strokeTopWeight' in liveNode && top !== undefined)
    (liveNode as any).strokeTopWeight = top;
  if ('strokeRightWeight' in liveNode && right !== undefined)
    (liveNode as any).strokeRightWeight = right;
  if ('strokeBottomWeight' in liveNode && bottom !== undefined)
    (liveNode as any).strokeBottomWeight = bottom;
  if ('strokeLeftWeight' in liveNode && left !== undefined)
    (liveNode as any).strokeLeftWeight = left;
}

function applyShapeProps(liveNode: SceneNode, staticNode: FetchedNode) {
  switch (staticNode.type) {

    case 'ELLIPSE': {
      if ('arcData' in staticNode) {
        const src = staticNode.arcData;
        const inner =
          typeof src.innerRadius === 'number' && src.innerRadius > 1
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


    case 'RECTANGLE': {
      const r = liveNode as RectangleNode;

      if ('cornerSmoothing' in staticNode)
        r.cornerSmoothing = staticNode.cornerSmoothing;

      if (Array.isArray(staticNode.rectangleCornerRadii)) {
        const [tl, tr, br, bl] = staticNode.rectangleCornerRadii;
        r.topLeftRadius = tl;
        r.topRightRadius = tr;
        r.bottomRightRadius = br;
        r.bottomLeftRadius = bl;
      } else {
        if ('topLeftRadius' in staticNode)
          r.topLeftRadius = staticNode.topLeftRadius;
        if ('topRightRadius' in staticNode)
          r.topRightRadius = staticNode.topRightRadius;
        if ('bottomRightRadius' in staticNode)
          r.bottomRightRadius = staticNode.bottomRightRadius;
        if ('bottomLeftRadius' in staticNode)
          r.bottomLeftRadius = staticNode.bottomLeftRadius;
      }
      break;
    }


    case 'POLYGON': {
      const p = liveNode as PolygonNode;
      if ('pointCount' in staticNode) p.pointCount = staticNode.pointCount;
      if ('cornerRadius' in staticNode) {
        p.cornerRadius =
          staticNode.cornerRadius > 1
            ? staticNode.cornerRadius / 100
            : staticNode.cornerRadius;
      }
      if ('cornerSmoothing' in staticNode) {
        p.cornerSmoothing = staticNode.cornerSmoothing;
      }
      break;
    }


    case 'STAR': {
      const s = liveNode as StarNode;
      if ('pointCount' in staticNode) s.pointCount = staticNode.pointCount;
      if ('innerRadius' in staticNode)
        s.innerRadius =
          staticNode.innerRadius > 1
            ? staticNode.innerRadius / 100
            : staticNode.innerRadius;
      break;
    }


    case 'LINE':

      break;
  }
}

async function applyText(
  liveNode: SceneNode,
  staticNode: FetchedNode
): Promise<void> {
  if (staticNode.type !== 'TEXT') return;
  const txt = liveNode as TextNode;


  const FALLBACK_FAMILY = 'Inter';

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
        const regular: FontName = { family: FALLBACK_FAMILY, style: 'Regular' };
        await figma.loadFontAsync(regular);
        return regular;
      }
    }
  }

  const toPaints = (fills: any[] = []): Paint[] =>
    fills
      .filter((p) => p.type === 'SOLID' && p.color)
      .map((p) => ({
        type: 'SOLID',
        color: { r: p.color.r, g: p.color.g, b: p.color.b },
        opacity: p.opacity ?? p.color.a ?? 1,
      })) as Paint[];


  const rootStyle = staticNode.style ?? {};
  const overrides = staticNode.characterStyleOverrides ?? [];
  const table = staticNode.styleOverrideTable ?? {};

  const lookupFont = (s: any): FontName => ({
    family: s.fontFamily ?? (txt.fontName as FontName).family,
    style: s.fontStyle ?? (txt.fontName as FontName).style,
  });


  await figma.loadFontAsync(txt.fontName as FontName);
  const fontMap = new Map<string, FontName>();
  async function register(fn: FontName) {
    fontMap.set(JSON.stringify(fn), await loadFontOrFallback(fn));
  }
  await register(lookupFont(rootStyle));
  for (const s of Object.values(table)) await register(lookupFont(s as any));
  const safe = (fn: FontName) => fontMap.get(JSON.stringify(fn))!;


  txt.characters = staticNode.characters ?? '';
  txt.fontName = safe(lookupFont(rootStyle));
  if ('fontSize' in rootStyle) txt.fontSize = rootStyle.fontSize;


  txt.textAutoResize = (staticNode.textAutoResize ??
    rootStyle.textAutoResize ??
    'NONE') as any;



  const resolveAlignment = (): {
    h: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
    v: 'TOP' | 'CENTER' | 'BOTTOM';
  } => {
    const hRaw =
      staticNode.textAlignHorizontal ?? rootStyle.textAlignHorizontal ?? 'LEFT';
    const vRaw =
      staticNode.textAlignVertical ?? rootStyle.textAlignVertical ?? 'TOP';

    const normaliseAlign = (raw: any) => {
      if (typeof raw !== 'string') return undefined;
      const up = raw.toUpperCase();
      return up === 'MIDDLE' ? 'CENTER' : up;
    };

    const h = normaliseAlign(hRaw);
    const v = normaliseAlign(vRaw);

    const horiz: any = ['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'].includes(h!)
      ? h
      : 'LEFT';
    const vert: any = ['TOP', 'CENTER', 'BOTTOM'].includes(v!) ? v : 'TOP';
    return { h: horiz, v: vert };
  };
  const { h, v } = resolveAlignment();
  txt.textAlignHorizontal = h;
  if (txt.textAutoResize === 'NONE') {
    txt.textAlignVertical = v;
  }


  if ('textCase' in rootStyle) {
    try {
      txt.textCase = rootStyle.textCase;
    } catch {

    }
  }
  if ('textDecoration' in rootStyle)
    txt.textDecoration = rootStyle.textDecoration;
  if ('paragraphIndent' in rootStyle)
    txt.paragraphIndent = rootStyle.paragraphIndent;
  if ('paragraphSpacing' in rootStyle)
    txt.paragraphSpacing = rootStyle.paragraphSpacing;

  if (rootStyle.lineHeightUnit === 'AUTO') {
    txt.lineHeight = { unit: 'AUTO' };
  } else if ('lineHeightPx' in rootStyle) {
    txt.lineHeight = { value: rootStyle.lineHeightPx, unit: 'PIXELS' };
  } else if ('lineHeightPercent' in rootStyle) {
    txt.lineHeight = { value: rootStyle.lineHeightPercent, unit: 'PERCENT' };
  }

  if ('letterSpacing' in rootStyle) {
    txt.letterSpacing = {
      value: rootStyle.letterSpacing,
      unit: rootStyle.letterSpacingUnit === 'PERCENT' ? 'PERCENT' : 'PIXELS',
    };
  }

  if (
    (staticNode.leadingTrim !== undefined ||
      rootStyle.leadingTrim !== undefined) &&
    'leadingTrim' in txt
  ) {
    try {
      (txt as any).leadingTrim =
        staticNode.leadingTrim ?? rootStyle.leadingTrim;
    } catch (err) {
      console.warn('applyText → could not set leadingTrim:', err);
    }
  }


  if ('fills' in staticNode && (!txt.fills || txt.fills.length === 0)) {
    const paints = toPaints(staticNode.fills);
    if (paints.length) txt.fills = paints;
  }


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
        if ('fontSize' in o) txt.setRangeFontSize(start, end, o.fontSize);
        if ('textCase' in o) {
          try {
            txt.setRangeTextCase(start, end, o.textCase);
          } catch {}
        }
        if ('textDecoration' in o)
          txt.setRangeTextDecoration(start, end, o.textDecoration);

        if (o.lineHeightUnit === 'AUTO') {
          txt.setRangeLineHeight(start, end, { unit: 'AUTO' });
        } else if ('lineHeightPx' in o) {
          txt.setRangeLineHeight(start, end, {
            value: o.lineHeightPx,
            unit: 'PIXELS',
          });
        } else if ('lineHeightPercent' in o) {
          txt.setRangeLineHeight(start, end, {
            value: o.lineHeightPercent,
            unit: 'PERCENT',
          });
        }

        if ('letterSpacing' in o) {
          txt.setRangeLetterSpacing(start, end, {
            value: o.letterSpacing,
            unit: o.letterSpacingUnit === 'PERCENT' ? 'PERCENT' : 'PIXELS',
          });
        }

        if (Array.isArray(o.fills) && o.fills.length) {
          txt.setRangeFills(start, end, toPaints(o.fills));
        }
        if ('inheritFillStyleId' in o) {
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
    if ('clipsContent' in liveNode) {
      const clip =
        (staticNode as any).clipsContent ?? (staticNode as any).clipContent;
      if (typeof clip === 'boolean') {
        (liveNode as FrameNode).clipsContent = clip;
      }
    }

    if (!('layoutMode' in staticNode) || !('layoutMode' in liveNode)) return;
    const frame = liveNode as FrameNode;


    frame.layoutMode = staticNode.layoutMode;
    const isContainer = frame.layoutMode !== 'NONE';


    if (isContainer) {
      if (
        'layoutSizingHorizontal' in staticNode &&
        staticNode.layoutSizingHorizontal !== 'FILL'
      ) {
        frame.layoutSizingHorizontal = staticNode.layoutSizingHorizontal as any;
      }
      if (
        'layoutSizingVertical' in staticNode &&
        staticNode.layoutSizingVertical !== 'FILL'
      ) {
        frame.layoutSizingVertical = staticNode.layoutSizingVertical as any;
      }

      if ('primaryAxisSizingMode' in staticNode)
        frame.primaryAxisSizingMode = staticNode.primaryAxisSizingMode;
      if ('counterAxisSizingMode' in staticNode)
        frame.counterAxisSizingMode = staticNode.counterAxisSizingMode;

      if ('primaryAxisAlignItems' in staticNode)
        frame.primaryAxisAlignItems = staticNode.primaryAxisAlignItems;
      if ('counterAxisAlignItems' in staticNode)
        frame.counterAxisAlignItems = staticNode.counterAxisAlignItems;
      if ('layoutWrap' in staticNode) frame.layoutWrap = staticNode.layoutWrap;
      if ('counterAxisSpacing' in staticNode)
        frame.counterAxisSpacing = staticNode.counterAxisSpacing ?? 0;


      if (staticNode.layoutMode === 'GRID') {
        if ('gridRowCount' in staticNode)
          frame.gridRowCount = staticNode.gridRowCount;
        if ('gridColumnCount' in staticNode)
          frame.gridColumnCount = staticNode.gridColumnCount;
        if ('gridRowGap' in staticNode)
          frame.gridRowGap = staticNode.gridRowGap;
        if ('gridColumnGap' in staticNode)
          frame.gridColumnGap = staticNode.gridColumnGap;
        if ('gridColumnsSizing' in staticNode)
          frame.gridColumnsSizing = staticNode.gridColumnsSizing;
        if ('gridRowsSizing' in staticNode)
          frame.gridRowsSizing = staticNode.gridRowsSizing;
      }


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

  } catch (err) {
    console.error('applyAutoLayout →', err);
  }
}

function applyConstraints(
  liveNode: SceneNode,
  staticNode: FetchedNode,
  parent?: BaseNode & ChildrenMixin
) {
  try {
    if ('constraints' in staticNode) {
      liveNode.setPluginData?.(
        '__constraints',
        JSON.stringify(staticNode.constraints)
      );
    }

    const parentIsAutoLayout =
      parent &&
      'layoutMode' in parent &&
      (parent as FrameNode).layoutMode !== 'NONE';

    if (parentIsAutoLayout) {
      if ('layoutAlign' in staticNode && 'layoutAlign' in liveNode)
        (liveNode as any).layoutAlign = staticNode.layoutAlign;
      if ('layoutGrow' in staticNode && 'layoutGrow' in liveNode)
        (liveNode as any).layoutGrow = staticNode.layoutGrow;

      if (
        'layoutSizingHorizontal' in staticNode &&
        'layoutSizingHorizontal' in liveNode
      )
        (liveNode as any).layoutSizingHorizontal =
          staticNode.layoutSizingHorizontal;
      if (
        'layoutSizingVertical' in staticNode &&
        'layoutSizingVertical' in liveNode
      )
        (liveNode as any).layoutSizingVertical =
          staticNode.layoutSizingVertical;
    }
  } catch (err) {
    console.error('applyConstraints →', err);
  }
}

function resolveMaskType(staticNode: FetchedNode): MaskType {
  if (typeof staticNode.maskType === 'string') {
    const t = staticNode.maskType.toUpperCase();
    if (t === 'ALPHA' || t === 'VECTOR' || t === 'LUMINANCE')
      return t as MaskType;
  }
  if (staticNode.isMaskOutline === true) return 'VECTOR';
  return 'ALPHA';
}

function applyBlend(liveNode: SceneNode, staticNode: FetchedNode) {
  try {
    if ('opacity' in staticNode && 'opacity' in liveNode) {
      (liveNode as GeometryMixin).opacity = staticNode.opacity;
    }
    if ('blendMode' in staticNode && 'blendMode' in liveNode) {
      (liveNode as BlendMixin).blendMode = staticNode.blendMode;
    }
    if ('isMask' in staticNode && 'isMask' in liveNode) {
      (liveNode as GeometryMixin).isMask = staticNode.isMask;
    }

    if ('maskType' in liveNode) {
      (liveNode as unknown as { maskType: MaskType }).maskType =
        resolveMaskType(staticNode);
    }
  } catch (e) {
    console.error('Error applying blend / maskType:', e);
  }
}

function applyBoolean(
  placeholder: SceneNode,
  staticNode: FetchedNode,
  parentNode: BaseNode & ChildrenMixin
): BooleanOperationNode | void {
  try {
    if (staticNode.type !== 'BOOLEAN_OPERATION') return;

    const shapes = (placeholder as ChildrenMixin).children as SceneNode[];
    if (shapes.length < 2) {
      console.warn(
        `[applyBoolean] “${staticNode.name}” needs ≥2 children, got ${shapes.length}.`
      );
      return;
    }

    const op = (staticNode.booleanOperation ?? 'UNION').toUpperCase();
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

    let z = parentNode.children.indexOf(placeholder);
    const boolNode =
      z >= 0 ? builder(shapes, parentNode, z) : builder(shapes, parentNode);

    boolNode.name = staticNode.name ?? 'Boolean';
    if ('touching' in staticNode)
      (boolNode as any).touching = staticNode.touching;
    if (placeholder.parent) placeholder.remove();

    return boolNode;
  } catch (err) {
    console.error('applyBoolean →', err);
  }
}
