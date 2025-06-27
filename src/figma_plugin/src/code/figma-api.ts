import { rgbaToHex } from './utils';

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
