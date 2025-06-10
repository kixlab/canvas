import {
  getErrorMessage,
  sendProgressUpdate,
  generateCommandId,
  delay,
} from '../utils';
import { hasClone } from '../figma-api';

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
