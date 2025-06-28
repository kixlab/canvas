import {
  getErrorMessage,
  sendProgressUpdate,
  generateCommandId,
  findNodesByTypes,
  distillNodeInfo,
  customBase64Encode,
  getAbsolutePosition,
} from '../utils';
import { MinimalNodeMatch, ImageFormat } from '../types';

export async function getPageInfo() {
  await figma.currentPage.loadAsync();
  const page = figma.currentPage;

  const childrenNodes = page.children;

  const buckets: Record<string, SceneNode[]> = {};
  for (const node of childrenNodes) {
    const keyValue = node.type.toLowerCase();
    (buckets[keyValue] ??= []).push(node);
  }

  const info: Record<string, any> = {
    id: page.id,
    name: page.name,
    childrenCount: childrenNodes.length,
  };

  for (const [type, nodes] of Object.entries(buckets)) {
    info[type] = nodes.map((n) => {
      const nodeInfo = distillNodeInfo(n);
      return nodeInfo;
    });
  }

  return info;
}

export async function getSelectionInfo() {
  try {
    const nodes = await Promise.all(
      figma.currentPage.selection.map((node) => figma.getNodeByIdAsync(node.id))
    );
    const validNodes = nodes.filter((node) => node !== null);
    const nodeList = await Promise.all(
      validNodes.map(async (node) => {
        return {
          nodeId: node.id,
          nodeInfo: distillNodeInfo(node),
        };
      })
    );
    return { nodeList };
  } catch (error) {
    throw new Error(`Error getting nodes info: ${getErrorMessage(error)}`);
  }
}

export async function getNodeInfo(params: { nodeIds: string[] }) {
  try {
    const { nodeIds } = params || {};
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
      throw new Error('Missing or invalid nodeIds parameter');
    }

    const nodes = await Promise.all(
      nodeIds.map((id) => figma.getNodeByIdAsync(id))
    );
    const validNodes = nodes.filter((node) => node !== null);
    const nodeList = await Promise.all(
      validNodes.map(async (node) => {
        return {
          nodeId: node.id,
          nodeInfo: distillNodeInfo(node),
        };
      })
    );

    return { nodeList };
  } catch (error) {
    throw new Error(`Error getting nodes info: ${getErrorMessage(error)}`);
  }
}

interface GetNodeSummaryByTypeResult {
  success: boolean;
  message: string;
  count: number;
  matchingNodes: MinimalNodeMatch[];
  searchedTypes: string[];
}

export async function getNodeInfoByTypes(params: {
  nodeId: string;
  types: string[];
}): Promise<GetNodeSummaryByTypeResult> {
  const { nodeId, types = [] } = params ?? {};

  if (!types || types.length === 0) {
    throw new Error('No types specified to search for');
  }

  const node = await figma.getNodeByIdAsync(nodeId);

  if (!node) {
    throw new Error(`Node with ID ${nodeId} not found`);
  }

  const matchingNodes: MinimalNodeMatch[] = [];

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

  await findNodesByTypes(node, types, matchingNodes);

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

  return {
    success: true,
    message: `Found ${matchingNodes.length} matching nodes.`,
    count: matchingNodes.length,
    matchingNodes,
    searchedTypes: types,
  };
}

interface ExportPageImageResult {
  pageId: string;
  format: ImageFormat;
  scale: number;
  mimeType: string;
  imageData: string; // base64
}

export async function getResultImage(opts?: {
  pageId?: string;
  format?: ImageFormat;
  scale?: number;
}): Promise<ExportPageImageResult> {
  const {
    pageId = figma.currentPage.id,
    format = 'PNG',
    scale = 1,
  } = opts || {};

  const page = (await figma.getNodeByIdAsync(pageId)) as PageNode | null;
  if (!page) throw new Error(`Page not found: ${pageId}`);

  const exportable = page.children.filter(
    (n): n is SceneNode & ExportMixin => 'exportAsync' in n && n.visible
  );
  if (exportable.length === 0) {
    // return empty image if no exportable nodes found
    return {
      pageId,
      format,
      scale,
      mimeType: 'image/png',
      imageData:
        'iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAABYGlDQ1BJQ0MgUHJvZmlsZQAAKJFtkD9Iw2AQxV+1GpBCHYpYcOggTlVqtOja1r9YsFQL6pamMRHS9COJiJuDbgoFXQQHqYuToy4Krk4KgoOouDqL7aAl3teqadU7jvvxuDuOB7T4JMZ0L4C8YZvpyXhoYXEpJLygHQFKPwRJtlgslUrSCL57c5Tv4OH9tp/fqmj6wUTlYmZ7xwrOnlw9/p1vio6cYsnUP6hEmZk24IkQp9ZsxnmDOGDSU8R7nNU6H3PO1vm8NjOfThDfEHfKmpQjfiYOZxt0tYHz+qr89QP/3qcYmTnqXVQ9GMM4kpQhZCBiBIOIYoo8+n9nuLaTQAEM6zCxAhUabNqOkcKgQyGehgEZAwgTi4hQRbnXvz10tUIJGH0DWouult0HzraA7ntX6z0E/JvA6TWTTOnHWU/Zay0PiXX2xYG2J8d57QOEXaBadJz3kuNUj+j+A3BpfAL94GVT8TIAFQAAAFZlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA5KGAAcAAAASAAAARKACAAQAAAABAAAAMqADAAQAAAABAAAAMgAAAABBU0NJSQAAAFNjcmVlbnNob3QDwy7XAAAB1GlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iWE1QIENvcmUgNi4wLjAiPgogICA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPgogICAgICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIgogICAgICAgICAgICB4bWxuczpleGlmPSJodHRwOi8vbnMuYWRvYmUuY29tL2V4aWYvMS4wLyI+CiAgICAgICAgIDxleGlmOlBpeGVsWURpbWVuc2lvbj41MDwvZXhpZjpQaXhlbFlEaW1lbnNpb24+CiAgICAgICAgIDxleGlmOlBpeGVsWERpbWVuc2lvbj41MDwvZXhpZjpQaXhlbFhEaW1lbnNpb24+CiAgICAgICAgIDxleGlmOlVzZXJDb21tZW50PlNjcmVlbnNob3Q8L2V4aWY6VXNlckNvbW1lbnQ+CiAgICAgIDwvcmRmOkRlc2NyaXB0aW9uPgogICA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgp2aofOAAAAlklEQVRoBe2S0QnAIBDFrPvvbEtHCATkiP8vcInP+d4a8PaAG/4TOuS2khWpiGSgryWJxdiKYHXSsCKSWIytCFYnDSsiicXYimB10rAikliMrQhWJw0rIonF2IpgddKwIpJYjK0IVicNKyKJxdiKYHXSsCKSWIytCFYnDSsiicXYimB10rAikliMrQhWJw0rIonF2DFFXjzEBGCQom4fAAAAAElFTkSuQmCC',
    };
  }

  const group = figma.group(exportable, page);

  try {
    const bytes = await group.exportAsync({
      format,
      constraint: { type: 'SCALE', value: scale },
    } as ExportSettingsImage);

    const mimeType =
      format === 'JPG'
        ? 'image/jpeg'
        : format === 'SVG'
          ? 'image/svg+xml'
          : 'image/png';

    return {
      pageId,
      format,
      scale,
      mimeType,
      imageData: customBase64Encode(bytes),
    };
  } finally {
    figma.ungroup(group as GroupNode);
  }
}

interface StructureInfo {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number };
  children?: StructureInfo[];
}
export async function getPageStructure() {
  await figma.currentPage.loadAsync();

  function buildLayerInfo(node: SceneNode): StructureInfo {
    const [x, y] = getAbsolutePosition(node);

    const info: StructureInfo = {
      id: node.id,
      name: node.name,
      type: node.type,
      position: { x, y },
    };

    if ('children' in node && node.children.length) {
      info.children = (node.children as SceneNode[]).map(buildLayerInfo);
    }

    return info;
  }

  const structureTree = figma.currentPage.children.map((n) =>
    buildLayerInfo(n as SceneNode)
  );

  return {
    pageId: figma.currentPage.id,
    pageName: figma.currentPage.name,
    structureTree,
  };
}
