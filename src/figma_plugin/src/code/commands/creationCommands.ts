import {
  getAbsoluteGeometry,
  getLocalPosition,
  makeSolidPaint,
} from '../utils';
import { hasAppendChild } from '../figma-api';

export async function createRectangle(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  parentId?: string;
}) {
  const { x, y, width, height, name, parentId } = params || {};

  const rect = figma.createRectangle();
  rect.x = x;
  rect.y = y;
  rect.resize(width, height);
  rect.name = name;

  // If parentId is provided, append to that node, otherwise append to current page
  if (parentId) {
    const parentNode = await figma.getNodeByIdAsync(parentId);
    if (!parentNode) {
      throw new Error(`Parent node not found with ID: ${parentId}`);
    }
    if (hasAppendChild(parentNode)) {
      parentNode.appendChild(rect);
      // set the rectangle's position relative to the parent
      const [localX, localY] = getLocalPosition(
        x,
        y,
        parentNode as BaseNode & ChildrenMixin
      );
      rect.x = localX;
      rect.y = localY;
    } else {
      throw new Error(`Parent node does not support children: ${parentId}`);
    }
  } else {
    figma.currentPage.appendChild(rect);
  }

  const [newX, newY] = getAbsoluteGeometry(rect as SceneNode);

  return {
    id: rect.id,
    name: rect.name,
    x: newX,
    y: newY,
    width: rect.width,
    height: rect.height,
    parentId: rect.parent ? rect.parent.id : undefined,
  };
}

export async function createFrame(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  parentId?: string;
  fillColor?: any;
  strokeColor?: any;
  strokeWeight?: number;
  layoutMode?: string;
  layoutWrap?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  itemSpacing?: number;
}) {
  const {
    x,
    y,
    width,
    height,
    name,
    parentId,
    fillColor,
    strokeColor,
    strokeWeight,
    layoutMode = 'NONE',
    layoutWrap = 'NO_WRAP',
    paddingTop = 10,
    paddingRight = 10,
    paddingBottom = 10,
    paddingLeft = 10,
    primaryAxisAlignItems = 'MIN',
    counterAxisAlignItems = 'MIN',
    layoutSizingHorizontal = 'FIXED',
    layoutSizingVertical = 'FIXED',
    itemSpacing = 0,
  } = params || {};

  const frame = figma.createFrame();
  frame.x = x;
  frame.y = y;
  frame.resize(width, height);
  frame.name = name;

  // Set layout mode if provided
  if (layoutMode !== 'NONE') {
    frame.layoutMode = layoutMode as any;
    frame.layoutWrap = layoutWrap as any;

    // Set padding values only when layoutMode is not NONE
    frame.paddingTop = paddingTop;
    frame.paddingRight = paddingRight;
    frame.paddingBottom = paddingBottom;
    frame.paddingLeft = paddingLeft;

    // Set axis alignment only when layoutMode is not NONE
    frame.primaryAxisAlignItems = primaryAxisAlignItems as any;
    frame.counterAxisAlignItems = counterAxisAlignItems as any;

    // Set layout sizing only when layoutMode is not NONE
    frame.layoutSizingHorizontal = layoutSizingHorizontal as any;
    frame.layoutSizingVertical = layoutSizingVertical as any;

    // Set item spacing only when layoutMode is not NONE
    frame.itemSpacing = itemSpacing;
  }

  // Set fill color if provided
  if (fillColor) {
    const paintStyle = makeSolidPaint(fillColor);
    frame.fills = [paintStyle];
  }

  // Set stroke color and weight if provided
  if (strokeColor) {
    const strokeStyle = makeSolidPaint(strokeColor);
    frame.strokes = [strokeStyle];
  }

  // Set stroke weight if provided
  if (strokeWeight !== undefined) {
    frame.strokeWeight = strokeWeight;
  }

  // If parentId is provided, append to that node, otherwise append to current page
  if (parentId) {
    const parentNode = await figma.getNodeByIdAsync(parentId);
    if (!parentNode) {
      throw new Error(`Parent node not found with ID: ${parentId}`);
    }
    if (hasAppendChild(parentNode)) {
      parentNode.appendChild(frame);
      const [localX, localY] = getLocalPosition(
        x,
        y,
        parentNode as BaseNode & ChildrenMixin
      );
      frame.x = localX;
      frame.y = localY;
    } else {
      throw new Error(`Parent node does not support children: ${parentId}`);
    }
  } else {
    figma.currentPage.appendChild(frame);
  }

  const [newX, newY] = getAbsoluteGeometry(frame as SceneNode);

  return {
    id: frame.id,
    name: frame.name,
    x: newX,
    y: newY,
    width: frame.width,
    height: frame.height,
    fills: frame.fills,
    strokes: frame.strokes,
    strokeWeight: frame.strokeWeight,
    layoutMode: frame.layoutMode,
    layoutWrap: frame.layoutWrap,
    parentId: frame.parent ? frame.parent.id : undefined,
  };
}

export async function createText(params: {
  x: number;
  y: number;
  text: string;
  name: string;
  fontSize?: number;
  fontWeight?: number;
  fontColor?: any;
  parentId?: string;
}) {
  const {
    x,
    y,
    text,
    name,
    fontSize = 14,
    fontWeight = 400,
    fontColor = { r: 0, g: 0, b: 0, a: 1 }, // Default to black
    parentId,
  } = params || {};

  // Map common font weights to Figma font styles
  const getFontStyle = (weight: number) => {
    switch (weight) {
      case 100:
        return 'Thin';
      case 200:
        return 'Extra Light';
      case 300:
        return 'Light';
      case 400:
        return 'Regular';
      case 500:
        return 'Medium';
      case 600:
        return 'Semi Bold';
      case 700:
        return 'Bold';
      case 800:
        return 'Extra Bold';
      case 900:
        return 'Black';
      default:
        return 'Regular';
    }
  };

  const textNode = figma.createText();
  textNode.x = x;
  textNode.y = y;
  textNode.name = name || text;
  try {
    await figma.loadFontAsync({
      family: 'Inter',
      style: getFontStyle(fontWeight),
    });
    textNode.fontName = { family: 'Inter', style: getFontStyle(fontWeight) };
    textNode.fontSize =
      typeof fontSize === 'string' ? parseInt(fontSize) : fontSize;
  } catch (error) {
    console.error('Error setting font size', error);
  }
  textNode.characters = text;

  // Set text color
  const paintStyle = makeSolidPaint(fontColor);
  textNode.fills = [paintStyle];

  // If parentId is provided, append to that node, otherwise append to current page
  if (parentId) {
    const parentNode = await figma.getNodeByIdAsync(parentId);
    if (!parentNode) {
      throw new Error(`Parent node not found with ID: ${parentId}`);
    }
    if (hasAppendChild(parentNode)) {
      parentNode.appendChild(textNode);
      const [localX, localY] = getLocalPosition(
        x,
        y,
        parentNode as BaseNode & ChildrenMixin
      );
      textNode.x = localX;
      textNode.y = localY;
    } else {
      throw new Error(`Parent node does not support children: ${parentId}`);
    }
  } else {
    figma.currentPage.appendChild(textNode);
  }

  const [newX, newY] = getAbsoluteGeometry(textNode as SceneNode);

  return {
    id: textNode.id,
    name: textNode.name,
    x: newX,
    y: newY,
    width: textNode.width,
    height: textNode.height,
    characters: textNode.characters,
    fontSize: textNode.fontSize,
    fontWeight: fontWeight,
    fontColor: fontColor,
    fontName: textNode.fontName,
    fills: textNode.fills,
    parentId: textNode.parent ? textNode.parent.id : undefined,
  };
}

export async function createGraphic(params: {
  svg: string;
  name: string;
  x: number;
  y: number;
  parentId?: string;
}) {
  const { svg, name, x, y, parentId } = params || {};

  if (!svg) {
    throw new Error('An SVG string must be provided.');
  }

  const node = figma.createNodeFromSvg(svg);

  node.x = x;
  node.y = y;
  node.name = name;

  let returnNode: SceneNode = node;

  if (node.children.length === 1) {
    const child = node.children[0];
    if (parentId) {
      const parent = await figma.getNodeByIdAsync(parentId);
      if (parent && 'appendChild' in parent) {
        (parent as BaseNode & ChildrenMixin).appendChild(child);
        const [localX, localY] = getLocalPosition(
          x,
          y,
          parent as BaseNode & ChildrenMixin
        );
        child.x = localX;
        child.y = localY;
      }
    } else {
      figma.currentPage.appendChild(child);
    }
    child.x = x;
    child.y = y;
    node.remove();
    returnNode = child;
  } else {
    if (parentId) {
      const parent = await figma.getNodeByIdAsync(parentId);
      if (parent && 'appendChild' in parent) {
        (parent as BaseNode & ChildrenMixin).appendChild(node);
      }
    }
  }

  const [newX, newY] = getAbsoluteGeometry(returnNode as SceneNode);

  return {
    id: returnNode.id,
    name: returnNode.name,
    x: newX,
    y: newY,
    width: returnNode.width,
    height: returnNode.height,
    parentId: returnNode.parent ? returnNode.parent.id : undefined,
  };
}

export async function createEllipse(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  parentId?: string;
  fillColor?: RGB | RGBA;
  strokeColor?: RGB | RGBA;
  strokeWeight?: number;
}) {
  const {
    x,
    y,
    width,
    height,
    name,
    parentId,
    fillColor,
    strokeColor,
    strokeWeight,
  } = params || {};

  const ellipse = figma.createEllipse();
  ellipse.x = x;
  ellipse.y = y;
  ellipse.resize(width, height);
  ellipse.name = name;

  if (fillColor) {
    ellipse.fills = [makeSolidPaint(fillColor)];
  }
  if (strokeColor) {
    ellipse.strokes = [makeSolidPaint(strokeColor)];
  }
  if (strokeWeight !== undefined) {
    ellipse.strokeWeight = strokeWeight;
  }

  if (parentId) {
    const parentNode = await figma.getNodeByIdAsync(parentId);
    if (!parentNode) {
      throw new Error(`Parent node not found with ID: ${parentId}`);
    }
    if (hasAppendChild(parentNode)) {
      parentNode.appendChild(ellipse);
      const [localX, localY] = getLocalPosition(
        x,
        y,
        parentNode as BaseNode & ChildrenMixin
      );
      ellipse.x = localX;
      ellipse.y = localY;
    } else {
      throw new Error(`Parent node does not support children: ${parentId}`);
    }
  } else {
    figma.currentPage.appendChild(ellipse);
  }

  const [newX, newY] = getAbsoluteGeometry(ellipse as SceneNode);

  return {
    id: ellipse.id,
    name: ellipse.name,
    x: newX,
    y: newY,
    width: ellipse.width,
    height: ellipse.height,
    fills: ellipse.fills,
    strokes: ellipse.strokes,
    strokeWeight: ellipse.strokeWeight,
    parentId: ellipse.parent ? ellipse.parent.id : undefined,
  };
}

export async function createPolygon(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  pointCount: number;
  name: string;
  parentId?: string;
  fillColor?: any;
  strokeColor?: any;
  strokeWeight?: number;
}) {
  const {
    x,
    y,
    width,
    height,
    pointCount,
    name,
    parentId,
    fillColor,
    strokeColor,
    strokeWeight,
  } = params || {};

  const polygon = figma.createPolygon();
  polygon.x = x;
  polygon.y = y;
  polygon.resize(width, height);
  polygon.pointCount = pointCount;
  polygon.name = name;

  if (fillColor) polygon.fills = [makeSolidPaint(fillColor)];
  if (strokeColor) polygon.strokes = [makeSolidPaint(strokeColor)];
  if (strokeWeight !== undefined) polygon.strokeWeight = strokeWeight;

  if (parentId) {
    const parentNode = await figma.getNodeByIdAsync(parentId);
    if (!parentNode)
      throw new Error(`Parent node not found with ID: ${parentId}`);
    if (hasAppendChild(parentNode)) {
      parentNode.appendChild(polygon);
      const [localX, localY] = getLocalPosition(
        x,
        y,
        parentNode as BaseNode & ChildrenMixin
      );
      polygon.x = localX;
      polygon.y = localY;
    } else
      throw new Error(`Parent node does not support children: ${parentId}`);
  } else {
    figma.currentPage.appendChild(polygon);
  }

  const [newX, newY] = getAbsoluteGeometry(polygon as SceneNode);

  return {
    id: polygon.id,
    name: polygon.name,
    x: newX,
    y: newY,
    width: polygon.width,
    height: polygon.height,
    pointCount: polygon.pointCount,
    fills: polygon.fills,
    strokes: polygon.strokes,
    strokeWeight: polygon.strokeWeight,
    parentId: polygon.parent ? polygon.parent.id : undefined,
  };
}

export async function createStar(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  pointCount: number;
  innerRadius?: number;
  parentId?: string;
  fillColor?: RGB | RGBA;
  strokeColor?: RGB | RGBA;
  strokeWeight?: number;
}) {
  const {
    x,
    y,
    width,
    height,
    name,
    pointCount,
    innerRadius = 50,
    parentId,
    fillColor,
    strokeColor,
    strokeWeight,
  } = params || {};

  const star = figma.createStar();
  star.x = x;
  star.y = y;
  star.resize(width, height);
  star.pointCount = pointCount;
  star.innerRadius = innerRadius;
  star.name = name;

  if (fillColor) star.fills = [makeSolidPaint(fillColor)];
  if (strokeColor) star.strokes = [makeSolidPaint(strokeColor)];
  if (strokeWeight !== undefined) star.strokeWeight = strokeWeight;

  if (parentId) {
    const parentNode = await figma.getNodeByIdAsync(parentId);
    if (!parentNode)
      throw new Error(`Parent node not found with ID: ${parentId}`);
    if (hasAppendChild(parentNode)) {
      parentNode.appendChild(star);
      const [localX, localY] = getLocalPosition(
        x,
        y,
        parentNode as BaseNode & ChildrenMixin
      );
      star.x = localX;
      star.y = localY;
    } else
      throw new Error(`Parent node does not support children: ${parentId}`);
  } else {
    figma.currentPage.appendChild(star);
  }

  return {
    id: star.id,
    name: star.name,
    x: star.x,
    y: star.y,
    width: star.width,
    height: star.height,
    pointCount: star.pointCount,
    innerRadius: star.innerRadius,
    fills: star.fills,
    strokes: star.strokes,
    strokeWeight: star.strokeWeight,
    parentId: star.parent ? star.parent.id : undefined,
  };
}

export async function createLine(params: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  name: string;
  parentId?: string;
  strokeColor?: RGB | RGBA;
  strokeWeight?: number;
  strokeCap?: StrokeCap; // NONE | ROUND | SQUARE
  dashPattern?: readonly number[]; // [dash, gap]
}) {
  const {
    startX,
    startY,
    endX,
    endY,
    name,
    parentId,
    strokeColor,
    strokeWeight = 1,
    strokeCap = 'NONE',
    dashPattern,
  } = params ?? {};

  // Calculate geometry
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.hypot(dx, dy);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  // Create the node
  const line = figma.createLine();
  line.name = name;
  line.resize(length, 0); // horizontal baseline
  line.rotation = angleDeg;

  // Style
  if (strokeColor) line.strokes = [makeSolidPaint(strokeColor)];
  line.strokeWeight = strokeWeight;
  line.strokeCap = strokeCap;
  if (dashPattern) line.dashPattern = dashPattern;

  // Parent / positioning
  const parent = parentId
    ? ((await figma.getNodeByIdAsync(parentId)) as SceneNode & ChildrenMixin)
    : figma.currentPage;

  if (parent && hasAppendChild(parent)) parent.appendChild(line);
  const [localX, localY] = getLocalPosition(startX, startY, parent);
  line.x = localX;
  line.y = localY;

  return {
    id: line.id,
    name: line.name,
    startX,
    startY,
    endX,
    endY,
    length,
    angle: angleDeg,
    strokeWeight: line.strokeWeight,
    strokeCap: line.strokeCap,
    dashPattern: line.dashPattern,
    parentId: line.parent ? line.parent.id : undefined,
  };
}

export async function createMask(params: {
  maskNodeId: string;
  contentNodeIds: string[];
  groupName?: string;
}) {
  const { maskNodeId, contentNodeIds, groupName } = params ?? {};
  if (!maskNodeId) throw new Error('Missing maskNodeId');
  if (!Array.isArray(contentNodeIds) || contentNodeIds.length === 0)
    throw new Error('contentNodeIds must contain at least one ID');

  // Fetch nodes
  const maskNode = (await figma.getNodeByIdAsync(maskNodeId)) as SceneNode;
  if (!maskNode) throw new Error(`Mask node not found: ${maskNodeId}`);

  const contentNodes: SceneNode[] = [];
  for (const id of contentNodeIds) {
    const n = (await figma.getNodeByIdAsync(id)) as SceneNode | null;
    if (!n) throw new Error(`Content node not found: ${id}`);
    if (id === maskNodeId)
      throw new Error('maskNodeId should not appear in contentNodeIds');
    contentNodes.push(n);
  }

  /* 1 . Turn the node into a mask */
  if ('isMask' in maskNode) (maskNode as any).isMask = true;
  else throw new Error('Chosen mask node cannot act as a mask');

  /* 2 . Group mask + content (mask goes first) */
  const parent =
    (maskNode.parent as (SceneNode & ChildrenMixin) | null) ??
    figma.currentPage;
  const grouped = figma.group([maskNode, ...contentNodes], parent);
  grouped.name = groupName ?? 'Mask Group';

  return {
    id: grouped.id,
    name: grouped.name,
    maskNodeId,
    contentNodeIds,
    parentId: parent.id,
  };
}
