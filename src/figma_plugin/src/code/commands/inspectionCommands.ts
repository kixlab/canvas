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

export async function getNodeInfo(params: { nodeId: string }) {
  const { nodeId } = params || {};
  if (!nodeId) {
    throw new Error('Missing nodeId parameter');
  }
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

export async function getNodesInfo(params: { nodeIds: string[] }) {
  try {
    const { nodeIds } = params || {};
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
      throw new Error('Missing or invalid nodeIds parameter');
    }
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

interface ScanNodesByTypesResult {
  success: boolean;
  message: string;
  count: number;
  matchingNodes: MinimalNodeMatch[];
  searchedTypes: string[];
}

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
