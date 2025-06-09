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
} from '../utils';
import { hasAppendChild, hasClone, hasExportAsync } from '../figma-api';
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
} from '../types';

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
