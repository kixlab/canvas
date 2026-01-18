import {
  makeGradientPaint,
  makeShadowEffect,
  makeSolidPaint,
  safeParseFloat,
} from '../utils';

export async function setFillColor(params: {
  nodeId: string;
  color: { r: number; g: number; b: number; a: number };
}) {
  const {
    nodeId,
    color: { r, g, b, a },
  } = params || {};

  if (!nodeId) {
    throw new Error('Missing nodeId parameter');
  }

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error(`Node not found with ID: ${nodeId}`);
  }

  if (!('fills' in node)) {
    throw new Error(`Node does not support fills: ${nodeId}`);
  }

  const rgbColor = {
    r: safeParseFloat(r),
    g: safeParseFloat(g),
    b: safeParseFloat(b),
    a: safeParseFloat(a, 1),
  };

  const paintStyle = makeSolidPaint(rgbColor);

  node.fills = [paintStyle];

  return {
    id: node.id,
    name: node.name,
    fills: [paintStyle],
  };
}

interface SetCornerRadiusResult {
  id: string;
  name: string;
  cornerRadius?: number;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomRightRadius?: number;
  bottomLeftRadius?: number;
}

export async function setCornerRadius(params: {
  nodeId: string;
  radius: number;
  corners?: [boolean, boolean, boolean, boolean];
}): Promise<SetCornerRadiusResult> {
  const { nodeId, radius, corners } = params || {};

  if (!nodeId) {
    throw new Error('Missing nodeId parameter');
  }
  if (radius === undefined) {
    throw new Error('Missing radius parameter');
  }

  const node = (await figma.getNodeByIdAsync(nodeId)) as
    | (SceneNode & CornerMixin)
    | null
    | any;

  if (!node) {
    throw new Error(`Node not found with ID: ${nodeId}`);
  }

  if (!('cornerRadius' in node)) {
    throw new Error(`Node does not support corner radius: ${nodeId}`);
  }

  if (corners && Array.isArray(corners) && corners.length === 4) {
    if ('topLeftRadius' in node) {
      if (corners[0]) node.topLeftRadius = radius;
      if (corners[1]) node.topRightRadius = radius;
      if (corners[2]) node.bottomRightRadius = radius;
      if (corners[3]) node.bottomLeftRadius = radius;
    } else {
      node.cornerRadius = radius;
    }
  } else {
    node.cornerRadius = radius;
  }

  return {
    id: node.id,
    name: node.name,
    cornerRadius: 'cornerRadius' in node ? node.cornerRadius : undefined,
    topLeftRadius: 'topLeftRadius' in node ? node.topLeftRadius : undefined,
    topRightRadius: 'topRightRadius' in node ? node.topRightRadius : undefined,
    bottomRightRadius:
      'bottomRightRadius' in node ? node.bottomRightRadius : undefined,
    bottomLeftRadius:
      'bottomLeftRadius' in node ? node.bottomLeftRadius : undefined,
  };
}

export async function getStyles() {
  const styles = {
    colors: await figma.getLocalPaintStylesAsync(),
    texts: await figma.getLocalTextStylesAsync(),
    effects: await figma.getLocalEffectStylesAsync(),
    grids: await figma.getLocalGridStylesAsync(),
  };

  return {
    colors: styles.colors.map((style) => ({
      id: style.id,
      name: style.name,
      key: style.key,
      paint: style.paints[0],
    })),
    texts: styles.texts.map((style) => ({
      id: style.id,
      name: style.name,
      key: style.key,
      fontSize: style.fontSize,
      fontName: style.fontName,
    })),
    effects: styles.effects.map((style) => ({
      id: style.id,
      name: style.name,
      key: style.key,
    })),
    grids: styles.grids.map((style) => ({
      id: style.id,
      name: style.name,
      key: style.key,
    })),
  };
}

export async function setOpacity(params: { nodeId: string; opacity: number }) {
  const { nodeId, opacity } = params;
  if (!nodeId) throw new Error('Missing nodeId parameter');

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`Node not found with ID: ${nodeId}`);

  if (!('opacity' in node)) throw new Error(`Node has no opacity property`);

  node.opacity = Math.max(0, Math.min(1, opacity));

  return { id: node.id, name: node.name, opacity: node.opacity };
}

export async function setStroke(params: {
  nodeId: string;
  color: { r: number; g: number; b: number; a: number };
  weight?: number;
  align?: 'CENTER' | 'INSIDE' | 'OUTSIDE';
}) {
  const { nodeId, color, weight, align = 'CENTER' } = params;
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (!('strokes' in node)) throw new Error('Node does not support strokes');

  node.strokes = [makeSolidPaint(color)];
  if ('strokeWeight' in node && weight !== undefined)
    node.strokeWeight = weight;
  if ('strokeAlign' in node) node.strokeAlign = align;

  return {
    id: node.id,
    name: node.name,
    strokes: node.strokes,
    strokeWeight: 'strokeWeight' in node ? node.strokeWeight : undefined,
    strokeAlign: 'strokeAlign' in node ? node.strokeAlign : undefined,
  };
}

export async function setFillGradient(params: {
  nodeId: string;
  gradientStops: {
    r: number;
    g: number;
    b: number;
    a?: number;
    position: number;
  }[];
  gradientType?: GradientPaint['type'];
  angle: number;
}) {
  const {
    nodeId,
    gradientStops,
    gradientType = 'GRADIENT_LINEAR',
    angle,
  } = params;
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (!('fills' in node)) throw new Error('Node does not support fills');

  node.fills = [makeGradientPaint(gradientStops, gradientType, angle)];
  return { id: node.id, name: node.name, fills: node.fills };
}

export async function setDropShadow(params: {
  nodeId: string;
  shadowColor: {
    r: number;
    g: number;
    b: number;
    a?: number;
  };
  offsetX: number;
  offsetY: number;
  radius: number;
  spread?: number;
}) {
  const node = await figma.getNodeByIdAsync(params.nodeId);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);
  if (!('effects' in node)) throw new Error('Node does not support effects');

  const shadow = makeShadowEffect(params, 'DROP_SHADOW');
  node.effects = [
    ...node.effects.filter((e) => e.type !== 'DROP_SHADOW'),
    shadow,
  ];

  return { id: node.id, name: node.name, effects: node.effects };
}

export async function setInnerShadow(params: {
  nodeId: string;
  shadowColor: {
    r: number;
    g: number;
    b: number;
    a?: number;
  };
  offsetX: number;
  offsetY: number;
  radius: number;
  spread?: number;
}) {
  const node = await figma.getNodeByIdAsync(params.nodeId);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);
  if (!('effects' in node)) throw new Error('Node does not support effects');

  const shadow = makeShadowEffect(params, 'INNER_SHADOW');
  node.effects = [
    ...node.effects.filter((e) => e.type !== 'INNER_SHADOW'),
    shadow,
  ];

  return { id: node.id, name: node.name, effects: node.effects };
}

export async function copyStyle(params: {
  sourceNodeId: string;
  targetNodeId: string;
  properties?: ('fills' | 'strokes' | 'effects' | 'cornerRadius' | 'opacity')[];
}) {
  const { sourceNodeId, targetNodeId, properties } = params;
  const src = await figma.getNodeByIdAsync(sourceNodeId);
  const dst = await figma.getNodeByIdAsync(targetNodeId);

  if (!src || !dst) throw new Error('Source or target node not found');

  const props = properties ?? [
    'fills',
    'strokes',
    'effects',
    'cornerRadius',
    'opacity',
  ];

  props.forEach((prop) => {
    if (prop in src && prop in dst) {
      // @ts-ignore
      dst[prop] = src[prop];
    }
  });

  return {
    sourceName: src.name,
    targetName: dst.name,
    copied: props,
  };
}

export async function setBlendMode(params: {
  nodeId: string;
  blendMode: BlendMode;
}) {
  const { nodeId, blendMode } = params ?? {};
  if (!nodeId) throw new Error('Missing nodeId parameter');

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (!('blendMode' in node))
    throw new Error(`Node does not support blendMode: ${nodeId}`);

  node.blendMode = blendMode;

  return { id: node.id, name: node.name, blendMode: node.blendMode };
}
