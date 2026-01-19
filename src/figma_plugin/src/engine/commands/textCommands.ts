import {
  sendProgressUpdate,
  setCharacters,
  generateCommandId,
  findTextNodes,
  processTextNode,
  collectNodesToProcess,
  delay,
} from '../utils';
import { NodeInfo, MinimalTextNode } from '../types';

// Throttle chunk updates to avoid UI lockups.
const TEXT_CHUNK_CHANGE_DELAY = 500;

export async function setNodeCharacters(params: {
  nodeId: string;
  text: string;
}) {
  const { nodeId, text } = params || {};

  try {
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
    throw error;
  }
}

export async function getTextNodeInfo(params: {
  nodeId: string;
  useChunking?: boolean;
  chunkSize?: number;
  commandId?: string;
}): Promise<any> {
  const {
    nodeId,
    useChunking = true,
    chunkSize = 10,
    commandId = generateCommandId(),
  } = params;

  const node = await figma.getNodeByIdAsync(nodeId);

  if (!node) {
    const msg = `Node with ID ${nodeId} not found`;
    console.error(msg);
    sendProgressUpdate(commandId, 'get_text_node_info', 'error', 0, 0, 0, msg, {
      error: msg,
    });
    throw new Error(msg);
  }

  if (!useChunking) {
    try {
      sendProgressUpdate(
        commandId,
        'get_text_node_info',
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
        'get_text_node_info',
        'completed',
        100,
        textNodes.length,
        textNodes.length,
        `Scan complete. Found ${textNodes.length} text nodes.`,
        { textNodes }
      );

      return {
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
      sendProgressUpdate(
        commandId,
        'get_text_node_info',
        'error',
        0,
        0,
        0,
        msg,
        {
          error: error.message,
        }
      );
      throw error;
    }
  }

  sendProgressUpdate(
    commandId,
    'get_text_node_info',
    'started',
    0,
    0,
    0,
    `Starting chunked scan of node “${node.name ?? nodeId}”`,
    { chunkSize }
  );

  const nodesToProcessInfo: NodeInfo[] = [];
  await collectNodesToProcess(node, [], 0, nodesToProcessInfo);

  const totalNodes = nodesToProcessInfo.length;
  const totalChunks = Math.max(1, Math.ceil(totalNodes / chunkSize));

  console.log(`Found ${totalNodes} total nodes to process`);
  console.log(`Will process in ${totalChunks} chunks`);

  sendProgressUpdate(
    commandId,
    'get_text_node_info',
    'in_progress',
    5,
    totalNodes,
    0,
    `Found ${totalNodes} nodes. Processing in ${totalChunks} chunks.`,
    { totalNodes, totalChunks, chunkSize }
  );

  const allTextNodes: MinimalTextNode[] = [];
  let processedNodes = 0;
  let chunksProcessed = 0;

  for (let i = 0; i < totalNodes; i += chunkSize) {
    const chunkEnd = Math.min(i + chunkSize, totalNodes);
    const chunkNodesInfo = nodesToProcessInfo.slice(i, chunkEnd);
    chunksProcessed += 1;

    sendProgressUpdate(
      commandId,
      'get_text_node_info',
      'in_progress',
      Math.round(5 + ((chunksProcessed - 1) / totalChunks) * 90),
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
      await delay(5);
    }

    allTextNodes.push(...chunkTextNodes);
    processedNodes += chunkNodesInfo.length;
    chunksProcessed++;

    sendProgressUpdate(
      commandId,
      'get_text_node_info',
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

    if (i + chunkSize < totalNodes) await delay(50);
  }

  sendProgressUpdate(
    commandId,
    'get_text_node_info',
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
    message: `Chunked scan complete. Found ${allTextNodes.length} text nodes.`,
    totalNodes: allTextNodes.length,
    processedNodes,
    chunks: chunksProcessed,
    textNodes: allTextNodes,
    commandId,
  };
}

interface TextChanges {
  nodeId: string;
  text: string;
}

interface ChangeResult {
  success: boolean;
  nodeId: string;
  originalText?: string;
  translatedText?: string;
  error?: string;
}

interface SetTextContentResult {
  success: boolean;
  changesApplied: number;
  changesFailed: number;
  totalChanges: number;
  results: ChangeResult[];
  completedInChunks: number;
  commandId: string;
}

export async function setTextContent(params: {
  changes: TextChanges[];
  commandId?: string;
}): Promise<SetTextContentResult> {
  const { changes } = params ?? {};
  const commandId = params.commandId ?? generateCommandId();

  if (!changes || !Array.isArray(changes)) {
    const errorMsg = 'Missing required parameters: changes array';

    sendProgressUpdate(
      commandId,
      'set_text_content',
      'error',
      0,
      0,
      0,
      errorMsg,
      { error: errorMsg }
    );

    throw new Error(errorMsg);
  }

  console.log(`Starting text change for ${changes.length} nodes`);

  sendProgressUpdate(
    commandId,
    'set_text_content',
    'started',
    0,
    changes.length,
    0,
    `Starting text change for ${changes.length} nodes`,
    { totalChanges: changes.length }
  );

  const results: ChangeResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  const CHUNK_SIZE = 5;
  const chunks: TextChanges[][] = [];

  for (let i = 0; i < changes.length; i += CHUNK_SIZE) {
    chunks.push(changes.slice(i, i + CHUNK_SIZE));
  }

  console.log(`Split ${changes.length} changes into ${chunks.length} chunks`);

  sendProgressUpdate(
    commandId,
    'set_text_content',
    'in_progress',
    5,
    changes.length,
    0,
    `Preparing to change text in ${changes.length} nodes using ${chunks.length} chunks`,
    {
      totalChanges: changes.length,
      chunks: chunks.length,
      chunkSize: CHUNK_SIZE,
    }
  );

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    console.log(
      `Processing chunk ${chunkIndex + 1}/${chunks.length} with ${chunk.length} changes`
    );

    sendProgressUpdate(
      commandId,
      'set_text_content',
      'in_progress',
      Math.round(5 + (chunkIndex / chunks.length) * 90),
      changes.length,
      successCount + failureCount,
      `Processing text changes chunk ${chunkIndex + 1}/${chunks.length}`,
      {
        currentChunk: chunkIndex + 1,
        totalChunks: chunks.length,
        successCount,
        failureCount,
      }
    );

    const chunkPromises = chunk.map(
      async (replacement): Promise<ChangeResult> => {
        if (!replacement.nodeId || replacement.text === undefined) {
          throw new Error(
            `Missing nodeId or text for replacement: ${JSON.stringify(replacement)}`
          );
        }

        try {
          console.log(
            `Attempting to change text in node: ${replacement.nodeId}`
          );

          const textNode = (await figma.getNodeByIdAsync(
            replacement.nodeId
          )) as TextNode | undefined;

          if (!textNode) {
            throw new Error(`Node not found: ${replacement.nodeId}`);
          }

          const originalText = textNode.characters;
          console.log(`Original text: "${originalText}"`);
          console.log(`Will translate to: "${replacement.text}"`);

          await setNodeCharacters({
            nodeId: replacement.nodeId,
            text: replacement.text,
          });

          console.log(
            `Successfully changed text in node: ${replacement.nodeId}`
          );
          return {
            success: true,
            nodeId: replacement.nodeId,
            originalText,
            translatedText: replacement.text,
          };
        } catch (error: any) {
          throw new Error(
            `Failed to change text in node "${replacement.nodeId}". ${error}`
          );
        }
      }
    );

    const chunkResults = await Promise.all(chunkPromises);

    for (const r of chunkResults) {
      r.success ? successCount++ : failureCount++;
      results.push(r);
    }

    sendProgressUpdate(
      commandId,
      'set_text_content',
      'in_progress',
      Math.round(5 + ((chunkIndex + 1) / chunks.length) * 90),
      changes.length,
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

    if (chunkIndex < chunks.length - 1) {
      console.log('Pausing between chunks to avoid overloading Figma...');
      await delay(TEXT_CHUNK_CHANGE_DELAY);
    }
  }

  console.log(
    `Change complete: ${successCount} successful, ${failureCount} failed`
  );

  sendProgressUpdate(
    commandId,
    'set_text_content',
    'completed',
    100,
    changes.length,
    successCount + failureCount,
    `Text change complete: ${successCount} successful, ${failureCount} failed`,
    {
      totalChanges: changes.length,
      changesApplied: successCount,
      changesFailed: failureCount,
      completedInChunks: chunks.length,
      results,
    }
  );

  return {
    success: successCount > 0,
    changesApplied: successCount,
    changesFailed: failureCount,
    totalChanges: changes.length,
    results,
    completedInChunks: chunks.length,
    commandId,
  };
}

export async function setTextProperties(params: {
  nodeId: string;
  fontSize?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM';
}): Promise<any> {
  const { nodeId, ...props } = params;

  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== 'TEXT')
      throw new Error(`Text node not found: ${nodeId}`);

    await figma.loadFontAsync(node.fontName as FontName);

    if (props.fontSize !== undefined) node.fontSize = props.fontSize;
    if (props.lineHeight !== undefined)
      node.lineHeight = { value: props.lineHeight, unit: 'PIXELS' };
    if (props.letterSpacing !== undefined)
      node.letterSpacing = { value: props.letterSpacing, unit: 'PIXELS' };
    if (props.textAlignHorizontal !== undefined)
      node.textAlignHorizontal = props.textAlignHorizontal;
    if (props.textAlignVertical !== undefined)
      node.textAlignVertical = props.textAlignVertical;

    return { nodeId };
  } catch (error: any) {
    throw new Error(
      `Failed to set text properties for node "${nodeId}". ${error}`
    );
  }
}

export async function setTextDecoration(params: {
  nodeId: string;
  textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
  textCase?:
    | 'ORIGINAL'
    | 'UPPER'
    | 'LOWER'
    | 'TITLE'
    | 'SMALL_CAPS'
    | 'SMALL_CAPS_FORCED';
}): Promise<any> {
  const { nodeId, textDecoration, textCase } = params;
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== 'TEXT')
      throw new Error(`Text node not found: ${nodeId}`);

    await figma.loadFontAsync(node.fontName as FontName);

    if (textDecoration !== undefined) node.textDecoration = textDecoration;
    if (textCase !== undefined) node.textCase = textCase;

    return { nodeId };
  } catch (error: any) {
    throw new Error(
      `Failed to set text decoration for node "${nodeId}". ${error}`
    );
  }
}

export async function setTextFont(params: {
  nodeId: string;
  font: FontName;
}): Promise<any> {
  const { nodeId, font } = params;
  try {
    await figma.loadFontAsync(font);

    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type !== 'TEXT')
      throw new Error(`Text node not found: ${nodeId}`);

    node.fontName = font;

    return { nodeId };
  } catch (error: any) {
    throw new Error(`Failed to set font for node "${nodeId}". ${error}`);
  }
}
