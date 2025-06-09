export type ProgressStatus = 'started' | 'in_progress' | 'completed' | 'error';
export type ProgressPayload = Record<string, any> | null;

export interface ProgressUpdate {
  type: string;
  commandId: string;
  commandType: string;
  status: ProgressStatus;
  progress: number;
  totalItems: number;
  processedItems: number;
  message: string;
  timestamp: number;
  [key: string]: any; // Allow dynamic properties for chunk info
}

// --- Figma literal types ---
export type LayoutMode = 'NONE' | 'HORIZONTAL' | 'VERTICAL';
export type LayoutWrap = 'NO_WRAP' | 'WRAP';
export type PrimaryAxisAlign = 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN';
export type CounterAxisAlign = 'MIN' | 'MAX' | 'CENTER' | 'BASELINE';
export type LayoutSizing = 'FIXED' | 'HUG' | 'FILL';

/** Internal tuple used while walking the tree. */
export interface NodeInfo {
  node: BaseNode;
  parentPath: string[];
  depth: number;
}
export type MinimalTextNode = {
  id: string;
  name: string;
  type: 'TEXT';
  characters: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: string;
  x: number;
  y: number;
  width: number;
  height: number;
  path: string;
  depth: number;
};

export interface CategoryInfo {
  id: string;
  label: string;
  color: Paint | string;
  isPreset: boolean;
}

export interface MinimalNodeMatch {
  id: string;
  name: string;
  type: BaseNode['type'];
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export type ImageFormat = 'PNG' | 'JPG' | 'SVG' | 'PDF';
