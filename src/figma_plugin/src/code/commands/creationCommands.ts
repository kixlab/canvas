import { makeSolidPaint } from '../utils';
import { hasAppendChild } from '../figma-api';

export async function createRectangle(params: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  parentId?: string;
}) {
  const {
    x = 0,
    y = 0,
    width = 100,
    height = 100,
    name = 'Rectangle',
    parentId,
  } = params || {};

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
    } else {
      throw new Error(`Parent node does not support children: ${parentId}`);
    }
  } else {
    figma.currentPage.appendChild(rect);
  }

  return {
    id: rect.id,
    name: rect.name,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    parentId: rect.parent ? rect.parent.id : undefined,
  };
}

export async function createFrame(params: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
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
    x = 0,
    y = 0,
    width = 100,
    height = 100,
    name = 'Frame',
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
    } else {
      throw new Error(`Parent node does not support children: ${parentId}`);
    }
  } else {
    figma.currentPage.appendChild(frame);
  }

  return {
    id: frame.id,
    name: frame.name,
    x: frame.x,
    y: frame.y,
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
  x?: number;
  y?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  fontColor?: any;
  name?: string;
  parentId?: string;
}) {
  const {
    x = 0,
    y = 0,
    text = 'Text',
    fontSize = 14,
    fontWeight = 400,
    fontColor = { r: 0, g: 0, b: 0, a: 1 }, // Default to black
    name = '',
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
    } else {
      throw new Error(`Parent node does not support children: ${parentId}`);
    }
  } else {
    figma.currentPage.appendChild(textNode);
  }

  return {
    id: textNode.id,
    name: textNode.name,
    x: textNode.x,
    y: textNode.y,
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

export async function createVectorFromSVG(params: {
  svg: string;
  name?: string;
  x?: number;
  y?: number;
  parentId?: string;
}) {
  const { svg, name, x = 0, y = 0, parentId } = params || {};

  if (!svg) {
    throw new Error('An SVG string must be provided.');
  }

  const node = figma.createNodeFromSvg(svg);

  node.x = x;
  node.y = y;

  let returnNode: SceneNode = node;

  if (node.children.length === 1) {
    const child = node.children[0];
    if (parentId) {
      const parent = await figma.getNodeByIdAsync(parentId);
      if (parent && 'appendChild' in parent) {
        (parent as BaseNode & ChildrenMixin).appendChild(child);
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

  if (name) {
    returnNode.name = name;
  }

  return {
    id: returnNode.id,
    name: returnNode.name,
    x: returnNode.x,
    y: returnNode.y,
    width: returnNode.width,
    height: returnNode.height,
    parentId: returnNode.parent ? returnNode.parent.id : undefined,
  };
}

export async function createEllipse(params: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  parentId?: string;
  fillColor?: RGB | RGBA;
  strokeColor?: RGB | RGBA;
  strokeWeight?: number;
}) {
  const {
    x = 0,
    y = 0,
    width = 100,
    height = 100,
    name = 'Ellipse',
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
    } else {
      throw new Error(`Parent node does not support children: ${parentId}`);
    }
  } else {
    figma.currentPage.appendChild(ellipse);
  }

  return {
    id: ellipse.id,
    name: ellipse.name,
    x: ellipse.x,
    y: ellipse.y,
    width: ellipse.width,
    height: ellipse.height,
    fills: ellipse.fills,
    strokes: ellipse.strokes,
    strokeWeight: ellipse.strokeWeight,
    parentId: ellipse.parent ? ellipse.parent.id : undefined,
  };
}

export async function createPolygon(params: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  pointCount?: number;
  name?: string;
  parentId?: string;
  fillColor?: any;
  strokeColor?: any;
  strokeWeight?: number;
}) {
  const {
    x = 0,
    y = 0,
    width = 100,
    height = 100,
    pointCount = 5,
    name = 'Polygon',
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
    if (hasAppendChild(parentNode)) parentNode.appendChild(polygon);
    else throw new Error(`Parent node does not support children: ${parentId}`);
  } else {
    figma.currentPage.appendChild(polygon);
  }

  return {
    id: polygon.id,
    name: polygon.name,
    x: polygon.x,
    y: polygon.y,
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
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  pointCount?: number;
  innerRadius?: number;
  name?: string;
  parentId?: string;
  fillColor?: RGB | RGBA;
  strokeColor?: RGB | RGBA;
  strokeWeight?: number;
}) {
  const {
    x = 0,
    y = 0,
    width = 100,
    height = 100,
    pointCount = 5,
    innerRadius = 50,
    name = 'Star',
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
    if (hasAppendChild(parentNode)) parentNode.appendChild(star);
    else throw new Error(`Parent node does not support children: ${parentId}`);
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
  x?: number;
  y?: number;
  length?: number;
  direction?: 'HORIZONTAL' | 'VERTICAL';
  name?: string;
  parentId?: string;
  strokeColor?: RGB | RGBA;
  strokeWeight?: number;
  strokeCap?: StrokeCap;
  dashPattern?: readonly number[];
}) {
  const {
    x = 0,
    y = 0,
    length = 100,
    direction = 'HORIZONTAL',
    name = 'Line',
    parentId,
    strokeColor,
    strokeWeight = 1,
    strokeCap = 'NONE',
    dashPattern,
  } = params || {};

  const line = figma.createLine();
  line.x = x;
  line.y = y;

  if (direction === 'HORIZONTAL') {
    line.resize(length, 0);
  } else {
    line.resize(0, length);
  }
  line.name = name;

  if (strokeColor) line.strokes = [makeSolidPaint(strokeColor)];
  line.strokeWeight = strokeWeight;
  line.strokeCap = strokeCap;
  if (dashPattern) line.dashPattern = dashPattern;

  if (parentId) {
    const parentNode = await figma.getNodeByIdAsync(parentId);
    if (!parentNode)
      throw new Error(`Parent node not found with ID: ${parentId}`);
    if (hasAppendChild(parentNode)) parentNode.appendChild(line);
    else throw new Error(`Parent node does not support children: ${parentId}`);
  } else {
    figma.currentPage.appendChild(line);
  }

  return {
    id: line.id,
    name: line.name,
    x: line.x,
    y: line.y,
    width: line.width,
    height: line.height,
    strokeWeight: line.strokeWeight,
    strokeCap: line.strokeCap,
    dashPattern: line.dashPattern,
    strokes: line.strokes,
    parentId: line.parent ? line.parent.id : undefined,
  };
}
