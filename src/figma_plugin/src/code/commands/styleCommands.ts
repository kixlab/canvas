import { makeSolidPaint, safeParseFloat } from '../utils';

export async function setFillColor(params: {
  nodeId: string;
  color: { r: number; g: number; b: number; a: number };
}) {
  console.log('setFillColor', params);
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

  // Create RGBA color
  const rgbColor = {
    r: safeParseFloat(r),
    g: safeParseFloat(g),
    b: safeParseFloat(b),
    a: safeParseFloat(a, 1),
  };

  // Set fill
  const paintStyle = makeSolidPaint(rgbColor);

  console.log('paintStyle', paintStyle);

  node.fills = [paintStyle];

  return {
    id: node.id,
    name: node.name,
    fills: [paintStyle],
  };
}

export async function setStrokeColor(params: {
  nodeId: string;
  color: { r: number; g: number; b: number; a: number };
  weight?: number;
}) {
  const {
    nodeId,
    color: { r, g, b, a },
    weight = 1,
  } = params || {};

  if (!nodeId) {
    throw new Error('Missing nodeId parameter');
  }

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error(`Node not found with ID: ${nodeId}`);
  }

  if (!('strokes' in node)) {
    throw new Error(`Node does not support strokes: ${nodeId}`);
  }

  // Create RGBA color
  const rgbColor = {
    r: r !== undefined ? r : 0,
    g: g !== undefined ? g : 0,
    b: b !== undefined ? b : 0,
    a: a !== undefined ? a : 1,
  };

  // Set stroke
  const paintStyle = makeSolidPaint(rgbColor);

  node.strokes = [paintStyle];

  // Set stroke weight if available
  if ('strokeWeight' in node) {
    node.strokeWeight = weight;
  }

  return {
    id: node.id,
    name: node.name,
    strokes: node.strokes,
    strokeWeight: 'strokeWeight' in node ? node.strokeWeight : undefined,
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
    | any; // `any` keeps the original property checks simple

  if (!node) {
    throw new Error(`Node not found with ID: ${nodeId}`);
  }

  // Check if node supports corner radius
  if (!('cornerRadius' in node)) {
    throw new Error(`Node does not support corner radius: ${nodeId}`);
  }

  // If corners array provided, set individual radii where possible
  if (corners && Array.isArray(corners) && corners.length === 4) {
    if ('topLeftRadius' in node) {
      if (corners[0]) node.topLeftRadius = radius;
      if (corners[1]) node.topRightRadius = radius;
      if (corners[2]) node.bottomRightRadius = radius;
      if (corners[3]) node.bottomLeftRadius = radius;
    } else {
      node.cornerRadius = radius; // only uniform radius supported
    }
  } else {
    node.cornerRadius = radius; // uniform radius
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
