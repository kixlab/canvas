import {
  getErrorMessage,
  sendProgressUpdate,
  generateCommandId,
  delay,
  getLocalPosition,
} from '../utils';
import { hasClone } from '../figma-api';

export async function moveNode(params: {
  nodeId: string;
  x: number;
  y: number;
  newParentId?: string;
}) {
  const { nodeId, x, y, newParentId } = params || {};

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

  const oldX =
    'x' in node && node.absoluteBoundingBox
      ? node.absoluteBoundingBox.x
      : undefined;
  const oldY =
    'y' in node && node.absoluteBoundingBox
      ? node.absoluteBoundingBox.y
      : undefined;

  // Set Parent if provided
  if (newParentId && node.parent?.id !== newParentId) {
    const newParent = (await figma.getNodeByIdAsync(
      newParentId
    )) as ChildrenMixin & SceneNode;
    if (!newParent) {
      throw new Error(`New parent node not found with ID: ${newParentId}`);
    }
    newParent.appendChild(node);
  }

  // Set Coordinates
  const [newX, newY] = getLocalPosition(x, y, node.parent ? node.parent : null);

  node.x = newX;
  node.y = newY;

  const parentId = node.parent ? node.parent.id : null;

  return {
    name: node.name,
    id: node.id,
    parentId: parentId,
    oldX: oldX,
    oldY: oldY,
    newX: node.x,
    newY: node.y,
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

export async function deleteNode(params: { nodeIds: string[] }) {
  const { nodeIds } = params || {};
  if (!Array.isArray(nodeIds)) throw new Error('nodeIds must be an array');

  const commandId = generateCommandId();
  const deleted: any[] = [];
  const errors: any[] = [];
  const total = nodeIds.length;

  try {
    sendProgressUpdate(
      commandId,
      'deleteNode',
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
            const nodeInfo = { id: node.id, name: node.name, type: node.type };
            node.remove();
            deleted.push(nodeInfo);

            sendProgressUpdate(
              commandId,
              'deleteNode',
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
        await delay(200);
      }
    }

    sendProgressUpdate(
      commandId,
      'deleteNode',
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
