import {
  getErrorMessage,
  sendProgressUpdate,
  generateCommandId,
  delay,
  getLocalPosition,
  getAbsolutePosition,
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
  const [oldX, oldY] = getAbsolutePosition(node);

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
  newParentId?: string;
  x?: number;
  y?: number;
}) {
  const { nodeId, newParentId, x, y } = params || {};
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

    if (x !== undefined && y !== undefined) {
      if (newParentId) {
        // If newParentId is provided, append to that parent
        const newParent = (await figma.getNodeByIdAsync(
          newParentId
        )) as ChildrenMixin & SceneNode;
        if (!newParent) {
          throw new Error(`New parent node not found with ID: ${newParentId}`);
        }
        newParent.appendChild(clone as SceneNode);
      } else {
        // If no newParentId, append to the current page or the node's parent
        if (node.parent) {
          node.parent.appendChild(clone as SceneNode);
        } else {
          figma.currentPage.appendChild(clone as SceneNode);
        }
      }
      // Set position relative to the new parent
      const [localX, localY] = getLocalPosition(x, y, clone.parent);
      (clone as SceneNode).x = localX;
      (clone as SceneNode).y = localY;
    }

    const [newX, newY] = getAbsolutePosition(clone as SceneNode);

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
      x: newX,
      y: newY,
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

export async function reorderNode(params: {
  nodeId: string;
  direction: 'TOP' | 'BOTTOM' | 'FORWARD' | 'BACKWARD';
}) {
  const { nodeId, direction } = params || {};
  if (!nodeId) throw new Error('Missing nodeId');
  if (!direction) throw new Error('Missing direction');

  const node = (await figma.getNodeByIdAsync(nodeId)) as SceneNode | null;
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (!node.parent) throw new Error('Node has no parent – cannot reorder');

  const parent = node.parent as BaseNode & ChildrenMixin;
  const siblings = parent.children;
  const oldIndex = siblings.findIndex((n) => n.id === nodeId);
  if (oldIndex === -1) throw new Error('Node not in parent.children');

  let newIndex = 0;
  switch (direction) {
    case 'TOP':
      newIndex = siblings.length;
      break;
    case 'BOTTOM':
      newIndex = 0;
      break;
    case 'FORWARD':
      newIndex = Math.min(oldIndex + 2, siblings.length); // insertChild will place before the index
      break;
    case 'BACKWARD':
      newIndex = Math.max(oldIndex - 1, 0); // insertChild will move to the previous index
      break;
  }

  if (newIndex !== oldIndex) parent.insertChild(newIndex, node);

  return {
    id: node.id,
    name: node.name,
    parentId: parent.id,
    oldIndex,
    newIndex,
  };
}

export async function groupNodes(params: {
  nodeIds: string[];
  groupName?: string;
}) {
  const { nodeIds, groupName } = params || {};
  if (!Array.isArray(nodeIds) || nodeIds.length < 2)
    throw new Error('nodeIds must contain at least two IDs');

  const nodes: SceneNode[] = [];
  for (const id of nodeIds) {
    const n = (await figma.getNodeByIdAsync(id)) as SceneNode | null;
    if (!n) throw new Error(`Node not found: ${id}`);
    nodes.push(n);
  }

  // Determine / coerce parent
  let parent: ChildrenMixin & SceneNode = nodes[0].parent as ChildrenMixin &
    SceneNode;

  const group = figma.group(nodes, parent);
  if (groupName) group.name = groupName;

  return {
    groupId: group.id,
    name: group.name,
    parentId: parent.id,
    containedIds: nodes.map((n) => n.id),
  };
}

export async function ungroupNodes(params: { groupId: string }) {
  const { groupId } = params || {};
  if (!groupId) throw new Error('Missing groupId');

  const group = (await figma.getNodeByIdAsync(groupId)) as GroupNode | null;
  if (!group || group.type !== 'GROUP')
    throw new Error('Target node is not a GROUP');

  const parent = group.parent as BaseNode | null;
  const released = figma.ungroup(group);

  return {
    removedGroupId: groupId,
    parentId: parent ? parent.id : null,
    releasedIds: released.map((n) => n.id),
  };
}

export async function renameNode(params: { nodeId: string; newName: string }) {
  const { nodeId, newName } = params || {};
  if (!nodeId) throw new Error('Missing nodeId');
  if (newName === undefined) throw new Error('Missing newName');

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const oldName = node.name;
  node.name = newName;

  return { id: node.id, oldName, newName };
}
