import type {
  NodeInfo,
  ProgressPayload,
  ProgressStatus,
  ProgressUpdate,
  MinimalTextNode,
  MinimalNodeMatch,
} from './types';

export function rgbaToHex(color: {
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
    return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  return (
    '#' + [r, g, b, a].map((x) => x.toString(16).padStart(2, '0')).join('')
  );
}

export function safeParseFloat(val: any, fallback: number = 0): number {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function makeSolidPaint(color: {
  r: number;
  g: number;
  b: number;
  a?: number;
}): SolidPaint {
  return {
    type: 'SOLID',
    color: { r: color.r, g: color.g, b: color.b },
    opacity: color.a !== undefined ? color.a : 1,
  };
}

export function sendProgressUpdate(
  commandId: string,
  commandType: string,
  status: ProgressStatus,
  progress: number,
  totalItems: number,
  processedItems: number,
  message: string,
  payload: ProgressPayload = null
) {
  const update: ProgressUpdate = {
    type: 'command-progress',
    commandId,
    commandType,
    status,
    progress,
    totalItems,
    processedItems,
    message,
    timestamp: Date.now(),
  };
  if (payload) {
    if (
      typeof payload === 'object' &&
      'currentChunk' in payload &&
      'totalChunks' in payload
    ) {
      update.currentChunk = payload.currentChunk;
      update.totalChunks = payload.totalChunks;
      update.chunkSize = payload.chunkSize;
    }
    update.payload = payload;
  }
  figma.ui.postMessage(update);
  console.log(`Progress update: ${status} - ${progress}% - ${message}`);
  return update;
}

type PropertyAccessor<T, K extends PropertyKey> = ((item: T) => K) | keyof T;

function uniqBy<T, K extends PropertyKey>(
  arr: T[],
  predicate: PropertyAccessor<T, K>
): T[] {
  const cb: (item: T) => K =
    typeof predicate === 'function'
      ? (predicate as (item: T) => K)
      : (((o: T) => (o as any)[predicate as keyof T]) as (item: T) => K);

  const seen = new Map<K, T>();

  for (const item of arr) {
    if (item == null) continue; // keep original null/undefined skip
    const key = cb(item);
    if (!seen.has(key)) seen.set(key, item);
  }

  return Array.from(seen.values());
}

const getDelimiterPos = (
  str: string,
  delimiter: string,
  startIdx: number = 0,
  endIdx: number = str.length
): [number, number][] => {
  const indices: [number, number][] = [];
  let temp = startIdx;

  for (let i = startIdx; i < endIdx; i++) {
    if (
      str[i] === delimiter &&
      i + startIdx !== endIdx &&
      temp !== i + startIdx
    ) {
      indices.push([temp, i + startIdx]);
      temp = i + startIdx + 1;
    }
  }

  if (temp !== endIdx) {
    indices.push([temp, endIdx]);
  }

  return indices.filter(Boolean) as [number, number][];
};

interface FontRunInfo {
  start: number;
  delimiter: string;
  family: string;
  style: string;
}

interface RangeItem {
  family: string;
  style: string;
  delimiter: string;
}

const buildLinearOrder = (node: TextNode): RangeItem[] => {
  const fontTree: FontRunInfo[] = [];

  // Collect newline ranges first
  const newLinesPos = getDelimiterPos(node.characters, '\n');

  newLinesPos.forEach(([newLinesRangeStart, newLinesRangeEnd]) => {
    const newLinesRangeFont = node.getRangeFontName(
      newLinesRangeStart,
      newLinesRangeEnd
    ) as FontName | typeof figma.mixed;

    if (newLinesRangeFont === figma.mixed) {
      // If newline range itself is mixed, break it down by spaces
      const spacesPos = getDelimiterPos(
        node.characters,
        ' ',
        newLinesRangeStart,
        newLinesRangeEnd
      );

      spacesPos.forEach(([spacesRangeStart, spacesRangeEnd]) => {
        const spacesRangeFont = node.getRangeFontName(
          spacesRangeStart,
          spacesRangeEnd
        ) as FontName | typeof figma.mixed;

        if (spacesRangeFont === figma.mixed) {
          // Edge case: single char – fall back to first-char font
          const firstCharFont = node.getRangeFontName(
            spacesRangeStart,
            spacesRangeStart + 1
          ) as FontName;
          fontTree.push({
            start: spacesRangeStart,
            delimiter: ' ',
            family: firstCharFont.family,
            style: firstCharFont.style,
          });
        } else {
          fontTree.push({
            start: spacesRangeStart,
            delimiter: ' ',
            family: spacesRangeFont.family,
            style: spacesRangeFont.style,
          });
        }
      });
    } else {
      // Newline range is uniform
      fontTree.push({
        start: newLinesRangeStart,
        delimiter: '\n',
        family: newLinesRangeFont.family,
        style: newLinesRangeFont.style,
      });
    }
  });

  // Sort by start index, then strip to {family, style, delimiter}
  return fontTree
    .sort((a, b) => a.start - b.start)
    .map(({ family, style, delimiter }) => ({ family, style, delimiter }));
};

interface RangeItem {
  family: string;
  style: string;
  delimiter: string;
}

const setCharactersWithSmartMatchFont = async (
  node: TextNode,
  characters: string,
  fallbackFont: FontName
): Promise<boolean> => {
  const rangeTree: RangeItem[] = buildLinearOrder(node);

  const fontsToLoad: FontName[] = uniqBy(
    rangeTree,
    ({ family, style }) => `${family}::${style}`
  ).map(({ family, style }) => ({ family, style }));

  // Load every distinct font plus the fallback
  await Promise.all([...fontsToLoad, fallbackFont].map(figma.loadFontAsync));

  // Apply fallback font globally, then set new characters
  node.fontName = fallbackFont;
  node.characters = characters;

  // Walk through rangeTree and re-apply the per-range fonts
  let prevPos = 0;
  rangeTree.forEach(({ family, style, delimiter }) => {
    if (prevPos < node.characters.length) {
      const delimiterPos = node.characters.indexOf(delimiter, prevPos);
      const endPos =
        delimiterPos > prevPos ? delimiterPos : node.characters.length;

      const matchedFont: FontName = { family, style };
      node.setRangeFontName(prevPos, endPos, matchedFont);

      prevPos = endPos + 1;
    }
  });

  return true;
};

const setCharactersWithStrictMatchFont = async (
  node: TextNode,
  characters: string,
  fallbackFont: FontName
): Promise<boolean> => {
  const fontHashTree: Record<string, string> = {};

  // Build a map { "startIdx_endIdx" → "Family::Style" } for each uniform run
  for (let i = 1; i < node.characters.length; i++) {
    const startIdx = i - 1;
    const startCharFont = node.getRangeFontName(startIdx, i) as FontName;
    const startCharFontVal = `${startCharFont.family}::${startCharFont.style}`;

    while (i < node.characters.length) {
      i++;
      const charFont = node.getRangeFontName(i - 1, i) as FontName;
      if (startCharFontVal !== `${charFont.family}::${charFont.style}`) {
        break;
      }
    }
    fontHashTree[`${startIdx}_${i}`] = startCharFontVal;
  }

  // Apply fallback font globally, then update characters
  await figma.loadFontAsync(fallbackFont);
  node.fontName = fallbackFont;
  node.characters = characters;

  console.log(fontHashTree);

  // Restore original fonts for each contiguous run
  await Promise.all(
    Object.keys(fontHashTree).map(async (range) => {
      console.log(range, fontHashTree[range]);
      const [start, end] = range.split('_');
      const [family, style] = fontHashTree[range].split('::');
      const matchedFont: FontName = { family, style };

      await figma.loadFontAsync(matchedFont);
      return node.setRangeFontName(Number(start), Number(end), matchedFont);
    })
  );

  return true;
};

type SmartStrategy = 'prevail' | 'strict' | 'experimental';

interface SmartFontOptions {
  fallbackFont?: FontName; // e.g. { family: 'Inter', style: 'Regular' }
  smartStrategy?: SmartStrategy; // strategy selector
}

export async function setCharacters(
  node: TextNode,
  characters: string,
  options?: SmartFontOptions
): Promise<boolean> {
  const fallbackFont: FontName = (options && options.fallbackFont) || {
    family: 'Inter',
    style: 'Regular',
  };

  try {
    // ── Font loading branch ──────────────────────────────
    if (node.fontName === figma.mixed) {
      if (options && options.smartStrategy === 'prevail') {
        const fontHashTree: Record<string, number> = {};

        for (let i = 1; i < node.characters.length; i++) {
          const charFont = node.getRangeFontName(i - 1, i);
          if (
            typeof charFont === 'object' &&
            'family' in charFont &&
            'style' in charFont
          ) {
            const key = `${charFont.family}::${charFont.style}`;
            fontHashTree[key] = fontHashTree[key] ? fontHashTree[key] + 1 : 1;
          }
        }

        const prevailedTreeItem = Object.entries(fontHashTree).sort(
          (a, b) => b[1] - a[1]
        )[0];
        const [family, style] = prevailedTreeItem[0].split('::');
        const prevailedFont: FontName = { family, style };

        await figma.loadFontAsync(prevailedFont);
        node.fontName = prevailedFont;
      } else if (options && options.smartStrategy === 'strict') {
        return setCharactersWithStrictMatchFont(node, characters, fallbackFont);
      } else if (options && options.smartStrategy === 'experimental') {
        return setCharactersWithSmartMatchFont(node, characters, fallbackFont);
      } else {
        const firstCharFont = node.getRangeFontName(0, 1) as FontName;
        await figma.loadFontAsync(firstCharFont);
        node.fontName = firstCharFont;
      }
    } else {
      await figma.loadFontAsync({
        family: (node.fontName as FontName).family,
        style: (node.fontName as FontName).style,
      });
    }
  } catch (err) {
    console.warn(
      `Failed to load "${
        (node.fontName as FontName)['family']
      } ${(node.fontName as FontName)['style']}" font and replaced with fallback "${fallbackFont.family} ${fallbackFont.style}"`,
      err
    );
    await figma.loadFontAsync(fallbackFont);
    node.fontName = fallbackFont;
  }

  try {
    node.characters = characters;
    return true;
  } catch (err) {
    console.warn('Failed to set characters. Skipped.', err);
    return false;
  }
}

export function generateCommandId() {
  return (
    'cmd_' +
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

export async function processTextNode(
  node: TextNode,
  parentPath: string[],
  depth: number
) {
  if (node.type !== 'TEXT') return null;

  try {
    let fontFamily = '';
    let fontStyle = '';

    if (node.fontName) {
      if (typeof node.fontName === 'object') {
        if ('family' in node.fontName) fontFamily = node.fontName.family;
        if ('style' in node.fontName) fontStyle = node.fontName.style;
      }
    }

    const safeTextNode = {
      id: node.id,
      name: node.name || 'Text',
      type: node.type,
      characters: node.characters,
      fontSize: typeof node.fontSize === 'number' ? node.fontSize : 0,
      fontFamily: fontFamily,
      fontStyle: fontStyle,
      x: typeof node.x === 'number' ? node.x : 0,
      y: typeof node.y === 'number' ? node.y : 0,
      width: typeof node.width === 'number' ? node.width : 0,
      height: typeof node.height === 'number' ? node.height : 0,
      path: parentPath.join(' > '),
      depth: depth,
    };

    try {
      const originalFills = JSON.parse(JSON.stringify(node.fills));
      node.fills = [
        {
          type: 'SOLID',
          color: { r: 1, g: 0.5, b: 0 },
          opacity: 0.3,
        },
      ];

      await delay(100);

      try {
        node.fills = originalFills;
      } catch (err) {
        console.error('Error resetting fills:', err);
      }
    } catch (highlightErr) {
      console.error('Error highlighting text node:', highlightErr);
      // Continue anyway, highlighting is just visual feedback
    }

    return safeTextNode;
  } catch (nodeErr) {
    console.error('Error processing text node:', nodeErr);
    return null;
  }
}

export async function findTextNodes(
  node: BaseNode,
  parentPath: string[] = [],
  depth: number = 0,
  textNodes: MinimalTextNode[] = []
): Promise<void> {
  if ('visible' in node && node.visible === false) return;

  const nodePath = [...parentPath, node.name || `Unnamed ${node.type}`];

  if (node.type === 'TEXT') {
    try {
      let fontFamily = '';
      let fontStyle = '';

      if (node.fontName) {
        if (typeof node.fontName === 'object') {
          if ('family' in node.fontName) fontFamily = node.fontName.family;
          if ('style' in node.fontName) fontStyle = node.fontName.style;
        }
      }

      const safeTextNode = {
        id: node.id,
        name: node.name || 'Text',
        type: node.type,
        characters: node.characters,
        fontSize: typeof node.fontSize === 'number' ? node.fontSize : 0,
        fontFamily: fontFamily,
        fontStyle: fontStyle,
        x: typeof node.x === 'number' ? node.x : 0,
        y: typeof node.y === 'number' ? node.y : 0,
        width: typeof node.width === 'number' ? node.width : 0,
        height: typeof node.height === 'number' ? node.height : 0,
        path: nodePath.join(' > '),
        depth: depth,
      };

      try {
        const originalFills = JSON.parse(JSON.stringify(node.fills));
        node.fills = [
          {
            type: 'SOLID',
            color: { r: 1, g: 0.5, b: 0 },
            opacity: 0.3,
          },
        ];

        await delay(500);

        try {
          node.fills = originalFills;
        } catch (err) {
          console.error('Error resetting fills:', err);
        }
      } catch (highlightErr) {
        console.error('Error highlighting text node:', highlightErr);
      }

      textNodes.push(safeTextNode);
    } catch (nodeErr) {
      console.error('Error processing text node:', nodeErr);
    }
  }

  if ('children' in node) {
    for (const child of node.children) {
      await findTextNodes(child, nodePath, depth + 1, textNodes);
    }
  }
}

export async function collectNodesToProcess(
  node: BaseNode,
  parentPath: string[] = [],
  depth: number = 0,
  nodesToProcess: NodeInfo[] = []
): Promise<void> {
  if ('visible' in node && node.visible === false) return;

  const nodePath = [...parentPath, node.name || `Unnamed ${node.type}`];

  nodesToProcess.push({
    node: node,
    parentPath: nodePath,
    depth: depth,
  });

  if ('children' in node) {
    for (const child of node.children) {
      await collectNodesToProcess(child, nodePath, depth + 1, nodesToProcess);
    }
  }
}

export async function findNodesByTypes(
  node: SceneNode | BaseNode,
  types: string[],
  matchingNodes: MinimalNodeMatch[] = []
): Promise<void> {
  if ('visible' in node && node.visible === false) return;

  if (types.includes(node.type)) {
    matchingNodes.push({
      id: node.id,
      name: node.name || `Unnamed ${node.type}`,
      type: node.type,
      bbox: {
        x: typeof (node as any).x === 'number' ? (node as any).x : 0,
        y: typeof (node as any).y === 'number' ? (node as any).y : 0,
        width:
          typeof (node as any).width === 'number' ? (node as any).width : 0,
        height:
          typeof (node as any).height === 'number' ? (node as any).height : 0,
      },
    });
  }

  if ('children' in node) {
    for (const child of node.children) {
      await findNodesByTypes(child, types, matchingNodes);
    }
  }
}

export function uint8ArrayToBase64(uint8Array: Uint8Array) {
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

export function customBase64Encode(bytes: Uint8Array): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';

  const byteLength = bytes.byteLength;
  const byteRemainder = byteLength % 3;
  const mainLength = byteLength - byteRemainder;

  let a, b, c, d;
  let chunk;

  for (let i = 0; i < mainLength; i = i + 3) {
    chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

    // Use bitmasks to extract 6-bit segments from the triplet
    a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
    b = (chunk & 258048) >> 12; // 258048  = (2^6 - 1) << 12
    c = (chunk & 4032) >> 6; // 4032    = (2^6 - 1) << 6
    d = chunk & 63; // 63      = 2^6 - 1

    // Convert the raw binary segments to the appropriate ASCII encoding
    base64 += chars[a] + chars[b] + chars[c] + chars[d];
  }

  // Deal with the remaining bytes and padding
  if (byteRemainder === 1) {
    chunk = bytes[mainLength];

    a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2
    b = (chunk & 3) << 4; // 3   = 2^2 - 1

    base64 += chars[a] + chars[b] + '==';
  } else if (byteRemainder === 2) {
    chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];

    a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
    b = (chunk & 1008) >> 4; // 1008  = (2^6 - 1) << 4
    c = (chunk & 15) << 2; // 15    = 2^4 - 1

    base64 += chars[a] + chars[b] + chars[c] + '=';
  }

  return base64;
}

export function filterFigmaNode(node: any): any {
  if (node.type === 'VECTOR') {
    return null;
  }

  const filtered: any = {
    id: node.id,
    name: node.name,
    type: node.type,
  };
  if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
    filtered.fills = node.fills.map((fill: any) => {
      const processedFill = { ...fill };
      delete processedFill.boundVariables;
      delete processedFill.imageRef;

      if (processedFill.gradientStops) {
        processedFill.gradientStops = processedFill.gradientStops.map(
          (stop: any) => {
            const processedStop = { ...stop };
            if (processedStop.color) {
              processedStop.color = rgbaToHex(processedStop.color);
            }
            delete processedStop.boundVariables;
            return processedStop;
          }
        );
      }
      if (processedFill.color) {
        processedFill.color = rgbaToHex(processedFill.color);
      }
      return processedFill;
    });
  }
  if (
    'strokes' in node &&
    Array.isArray(node.strokes) &&
    node.strokes.length > 0
  ) {
    filtered.strokes = node.strokes.map((stroke: any) => {
      const processedStroke = { ...stroke };
      delete processedStroke.boundVariables;
      if (processedStroke.color) {
        processedStroke.color = rgbaToHex(processedStroke.color);
      }
      return processedStroke;
    });
  }
  if ('cornerRadius' in node) {
    filtered.cornerRadius = node.cornerRadius;
  }
  if ('absoluteBoundingBox' in node) {
    filtered.absoluteBoundingBox = node.absoluteBoundingBox;
  }
  if ('characters' in node) {
    filtered.characters = node.characters;
  }
  if ('style' in node) {
    filtered.style = {
      fontFamily: node.style.fontFamily,
      fontStyle: node.style.fontStyle,
      fontWeight: node.style.fontWeight,
      fontSize: node.style.fontSize,
      textAlignHorizontal: node.style.textAlignHorizontal,
      letterSpacing: node.style.letterSpacing,
      lineHeightPx: node.style.lineHeightPx,
    };
  }
  if ('children' in node && Array.isArray(node.children)) {
    filtered.children = node.children
      .map((child: any) => filterFigmaNode(child))
      .filter((child: any) => child !== null);
  }

  return filtered;
}
