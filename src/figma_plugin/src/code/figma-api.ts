// Figma API helpers and type guards

export function hasAppendChild(node: any): node is ChildrenMixin {
  return typeof node.appendChild === 'function';
}
export function hasExportAsync(node: any): node is ExportMixin {
  return typeof node.exportAsync === 'function';
}
export function hasClone(node: any): node is { clone: () => SceneNode } {
  return typeof node.clone === 'function';
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

import { rgbaToHex } from './utils';
