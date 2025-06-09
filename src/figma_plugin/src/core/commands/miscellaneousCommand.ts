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
