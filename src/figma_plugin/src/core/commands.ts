import {
  makeSolidPaint,
  getErrorMessage,
  sendProgressUpdate,
  setCharacters,
  generateCommandId,
  findTextNodes,
  processTextNode,
  collectNodesToProcess,
  delay,
  findNodesByTypes,
  uint8ArrayToBase64,
  safeParseFloat,
  customBase64Encode,
  filterFigmaNode,
} from './utils';
import { hasAppendChild, hasClone, hasExportAsync } from './figma-api';
import {
  LayoutMode,
  LayoutWrap,
  PrimaryAxisAlign,
  CounterAxisAlign,
  LayoutSizing,
  ProgressStatus,
  NodeInfo,
  MinimalTextNode,
  CategoryInfo,
  MinimalNodeMatch,
  ImageFormat,
} from './types';

export async function getDocumentInfo() {
  await figma.currentPage.loadAsync();
  const page = figma.currentPage;
  return {
    name: page.name,
    id: page.id,
    type: page.type,
    children: page.children.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
    })),
    currentPage: {
      id: page.id,
      name: page.name,
      childCount: page.children.length,
    },
    pages: [
      {
        id: page.id,
        name: page.name,
        childCount: page.children.length,
      },
    ],
  };
}

export async function getSelection() {
  return {
    selectionCount: figma.currentPage.selection.length,
    selection: figma.currentPage.selection.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      visible: node.visible,
    })),
  };
}

function rgbaToHex(color: {
  r: number;
  g: number;
  b: number;
  a?: number;
}): string {
  var r = Math.round(color.r * 255);
  var g = Math.round(color.g * 255);
  var b = Math.round(color.b * 255);
  var a = color.a !== undefined ? Math.round(color.a * 255) : 255;

  if (a === 255) {
    return (
      '#' +
      [r, g, b]
        .map((x) => {
          return x.toString(16).padStart(2, '0');
        })
        .join('')
    );
  }

  return (
    '#' +
    [r, g, b, a]
      .map((x) => {
        return x.toString(16).padStart(2, '0');
      })
      .join('')
  );
}

export async function getNodeInfo(nodeId: string) {
  const node = await figma.getNodeByIdAsync(nodeId);

  if (!node) {
    throw new Error(`Node not found with ID: ${nodeId}`);
  }

  if (!hasExportAsync(node)) {
    throw new Error('Node does not support exporting');
  }
  const response = (await node.exportAsync({
    format: 'JSON_REST_V1',
  })) as {
    document: any;
  };

  return filterFigmaNode(response.document);
}

export async function getNodesInfo(nodeIds: string[]) {
  try {
    // Load all nodes in parallel
    const nodes = await Promise.all(
      nodeIds.map((id) => figma.getNodeByIdAsync(id))
    );

    // Filter out any null values (nodes that weren't found)
    const validNodes = nodes.filter((node) => node !== null);

    // Export all valid nodes in parallel
    const responses = await Promise.all(
      validNodes.map(async (node) => {
        if (!hasExportAsync(node)) {
          throw new Error('Node does not support exporting');
        }
        const response = (await node.exportAsync({
          format: 'JSON_REST_V1',
        })) as {
          document: any;
        };
        return {
          nodeId: node.id,
          document: filterFigmaNode(response.document),
        };
      })
    );

    return responses;
  } catch (error) {
    throw new Error(`Error getting nodes info: ${getErrorMessage(error)}`);
  }
}

export async function readMyDesign() {
  try {
    // Load all selected nodes in parallel
    const nodes = await Promise.all(
      figma.currentPage.selection.map((node) => figma.getNodeByIdAsync(node.id))
    );

    // Filter out any null values (nodes that weren't found)
    const validNodes = nodes.filter((node) => node !== null);

    // Export all valid nodes in parallel
    const responses = await Promise.all(
      validNodes.map(async (node) => {
        if (!hasExportAsync(node)) {
          throw new Error('Node does not support exporting');
        }
        const response = await node.exportAsync({
          format: 'JSON_REST_V1',
        });
        return {
          nodeId: node.id,
          document: filterFigmaNode(response),
        };
      })
    );

    return responses;
  } catch (error) {
    throw new Error(`Error getting nodes info: ${getErrorMessage(error)}`);
  }
}

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

export async function moveNode(params: {
  nodeId: string;
  x: number;
  y: number;
}) {
  const { nodeId, x, y } = params || {};

  if (!nodeId) {
    throw new Error('Missing nodeId parameter');
  }

  if (x === undefined || y === undefined) {
    throw new Error('Missing x or y parameters');
  }

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error(`Node not found with ID: ${nodeId}`);
  }

  if (!('x' in node) || !('y' in node)) {
    throw new Error(`Node does not support position: ${nodeId}`);
  }

  node.x = x;
  node.y = y;

  return {
    id: node.id,
    name: node.name,
    x: node.x,
    y: node.y,
  };
}

export async function resizeNode(params: {
  nodeId: string;
  width: number;
  height: number;
}) {
  const { nodeId, width, height } = params || {};

  if (!nodeId) {
    throw new Error('Missing nodeId parameter');
  }

  if (width === undefined || height === undefined) {
    throw new Error('Missing width or height parameters');
  }

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error(`Node not found with ID: ${nodeId}`);
  }

  if (!('resize' in node)) {
    throw new Error(`Node does not support resizing: ${nodeId}`);
  }

  node.resize(width, height);

  return {
    id: node.id,
    name: node.name,
    width: node.width,
    height: node.height,
  };
}

export async function deleteNode(params: { nodeId: string }) {
  const { nodeId } = params || {};

  if (!nodeId) {
    throw new Error('Missing nodeId parameter');
  }

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error(`Node not found with ID: ${nodeId}`);
  }

  // Save node info before deleting
  const nodeInfo = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  node.remove();

  return nodeInfo;
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

export async function getLocalComponents() {
  await figma.loadAllPagesAsync();

  const components = figma.root.findAllWithCriteria({
    types: ['COMPONENT'],
  });

  return {
    count: components.length,
    components: components.map((component) => ({
      id: component.id,
      name: component.name,
      key: 'key' in component ? component.key : null,
    })),
  };
}

// export async function getTeamComponents() {
//   try {
//     const teamComponents =
//       await figma.teamLibrary.getAvailableComponentsAsync();

//     return {
//       count: teamComponents.length,
//       components: teamComponents.map((component) => ({
//         key: component.key,
//         name: component.name,
//         description: component.description,
//         libraryName: component.libraryName,
//       })),
//     };
//   } catch (error) {
//     throw new Error(`Error getting team components: ${error.message}`);
//   }
// }

export async function createComponentInstance(params: {
  componentKey: string;
  x?: number;
  y?: number;
}) {
  const { componentKey, x = 0, y = 0 } = params || {};
  if (!componentKey) {
    throw new Error('Missing componentKey parameter');
  }
  // Use importComponentByKeyAsync and createInstance
  const component = await figma.importComponentByKeyAsync(componentKey);
  const instance = component.createInstance();

  instance.x = x;
  instance.y = y;
  figma.currentPage.appendChild(instance);

  return {
    id: instance.id,
    name: instance.name,
    x: instance.x,
    y: instance.y,
    width: instance.width,
    height: instance.height,
    componentId: instance.mainComponent?.id,
  };
}

interface ExportNodeAsImageResult {
  nodeId: string;
  format: ImageFormat;
  scale: number;
  mimeType: string;
  imageData: string; // base64
}

export async function exportNodeAsImage(params: {
  nodeId: string;
  scale?: number; // default = 1
}): Promise<ExportNodeAsImageResult> {
  const { nodeId, scale = 1 } = params || {};

  const format: ImageFormat = 'PNG';

  if (!nodeId) {
    throw new Error('Missing nodeId parameter');
  }

  const node = (await figma.getNodeByIdAsync(nodeId)) as
    | (SceneNode & ExportMixin)
    | null;

  if (!node) {
    throw new Error(`Node not found with ID: ${nodeId}`);
  }

  if (!('exportAsync' in node)) {
    throw new Error(`Node does not support exporting: ${nodeId}`);
  }

  try {
    const settings: ExportSettingsImage = {
      format,
      constraint: { type: 'SCALE', value: scale },
    };

    const bytes = await node.exportAsync(settings);

    let mimeType: string;
    switch (format) {
      case 'PNG':
        mimeType = 'image/png';
        break;
      default:
        mimeType = 'application/octet-stream';
    }

    // Proper way to convert Uint8Array to base64
    const base64 = customBase64Encode(bytes);

    return {
      nodeId,
      format,
      scale,
      mimeType,
      imageData: base64,
    };
  } catch (error: any) {
    throw new Error(`Error exporting node as image: ${error.message}`);
  }
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

export async function setTextContent(params: { nodeId: string; text: string }) {
  const { nodeId, text } = params || {};
  const commandId = generateCommandId();

  try {
    sendProgressUpdate(
      commandId,
      'setTextContent',
      'started',
      0,
      1,
      0,
      `Setting text content for node ${nodeId}`,
      {}
    );

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }

    if (node.type !== 'TEXT') {
      throw new Error(`Node is not a text node: ${nodeId}`);
    }

    await figma.loadFontAsync(node.fontName as FontName);

    await setCharacters(node, text);

    return {
      id: node.id,
      name: node.name,
      characters: node.characters,
      fontName: node.fontName,
    };
  } catch (error) {
    sendProgressUpdate(
      commandId,
      'setTextContent',
      'error',
      0,
      1,
      0,
      `Error: ${getErrorMessage(error)}`,
      {}
    );
    throw error;
  }
}

// --- Command handler implementations ported from code.js ---

export async function deleteMultipleNodes(params: { nodeIds: string[] }) {
  const { nodeIds } = params || {};
  if (!Array.isArray(nodeIds)) throw new Error('nodeIds must be an array');

  const commandId = generateCommandId();
  const deleted: any[] = [];
  const errors: any[] = [];
  const total = nodeIds.length;

  try {
    sendProgressUpdate(
      commandId,
      'deleteMultipleNodes',
      'started',
      0,
      total,
      0,
      `Starting deletion of ${total} nodes`,
      {}
    );

    // Process in chunks of 5
    const chunkSize = 5;
    for (let i = 0; i < nodeIds.length; i += chunkSize) {
      const chunk = nodeIds.slice(i, i + chunkSize);

      // Process each chunk
      for (const nodeId of chunk) {
        try {
          const node = await figma.getNodeByIdAsync(nodeId);
          if (node) {
            // Add visual feedback - temporarily highlight the node
            if ('fills' in node) {
              const originalFills = node.fills;
              node.fills = [
                {
                  type: 'SOLID',
                  color: { r: 1, g: 0.5, b: 0 },
                  opacity: 0.3,
                },
              ];
              await delay(100);
              node.fills = originalFills;
            }

            const nodeInfo = { id: node.id, name: node.name, type: node.type };
            node.remove();
            deleted.push(nodeInfo);

            sendProgressUpdate(
              commandId,
              'deleteMultipleNodes',
              'in_progress',
              Math.round(((deleted.length + errors.length) / total) * 100),
              total,
              deleted.length + errors.length,
              `Deleted node: ${nodeInfo.name}`,
              nodeInfo
            );
          } else {
            errors.push({ id: nodeId, error: 'Node not found' });
          }
        } catch (error) {
          errors.push({ id: nodeId, error: getErrorMessage(error) });
        }
      }

      // Delay between chunks
      if (i + chunkSize < nodeIds.length) {
        await delay(1000);
      }
    }

    sendProgressUpdate(
      commandId,
      'deleteMultipleNodes',
      'completed',
      100,
      total,
      deleted.length + errors.length,
      `Completed deletion. Deleted: ${deleted.length}, Errors: ${errors.length}`,
      {}
    );

    return {
      deleted,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        total,
        deleted: deleted.length,
        errors: errors.length,
      },
    };
  } catch (error) {
    sendProgressUpdate(
      commandId,
      'deleteMultipleNodes',
      'error',
      0,
      total,
      0,
      `Error: ${getErrorMessage(error)}`,
      {}
    );
    throw error;
  }
}

export async function cloneNode(params: {
  nodeId: string;
  parentId?: string;
  x?: number;
  y?: number;
}) {
  const { nodeId, parentId, x, y } = params || {};
  if (!nodeId) throw new Error('Missing nodeId');

  const commandId = generateCommandId();

  try {
    sendProgressUpdate(
      commandId,
      'cloneNode',
      'started',
      0,
      1,
      0,
      `Cloning node ${nodeId}`,
      {}
    );

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (!hasClone(node)) throw new Error('Node does not support clone');

    // Clone the node
    const clone = node.clone();

    // Only set x/y if clone is a SceneNode
    if (typeof x === 'number' && 'x' in clone) (clone as SceneNode).x = x;
    if (typeof y === 'number' && 'y' in clone) (clone as SceneNode).y = y;

    if (node.parent) {
      node.parent.appendChild(clone as SceneNode);
    } else {
      figma.currentPage.appendChild(clone as SceneNode);
    }

    sendProgressUpdate(
      commandId,
      'cloneNode',
      'completed',
      100,
      1,
      1,
      'Node cloned successfully',
      {}
    );

    return {
      id: clone.id,
      name: clone.name,
      x: 'x' in clone ? (clone as SceneNode).x : undefined,
      y: 'y' in clone ? (clone as SceneNode).y : undefined,
      width: 'width' in clone ? clone.width : undefined,
      height: 'height' in clone ? clone.height : undefined,
    };
  } catch (error) {
    sendProgressUpdate(
      commandId,
      'cloneNode',
      'error',
      0,
      1,
      0,
      `Error: ${getErrorMessage(error)}`,
      {}
    );
    throw error;
  }
}

/////

export interface ScanTextNodesResult {
  success: true;
  message: string;
  totalNodes: number;
  processedNodes: number;
  chunks: number;
  textNodes: MinimalTextNode[];
  commandId: string;
}

export async function scanTextNodes(params: {
  nodeId: string;
  useChunking?: boolean;
  chunkSize?: number;
  commandId?: string;
}): Promise<ScanTextNodesResult> {
  /* ------------------------- parameter unpacking -------------------------- */
  const {
    nodeId,
    useChunking = true,
    chunkSize = 10,
    commandId = generateCommandId(),
  } = params;

  console.log(`Starting to scan text nodes from node ID: ${nodeId}`);

  /* ----------------------------- find root -------------------------------- */
  const node = await figma.getNodeByIdAsync(nodeId);

  if (!node) {
    const msg = `Node with ID ${nodeId} not found`;
    console.error(msg);
    sendProgressUpdate(commandId, 'scan_text_nodes', 'error', 0, 0, 0, msg, {
      error: msg,
    });
    throw new Error(msg);
  }

  /* --------------------- non-chunked (simple) mode ------------------------ */
  if (!useChunking) {
    try {
      sendProgressUpdate(
        commandId,
        'scan_text_nodes',
        'started',
        0,
        1,
        0,
        `Starting scan of node “${node.name ?? nodeId}” without chunking`,
        null
      );

      const textNodes: MinimalTextNode[] = [];
      await findTextNodes(node, [], 0, textNodes);

      sendProgressUpdate(
        commandId,
        'scan_text_nodes',
        'completed',
        100,
        textNodes.length,
        textNodes.length,
        `Scan complete. Found ${textNodes.length} text nodes.`,
        { textNodes }
      );

      return {
        success: true,
        message: `Scanned ${textNodes.length} text nodes.`,
        totalNodes: textNodes.length,
        processedNodes: textNodes.length,
        chunks: 1,
        textNodes,
        commandId,
      };
    } catch (err) {
      const error = err as Error;
      const msg = `Error scanning text nodes: ${error.message}`;
      console.error(msg);
      sendProgressUpdate(commandId, 'scan_text_nodes', 'error', 0, 0, 0, msg, {
        error: error.message,
      });
      throw error;
    }
  }

  /* ----------------------- chunked (batched) mode ------------------------- */
  console.log(`Using chunked scanning with chunk size: ${chunkSize}`);

  sendProgressUpdate(
    commandId,
    'scan_text_nodes',
    'started',
    0,
    0,
    0,
    `Starting chunked scan of node “${node.name ?? nodeId}”`,
    { chunkSize }
  );

  /* 1️⃣ Collect a flat list of *all* descendant nodes first  */
  const nodesToProcessInfo: NodeInfo[] = [];
  await collectNodesToProcess(node, [], 0, nodesToProcessInfo);

  const totalNodes = nodesToProcessInfo.length;
  const totalChunks = Math.max(1, Math.ceil(totalNodes / chunkSize));

  console.log(`Found ${totalNodes} total nodes to process`);
  console.log(`Will process in ${totalChunks} chunks`);

  sendProgressUpdate(
    commandId,
    'scan_text_nodes',
    'in_progress',
    5,
    totalNodes,
    0,
    `Found ${totalNodes} nodes. Processing in ${totalChunks} chunks.`,
    { totalNodes, totalChunks, chunkSize }
  );

  /* 2️⃣ Process them in batches */
  const allTextNodes: MinimalTextNode[] = [];
  let processedNodes = 0;
  let chunksProcessed = 0;

  for (let i = 0; i < totalNodes; i += chunkSize) {
    const chunkEnd = Math.min(i + chunkSize, totalNodes);
    const chunkNodesInfo = nodesToProcessInfo.slice(i, chunkEnd);
    chunksProcessed += 1;

    sendProgressUpdate(
      commandId,
      'scan_text_nodes',
      'in_progress',
      Math.round(5 + ((chunksProcessed - 1) / totalChunks) * 90), // 5–95 %
      totalNodes,
      processedNodes,
      `Processing chunk ${chunksProcessed}/${totalChunks}`,
      {
        chunksProcessed,
        totalChunks,
        textNodesFound: allTextNodes.length,
      }
    );

    const chunkTextNodes: MinimalTextNode[] = [];
    for (const nodeInfo of chunkNodesInfo) {
      if (nodeInfo.node.type === 'TEXT') {
        try {
          const resultTextNode = await processTextNode(
            nodeInfo.node as TextNode,
            nodeInfo.parentPath,
            nodeInfo.depth
          );
          if (resultTextNode) chunkTextNodes.push(resultTextNode);
        } catch (err) {
          console.error(
            `Error processing text node: ${(err as Error).message}`
          );
        }
      }
      await delay(5); // yield to UI
    }

    // Add results from this chunk
    allTextNodes.push(...chunkTextNodes);
    processedNodes += chunkNodesInfo.length;
    chunksProcessed++;

    sendProgressUpdate(
      commandId,
      'scan_text_nodes',
      'in_progress',
      Math.round(5 + (chunksProcessed / totalChunks) * 90),
      totalNodes,
      processedNodes,
      `Finished chunk ${chunksProcessed}/${totalChunks}. ` +
        `Found ${allTextNodes.length} text nodes so far.`,
      {
        currentChunk: chunksProcessed,
        totalChunks,
        processedNodes,
        textNodesFound: allTextNodes.length,
        chunkResult: chunkTextNodes,
      }
    );

    if (i + chunkSize < totalNodes) await delay(50); // pause before next chunk
  }

  /* 3️⃣ All done                                                             */
  sendProgressUpdate(
    commandId,
    'scan_text_nodes',
    'completed',
    100,
    totalNodes,
    processedNodes,
    `Scan complete. Found ${allTextNodes.length} text nodes.`,
    {
      textNodes: allTextNodes,
      processedNodes,
      chunks: chunksProcessed,
    }
  );

  return {
    success: true,
    message: `Chunked scan complete. Found ${allTextNodes.length} text nodes.`,
    totalNodes: allTextNodes.length,
    processedNodes,
    chunks: chunksProcessed,
    textNodes: allTextNodes,
    commandId,
  };
}

interface TextReplacement {
  nodeId: string;
  text: string;
}

interface ReplacementResult {
  success: boolean;
  nodeId: string;
  originalText?: string;
  translatedText?: string;
  error?: string;
}

interface SetMultipleTextContentsResult {
  success: boolean;
  nodeId: string;
  replacementsApplied: number;
  replacementsFailed: number;
  totalReplacements: number;
  results: ReplacementResult[];
  completedInChunks: number;
  commandId: string;
}

export async function setMultipleTextContents(params: {
  nodeId: string;
  text: TextReplacement[];
  commandId?: string;
}): Promise<SetMultipleTextContentsResult> {
  const { nodeId, text } = params ?? {};
  const commandId = params.commandId ?? generateCommandId();

  if (!nodeId || !text || !Array.isArray(text)) {
    const errorMsg = 'Missing required parameters: nodeId and text array';

    // Send error progress update
    sendProgressUpdate(
      commandId,
      'set_multiple_text_contents',
      'error',
      0,
      0,
      0,
      errorMsg,
      { error: errorMsg }
    );

    throw new Error(errorMsg);
  }

  console.log(
    `Starting text replacement for node: ${nodeId} with ${text.length} text replacements`
  );

  // Send started progress update
  sendProgressUpdate(
    commandId,
    'set_multiple_text_contents',
    'started',
    0,
    text.length,
    0,
    `Starting text replacement for ${text.length} nodes`,
    { totalReplacements: text.length }
  );

  // Define the results array and counters
  const results: ReplacementResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Split text replacements into chunks of 5
  const CHUNK_SIZE = 5;
  const chunks: TextReplacement[][] = [];

  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }

  console.log(`Split ${text.length} replacements into ${chunks.length} chunks`);

  // Send chunking info update
  sendProgressUpdate(
    commandId,
    'set_multiple_text_contents',
    'in_progress',
    5, // 5 % progress for planning phase
    text.length,
    0,
    `Preparing to replace text in ${text.length} nodes using ${chunks.length} chunks`,
    {
      totalReplacements: text.length,
      chunks: chunks.length,
      chunkSize: CHUNK_SIZE,
    }
  );

  // ──────────────────────────────
  // Process each chunk sequentially
  // ──────────────────────────────
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    console.log(
      `Processing chunk ${chunkIndex + 1}/${chunks.length} with ${chunk.length} replacements`
    );

    // Send chunk processing start update
    sendProgressUpdate(
      commandId,
      'set_multiple_text_contents',
      'in_progress',
      Math.round(5 + (chunkIndex / chunks.length) * 90), // 5-95 % for processing
      text.length,
      successCount + failureCount,
      `Processing text replacements chunk ${chunkIndex + 1}/${chunks.length}`,
      {
        currentChunk: chunkIndex + 1,
        totalChunks: chunks.length,
        successCount,
        failureCount,
      }
    );

    // Process replacements within a chunk in parallel
    const chunkPromises = chunk.map(
      async (replacement): Promise<ReplacementResult> => {
        if (!replacement.nodeId || replacement.text === undefined) {
          console.error(`Missing nodeId or text for replacement`);
          return {
            success: false,
            nodeId: replacement.nodeId || 'unknown',
            error: 'Missing nodeId or text in replacement entry',
          };
        }

        try {
          console.log(
            `Attempting to replace text in node: ${replacement.nodeId}`
          );

          // Get the text node (validate existence & type)
          const textNode = (await figma.getNodeByIdAsync(
            replacement.nodeId
          )) as TextNode | undefined;

          if (!textNode) {
            console.error(`Text node not found: ${replacement.nodeId}`);
            return {
              success: false,
              nodeId: replacement.nodeId,
              error: `Node not found: ${replacement.nodeId}`,
            };
          }

          if (textNode.type !== 'TEXT') {
            console.error(
              `Node is not a text node: ${replacement.nodeId} (type: ${textNode.type})`
            );
            return {
              success: false,
              nodeId: replacement.nodeId,
              error: `Node is not a text node: ${replacement.nodeId} (type: ${textNode.type})`,
            };
          }

          // Save original text for the result
          const originalText = textNode.characters;
          console.log(`Original text: "${originalText}"`);
          console.log(`Will translate to: "${replacement.text}"`);

          // Highlight the node before changing text
          let originalFills: readonly Paint[] | undefined;
          try {
            originalFills = JSON.parse(JSON.stringify(textNode.fills));
            // Highlight (orange, 30 % opacity)
            textNode.fills = [
              {
                type: 'SOLID',
                color: { r: 1, g: 0.5, b: 0 },
                opacity: 0.3,
              },
            ];
          } catch (highlightErr: any) {
            console.error(
              `Error highlighting text node: ${highlightErr.message}`
            );
            // Highlighting is cosmetic; continue
          }

          // Replace the text (handles font loading, etc.)
          await setTextContent({
            nodeId: replacement.nodeId,
            text: replacement.text,
          });

          // Restore original fills after a brief delay
          if (originalFills) {
            try {
              await delay(500);
              textNode.fills = originalFills;
            } catch (restoreErr: any) {
              console.error(`Error restoring fills: ${restoreErr.message}`);
            }
          }

          console.log(
            `Successfully replaced text in node: ${replacement.nodeId}`
          );
          return {
            success: true,
            nodeId: replacement.nodeId,
            originalText,
            translatedText: replacement.text,
          };
        } catch (error: any) {
          console.error(
            `Error replacing text in node ${replacement.nodeId}: ${error.message}`
          );
          return {
            success: false,
            nodeId: replacement.nodeId,
            error: `Error applying replacement: ${error.message}`,
          };
        }
      }
    );

    // Wait for all replacements in this chunk
    const chunkResults = await Promise.all(chunkPromises);

    // Tally results
    for (const r of chunkResults) {
      r.success ? successCount++ : failureCount++;
      results.push(r);
    }

    // Chunk done update
    sendProgressUpdate(
      commandId,
      'set_multiple_text_contents',
      'in_progress',
      Math.round(5 + ((chunkIndex + 1) / chunks.length) * 90),
      text.length,
      successCount + failureCount,
      `Completed chunk ${chunkIndex + 1}/${chunks.length}. ${successCount} successful, ${failureCount} failed so far.`,
      {
        currentChunk: chunkIndex + 1,
        totalChunks: chunks.length,
        successCount,
        failureCount,
        chunkResults,
      }
    );

    // Gentle throttle between chunks
    if (chunkIndex < chunks.length - 1) {
      console.log('Pausing between chunks to avoid overloading Figma...');
      await delay(1000);
    }
  }

  console.log(
    `Replacement complete: ${successCount} successful, ${failureCount} failed`
  );

  // Final progress update
  sendProgressUpdate(
    commandId,
    'set_multiple_text_contents',
    'completed',
    100,
    text.length,
    successCount + failureCount,
    `Text replacement complete: ${successCount} successful, ${failureCount} failed`,
    {
      totalReplacements: text.length,
      replacementsApplied: successCount,
      replacementsFailed: failureCount,
      completedInChunks: chunks.length,
      results,
    }
  );

  return {
    success: successCount > 0,
    nodeId,
    replacementsApplied: successCount,
    replacementsFailed: failureCount,
    totalReplacements: text.length,
    results,
    completedInChunks: chunks.length,
    commandId,
  };
}

// ──────────────────────────────────────────────────────────
// Type helpers – tweak / replace with official typings
// ──────────────────────────────────────────────────────────

/** Result when a single node is requested */
interface NodeAnnotationsResult {
  nodeId: string;
  name: string;
  annotations: readonly Annotation[]; // Annotation is defined in the plugin typings
  categories?: CategoryInfo[];
}

/** Result when *all* annotated nodes are requested */
interface AllAnnotationsResult {
  annotatedNodes: {
    nodeId: string;
    name: string;
    annotations: readonly Annotation[];
  }[];
  categories?: CategoryInfo[];
}

/** Union of the two possible result shapes */
type GetAnnotationsResult = NodeAnnotationsResult | AllAnnotationsResult;

/* ---------------------------------------------------------
   Main function – same logic, now strongly typed
--------------------------------------------------------- */
export async function getAnnotations(params: {
  nodeId?: string;
  includeCategories?: boolean; // defaults to true
}): Promise<GetAnnotationsResult> {
  try {
    const { nodeId, includeCategories = true } = params;

    // ───────────────────────────────────────────────────
    // 1. Load categories once (optional)
    // ───────────────────────────────────────────────────
    let categoriesMap: Record<string, CategoryInfo> = {};
    if (includeCategories) {
      const categories = await figma.annotations.getAnnotationCategoriesAsync();
      categoriesMap = categories.reduce<Record<string, CategoryInfo>>(
        (map, category) => {
          map[category.id] = {
            id: category.id,
            label: category.label,
            color: category.color,
            isPreset: category.isPreset,
          };
          return map;
        },
        {}
      );
    }

    // ───────────────────────────────────────────────────
    // 2.a Single-node mode
    // ───────────────────────────────────────────────────
    if (nodeId) {
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error(`Node not found: ${nodeId}`);

      if (!('annotations' in node)) {
        throw new Error(`Node type ${node.type} does not support annotations`);
      }

      const result: NodeAnnotationsResult = {
        nodeId: node.id,
        name: node.name,
        annotations: node.annotations ?? [],
      };

      if (includeCategories) result.categories = Object.values(categoriesMap);
      return result;
    }

    // ───────────────────────────────────────────────────
    // 2.b Whole-page mode
    // ───────────────────────────────────────────────────
    const annotatedNodes: AllAnnotationsResult['annotatedNodes'] = [];

    const processNode = async (node: SceneNode | BaseNode) => {
      if (
        'annotations' in node &&
        node.annotations &&
        node.annotations.length > 0
      ) {
        annotatedNodes.push({
          nodeId: node.id,
          name: node.name,
          annotations: node.annotations,
        });
      }
      if ('children' in node) {
        for (const child of node.children) await processNode(child);
      }
    };

    await processNode(figma.currentPage);

    const result: AllAnnotationsResult = { annotatedNodes };
    if (includeCategories) result.categories = Object.values(categoriesMap);
    return result;
  } catch (error) {
    console.error('Error in getAnnotations:', error);
    throw error;
  }
}

interface AnnotationProperty {
  key: string;
  value: string;
}

interface SetAnnotationParams extends Annotation {
  nodeId: string;
  annotationId?: string;
}

interface SetAnnotationSuccess {
  success: true;
  nodeId: string;
  name: string;
  annotations: readonly Annotation[]; // replace with your own type if needed
}

interface SetAnnotationFailure {
  success: false;
  error: string;
}

type SetAnnotationResult = SetAnnotationSuccess | SetAnnotationFailure;

/* ---------------------------------------------------------
   Main function – logic preserved, now strongly typed
--------------------------------------------------------- */
export async function setAnnotation(params: {
  nodeId: string;
  annotationId?: string; // not used in current logic
  labelMarkdown: string;
  categoryId?: string; // optional
  properties?: AnnotationProperty[]; // optional
}): Promise<SetAnnotationResult> {
  try {
    console.log('=== setAnnotation Debug Start ===');
    console.log('Input params:', JSON.stringify(params, null, 2));

    const { nodeId, annotationId, labelMarkdown, categoryId, properties } =
      params;

    // ── Validation ────────────────────────────────────
    if (!nodeId) {
      console.error('Validation failed: Missing nodeId');
      return { success: false, error: 'Missing nodeId' };
    }
    if (!labelMarkdown) {
      console.error('Validation failed: Missing labelMarkdown');
      return { success: false, error: 'Missing labelMarkdown' };
    }

    console.log('Attempting to get node:', nodeId);
    const node = await figma.getNodeByIdAsync(nodeId);
    console.log('Node lookup result:', {
      id: nodeId,
      found: !!node,
      type: node?.type,
      name: node?.name,
      hasAnnotations: node ? 'annotations' in node : false,
    });

    if (!node) {
      console.error('Node lookup failed:', nodeId);
      return { success: false, error: `Node not found: ${nodeId}` };
    }

    if (!('annotations' in node)) {
      console.error('Node annotation support check failed:', {
        nodeType: node.type,
        nodeId: node.id,
      });
      return {
        success: false,
        error: `Node type ${node.type} does not support annotations`,
      };
    }

    // ── Build annotation object ───────────────────────
    const newAnnotation: any = { labelMarkdown };

    if (categoryId) {
      console.log('Adding categoryId to annotation:', categoryId);
      newAnnotation.categoryId = categoryId;
    }

    if (properties && Array.isArray(properties) && properties.length > 0) {
      console.log(
        'Adding properties to annotation:',
        JSON.stringify(properties, null, 2)
      );
      newAnnotation.properties = properties;
    }

    console.log('Current node annotations:', node.annotations);
    console.log(
      'Setting new annotation:',
      JSON.stringify(newAnnotation, null, 2)
    );

    node.annotations = [newAnnotation as Annotation];

    console.log('Updated node annotations:', node.annotations);
    console.log('=== setAnnotation Debug End ===');

    return {
      success: true,
      nodeId: node.id,
      name: node.name,
      annotations: node.annotations,
    };
  } catch (error: any) {
    console.error('=== setAnnotation Error ===');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      params: JSON.stringify(params, null, 2),
    });
    return { success: false, error: error.message };
  }
}

interface ScanNodesByTypesResult {
  success: boolean;
  message: string;
  count: number;
  matchingNodes: MinimalNodeMatch[];
  searchedTypes: string[];
}

/* ──────────────────────────────────────────────────────────
   Main function – original logic preserved, now strongly typed
────────────────────────────────────────────────────────── */
export async function scanNodesByTypes(params: {
  nodeId: string;
  types: string[];
}): Promise<ScanNodesByTypesResult> {
  console.log(`Starting to scan nodes by types from node ID: ${params.nodeId}`);

  // Destructure with a sensible default for safety
  const { nodeId, types = [] } = params ?? {};

  if (!types || types.length === 0) {
    throw new Error('No types specified to search for');
  }

  const node = await figma.getNodeByIdAsync(nodeId);

  if (!node) {
    throw new Error(`Node with ID ${nodeId} not found`);
  }

  const matchingNodes: MinimalNodeMatch[] = [];

  // --- Progress: started ---------------------------------
  const commandId = generateCommandId();
  sendProgressUpdate(
    commandId,
    'scan_nodes_by_types',
    'started',
    0,
    1,
    0,
    `Starting scan of node "${node.name || nodeId}" for types: ${types.join(', ')}`,
    null
  );

  // --- Recursive scan ------------------------------------
  await findNodesByTypes(node, types, matchingNodes);

  // --- Progress: completed -------------------------------
  sendProgressUpdate(
    commandId,
    'scan_nodes_by_types',
    'completed',
    100,
    matchingNodes.length,
    matchingNodes.length,
    `Scan complete. Found ${matchingNodes.length} matching nodes.`,
    { matchingNodes }
  );

  // --- Result --------------------------------------------
  return {
    success: true,
    message: `Found ${matchingNodes.length} matching nodes.`,
    count: matchingNodes.length,
    matchingNodes,
    searchedTypes: types,
  };
}

// ──────────────────────────────────────────────────────────
// Type helpers – tweak to match your own models as needed
// ──────────────────────────────────────────────────────────

interface AnnotationInput {
  nodeId: string;
  labelMarkdown: string;
  categoryId?: string; // optional
  properties?: AnnotationProperty[]; // optional
}

interface AnnotationResult {
  success: boolean;
  nodeId: string;
  error?: string;
}

interface SetMultipleAnnotationsSummary {
  success: boolean;
  annotationsApplied?: number;
  annotationsFailed?: number;
  totalAnnotations?: number;
  results?: AnnotationResult[];
  error?: string;
}
/* ──────────────────────────────────────────────────────────
   Main function – original code with type safety added
────────────────────────────────────────────────────────── */
export async function setMultipleAnnotations(params: {
  nodeId?: string; // optional: outer wrapper may supply it
  annotations: AnnotationInput[];
}): Promise<SetMultipleAnnotationsSummary> {
  console.log('=== setMultipleAnnotations Debug Start ===');
  console.log('Input params:', JSON.stringify(params, null, 2));

  const { nodeId, annotations } = params;

  if (!annotations || annotations.length === 0) {
    console.error('Validation failed: No annotations provided');
    return {
      success: false,
      error: 'No annotations provided',
    };
  }

  console.log(
    `Processing ${annotations.length} annotations for node ${nodeId}`
  );

  const results: AnnotationResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Process annotations sequentially
  for (let i = 0; i < annotations.length; i++) {
    const annotation = annotations[i];
    console.log(
      `\nProcessing annotation ${i + 1}/${annotations.length}:`,
      JSON.stringify(annotation, null, 2)
    );

    try {
      console.log('Calling setAnnotation with params:', {
        nodeId: annotation.nodeId,
        labelMarkdown: annotation.labelMarkdown,
        categoryId: annotation.categoryId,
        properties: annotation.properties,
      });

      const result = await setAnnotation({
        nodeId: annotation.nodeId,
        labelMarkdown: annotation.labelMarkdown,
        categoryId: annotation.categoryId,
        properties: annotation.properties,
      });

      console.log('setAnnotation result:', JSON.stringify(result, null, 2));

      if (result.success) {
        successCount++;
        results.push({ success: true, nodeId: annotation.nodeId });
        console.log(`✓ Annotation ${i + 1} applied successfully`);
      } else {
        failureCount++;
        results.push({
          success: false,
          nodeId: annotation.nodeId,
          error: result.error,
        });
        console.error(`✗ Annotation ${i + 1} failed:`, result.error);
      }
    } catch (error: any) {
      failureCount++;
      const errorResult: AnnotationResult = {
        success: false,
        nodeId: annotation.nodeId,
        error: error.message,
      };
      results.push(errorResult);
      console.error(`✗ Annotation ${i + 1} failed with error:`, error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
      });
    }
  }

  const summary: SetMultipleAnnotationsSummary = {
    success: successCount > 0,
    annotationsApplied: successCount,
    annotationsFailed: failureCount,
    totalAnnotations: annotations.length,
    results,
  };

  console.log('\n=== setMultipleAnnotations Summary ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('=== setMultipleAnnotations Debug End ===');

  return summary;
}

interface SetLayoutModeResult {
  id: string;
  name: string;
  layoutMode: LayoutMode;
  layoutWrap: LayoutWrap;
}

export async function setLayoutMode(params: {
  nodeId: string;
  layoutMode?: LayoutMode;
  layoutWrap?: LayoutWrap;
}): Promise<SetLayoutModeResult> {
  const { nodeId, layoutMode = 'NONE', layoutWrap = 'NO_WRAP' } = params ?? {};

  // Get the target node
  const node = (await figma.getNodeByIdAsync(nodeId)) as
    | FrameNode
    | ComponentNode
    | ComponentSetNode
    | InstanceNode;
  // | null;

  if (!node) {
    throw new Error(`Node with ID ${nodeId} not found`);
  }

  // Ensure the node supports auto-layout props
  if (
    node.type !== 'FRAME' &&
    node.type !== 'COMPONENT' &&
    node.type !== 'COMPONENT_SET' &&
    node.type !== 'INSTANCE'
  ) {
    throw new Error(`Node type ${node['type']} does not support layoutMode`);
  }

  // Set layout mode
  node.layoutMode = layoutMode as LayoutMode;

  // Set layoutWrap if applicable
  if (layoutMode !== 'NONE') {
    node.layoutWrap = layoutWrap as LayoutWrap;
  }

  return {
    id: node.id,
    name: node.name,
    layoutMode: node.layoutMode as LayoutMode,
    layoutWrap: node.layoutWrap as LayoutWrap,
  };
}

// ──────────────────────────────────────────────────────────
// Minimal type helpers – swap for official typings if you
// already use @figma/plugin-typings
// ──────────────────────────────────────────────────────────
interface SetPaddingParams {
  nodeId: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
}

interface SetPaddingResult {
  id: string;
  name: string;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
}

/* ---------------------------------------------------------
   Main function – original behavior retained
--------------------------------------------------------- */
export async function setPadding(
  params: SetPaddingParams
): Promise<SetPaddingResult> {
  const { nodeId, paddingTop, paddingRight, paddingBottom, paddingLeft } =
    params || {};

  // Get the target node
  const node = (await figma.getNodeByIdAsync(nodeId)) as
    | FrameNode
    | ComponentNode
    | ComponentSetNode
    | InstanceNode
    | null;

  if (!node) {
    throw new Error(`Node with ID ${nodeId} not found`);
  }

  // Check if node is a frame or component that supports padding
  if (
    node.type !== 'FRAME' &&
    node.type !== 'COMPONENT' &&
    node.type !== 'COMPONENT_SET' &&
    node.type !== 'INSTANCE'
  ) {
    throw new Error(`Node type ${node['type']} does not support padding`);
  }

  // Check if the node has auto-layout enabled
  if (node.layoutMode === 'NONE') {
    throw new Error(
      'Padding can only be set on auto-layout frames (layoutMode must not be NONE)'
    );
  }

  // Set padding values if provided
  if (paddingTop !== undefined) node.paddingTop = paddingTop;
  if (paddingRight !== undefined) node.paddingRight = paddingRight;
  if (paddingBottom !== undefined) node.paddingBottom = paddingBottom;
  if (paddingLeft !== undefined) node.paddingLeft = paddingLeft;

  return {
    id: node.id,
    name: node.name,
    paddingTop: node.paddingTop,
    paddingRight: node.paddingRight,
    paddingBottom: node.paddingBottom,
    paddingLeft: node.paddingLeft,
  };
}

interface SetAxisAlignResult {
  id: string;
  name: string;
  primaryAxisAlignItems: PrimaryAxisAlign | undefined;
  counterAxisAlignItems: CounterAxisAlign | undefined;
  layoutMode: LayoutMode;
}

/* ---------------------------------------------------------
   Main function – original logic preserved
--------------------------------------------------------- */
export async function setAxisAlign(params: {
  nodeId: string;
  primaryAxisAlignItems?: PrimaryAxisAlign;
  counterAxisAlignItems?: CounterAxisAlign;
}): Promise<SetAxisAlignResult> {
  const { nodeId, primaryAxisAlignItems, counterAxisAlignItems } = params || {};

  // Get the target node
  const node = (await figma.getNodeByIdAsync(nodeId)) as
    | FrameNode
    | ComponentNode
    | ComponentSetNode
    | InstanceNode
    | null;

  if (!node) {
    throw new Error(`Node with ID ${nodeId} not found`);
  }

  // Check if node is a frame or component that supports axis alignment
  if (
    node.type !== 'FRAME' &&
    node.type !== 'COMPONENT' &&
    node.type !== 'COMPONENT_SET' &&
    node.type !== 'INSTANCE'
  ) {
    throw new Error(
      `Node type ${node['type']} does not support axis alignment`
    );
  }

  // Check if the node has auto-layout enabled
  if (node.layoutMode === 'NONE') {
    throw new Error(
      'Axis alignment can only be set on auto-layout frames (layoutMode must not be NONE)'
    );
  }

  // Validate and set primaryAxisAlignItems if provided
  if (primaryAxisAlignItems !== undefined) {
    if (
      !['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN'].includes(primaryAxisAlignItems)
    ) {
      throw new Error(
        'Invalid primaryAxisAlignItems value. Must be one of: MIN, MAX, CENTER, SPACE_BETWEEN'
      );
    }
    node.primaryAxisAlignItems = primaryAxisAlignItems as PrimaryAxisAlign;
  }

  // Validate and set counterAxisAlignItems if provided
  if (counterAxisAlignItems !== undefined) {
    if (!['MIN', 'MAX', 'CENTER', 'BASELINE'].includes(counterAxisAlignItems)) {
      throw new Error(
        'Invalid counterAxisAlignItems value. Must be one of: MIN, MAX, CENTER, BASELINE'
      );
    }
    // BASELINE is only valid for horizontal layout
    if (
      counterAxisAlignItems === 'BASELINE' &&
      node.layoutMode !== 'HORIZONTAL'
    ) {
      throw new Error(
        'BASELINE alignment is only valid for horizontal auto-layout frames'
      );
    }
    node.counterAxisAlignItems = counterAxisAlignItems as CounterAxisAlign;
  }

  return {
    id: node.id,
    name: node.name,
    primaryAxisAlignItems: node.primaryAxisAlignItems as
      | PrimaryAxisAlign
      | undefined,
    counterAxisAlignItems: node.counterAxisAlignItems as
      | CounterAxisAlign
      | undefined,
    layoutMode: node.layoutMode,
  };
}

interface SetLayoutSizingResult {
  id: string;
  name: string;
  layoutSizingHorizontal: LayoutSizing | undefined;
  layoutSizingVertical: LayoutSizing | undefined;
  layoutMode: LayoutMode; // available in the Figma typings
}

/* ---------------------------------------------------------
   Main function – original code, just typed
--------------------------------------------------------- */
export async function setLayoutSizing(params: {
  nodeId: string;
  layoutSizingHorizontal?: LayoutSizing; // 'FIXED', 'HUG', 'FILL'
  layoutSizingVertical?: LayoutSizing; // 'FIXED', 'HUG', 'FILL'
}): Promise<SetLayoutSizingResult> {
  const { nodeId, layoutSizingHorizontal, layoutSizingVertical } = params || {};

  // Get the target node
  const node = (await figma.getNodeByIdAsync(nodeId)) as
    | FrameNode
    | ComponentNode
    | ComponentSetNode
    | InstanceNode
    | null;

  if (!node) {
    throw new Error(`Node with ID ${nodeId} not found`);
  }

  // Check if node is a frame or component that supports layout sizing
  if (
    node.type !== 'FRAME' &&
    node.type !== 'COMPONENT' &&
    node.type !== 'COMPONENT_SET' &&
    node.type !== 'INSTANCE'
  ) {
    throw new Error(`Node type ${node['type']} does not support layout sizing`);
  }

  // Check if the node has auto-layout enabled
  if (node.layoutMode === 'NONE') {
    throw new Error(
      'Layout sizing can only be set on auto-layout frames (layoutMode must not be NONE)'
    );
  }

  // Validate and set layoutSizingHorizontal if provided
  if (layoutSizingHorizontal !== undefined) {
    if (!['FIXED', 'HUG', 'FILL'].includes(layoutSizingHorizontal)) {
      throw new Error(
        'Invalid layoutSizingHorizontal value. Must be one of: FIXED, HUG, FILL'
      );
    }
    // HUG is only valid on auto-layout frames and text nodes
    if (
      layoutSizingHorizontal === 'HUG' &&
      !['FRAME', 'TEXT'].includes(node.type)
    ) {
      throw new Error(
        'HUG sizing is only valid on auto-layout frames and text nodes'
      );
    }
    // FILL is only valid on auto-layout children
    if (
      layoutSizingHorizontal === 'FILL' &&
      (!node.parent ||
        !('layoutMode' in node.parent) ||
        (node.parent as any).layoutMode === 'NONE')
    ) {
      throw new Error('FILL sizing is only valid on auto-layout children');
    }
    node.layoutSizingHorizontal = layoutSizingHorizontal as LayoutSizing;
  }

  // Validate and set layoutSizingVertical if provided
  if (layoutSizingVertical !== undefined) {
    if (!['FIXED', 'HUG', 'FILL'].includes(layoutSizingVertical)) {
      throw new Error(
        'Invalid layoutSizingVertical value. Must be one of: FIXED, HUG, FILL'
      );
    }
    // HUG is only valid on auto-layout frames and text nodes
    if (
      layoutSizingVertical === 'HUG' &&
      !['FRAME', 'TEXT'].includes(node.type)
    ) {
      throw new Error(
        'HUG sizing is only valid on auto-layout frames and text nodes'
      );
    }
    // FILL is only valid on auto-layout children
    if (
      layoutSizingHorizontal === 'FILL' &&
      (!node.parent ||
        !('layoutMode' in node.parent) ||
        (node.parent as any).layoutMode === 'NONE')
    ) {
      throw new Error('FILL sizing is only valid on auto-layout children');
    }
    node.layoutSizingVertical = layoutSizingVertical as LayoutSizing;
  }

  return {
    id: node.id,
    name: node.name,
    layoutSizingHorizontal: node.layoutSizingHorizontal as
      | LayoutSizing
      | undefined,
    layoutSizingVertical: node.layoutSizingVertical as LayoutSizing | undefined,
    layoutMode: node.layoutMode,
  };
}

interface SetItemSpacingResult {
  id: string;
  name: string;
  itemSpacing: number;
  layoutMode: LayoutMode; // from Figma typings
}

/* ---------------------------------------------------------
   Main function – original logic preserved
--------------------------------------------------------- */
export async function setItemSpacing(params: {
  nodeId: string;
  itemSpacing?: number; // in pixels, optional
}): Promise<SetItemSpacingResult> {
  const { nodeId, itemSpacing } = params || {};

  // Get the target node
  const node = (await figma.getNodeByIdAsync(nodeId)) as
    | FrameNode
    | ComponentNode
    | ComponentSetNode
    | InstanceNode
    | null;

  if (!node) {
    throw new Error(`Node with ID ${nodeId} not found`);
  }

  // Check if node is a frame or component that supports item spacing
  if (
    node.type !== 'FRAME' &&
    node.type !== 'COMPONENT' &&
    node.type !== 'COMPONENT_SET' &&
    node.type !== 'INSTANCE'
  ) {
    throw new Error(`Node type ${node['type']} does not support item spacing`);
  }

  // Check if the node has auto-layout enabled
  if (node.layoutMode === 'NONE') {
    throw new Error(
      'Item spacing can only be set on auto-layout frames (layoutMode must not be NONE)'
    );
  }

  // Set item spacing
  if (itemSpacing !== undefined) {
    if (typeof itemSpacing !== 'number') {
      throw new Error('Item spacing must be a number');
    }
    node.itemSpacing = itemSpacing;
  }

  return {
    id: node.id,
    name: node.name,
    itemSpacing: node.itemSpacing,
    layoutMode: node.layoutMode,
  };
}
