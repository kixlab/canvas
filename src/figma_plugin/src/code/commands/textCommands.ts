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
