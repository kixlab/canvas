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

interface NodeAnnotationsResult {
  nodeId: string;
  name: string;
  annotations: readonly Annotation[]; // Annotation is defined in the plugin typings
  categories?: CategoryInfo[];
}

interface AllAnnotationsResult {
  annotatedNodes: {
    nodeId: string;
    name: string;
    annotations: readonly Annotation[];
  }[];
  categories?: CategoryInfo[];
}

type GetAnnotationsResult = NodeAnnotationsResult | AllAnnotationsResult;

export async function getAnnotations(params: {
  nodeId?: string;
  includeCategories?: boolean; // defaults to true
}): Promise<GetAnnotationsResult> {
  try {
    const { nodeId, includeCategories = true } = params;

    let categoriesMap: Record<string, CategoryInfo> = {};
    if (includeCategories) {
      const categories = await figma.annotations.getAnnotationCategoriesAsync();
      categoriesMap = categories.reduce<Record<string, CategoryInfo>>(
        (map, category) => {
          map[category.id] = {
            id: category.id,
            label: category.label,
            color: category.color,
            isPreset: category.isPreset,
          };
          return map;
        },
        {}
      );
    }

    if (nodeId) {
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) throw new Error(`Node not found: ${nodeId}`);

      if (!('annotations' in node)) {
        throw new Error(`Node type ${node.type} does not support annotations`);
      }

      const result: NodeAnnotationsResult = {
        nodeId: node.id,
        name: node.name,
        annotations: node.annotations ?? [],
      };

      if (includeCategories) result.categories = Object.values(categoriesMap);
      return result;
    }

    const annotatedNodes: AllAnnotationsResult['annotatedNodes'] = [];

    const processNode = async (node: SceneNode | BaseNode) => {
      if (
        'annotations' in node &&
        node.annotations &&
        node.annotations.length > 0
      ) {
        annotatedNodes.push({
          nodeId: node.id,
          name: node.name,
          annotations: node.annotations,
        });
      }
      if ('children' in node) {
        for (const child of node.children) await processNode(child);
      }
    };

    await processNode(figma.currentPage);

    const result: AllAnnotationsResult = { annotatedNodes };
    if (includeCategories) result.categories = Object.values(categoriesMap);
    return result;
  } catch (error) {
    console.error('Error in getAnnotations:', error);
    throw error;
  }
}

interface AnnotationProperty {
  key: string;
  value: string;
}

interface SetAnnotationSuccess {
  success: true;
  nodeId: string;
  name: string;
  annotations: readonly Annotation[]; // replace with your own type if needed
}

interface SetAnnotationFailure {
  success: false;
  error: string;
}

type SetAnnotationResult = SetAnnotationSuccess | SetAnnotationFailure;

/* ---------------------------------------------------------
   Main function – logic preserved, now strongly typed
--------------------------------------------------------- */
export async function setAnnotation(params: {
  nodeId: string;
  annotationId?: string; // not used in current logic
  labelMarkdown: string;
  categoryId?: string; // optional
  properties?: AnnotationProperty[]; // optional
}): Promise<SetAnnotationResult> {
  try {
    console.log('=== setAnnotation Debug Start ===');
    console.log('Input params:', JSON.stringify(params, null, 2));

    const { nodeId, annotationId, labelMarkdown, categoryId, properties } =
      params;

    // ── Validation ────────────────────────────────────
    if (!nodeId) {
      console.error('Validation failed: Missing nodeId');
      return { success: false, error: 'Missing nodeId' };
    }
    if (!labelMarkdown) {
      console.error('Validation failed: Missing labelMarkdown');
      return { success: false, error: 'Missing labelMarkdown' };
    }

    console.log('Attempting to get node:', nodeId);
    const node = await figma.getNodeByIdAsync(nodeId);
    console.log('Node lookup result:', {
      id: nodeId,
      found: !!node,
      type: node?.type,
      name: node?.name,
      hasAnnotations: node ? 'annotations' in node : false,
    });

    if (!node) {
      console.error('Node lookup failed:', nodeId);
      return { success: false, error: `Node not found: ${nodeId}` };
    }

    if (!('annotations' in node)) {
      console.error('Node annotation support check failed:', {
        nodeType: node.type,
        nodeId: node.id,
      });
      return {
        success: false,
        error: `Node type ${node.type} does not support annotations`,
      };
    }

    // ── Build annotation object ───────────────────────
    const newAnnotation: any = { labelMarkdown };

    if (categoryId) {
      console.log('Adding categoryId to annotation:', categoryId);
      newAnnotation.categoryId = categoryId;
    }

    if (properties && Array.isArray(properties) && properties.length > 0) {
      console.log(
        'Adding properties to annotation:',
        JSON.stringify(properties, null, 2)
      );
      newAnnotation.properties = properties;
    }

    console.log('Current node annotations:', node.annotations);
    console.log(
      'Setting new annotation:',
      JSON.stringify(newAnnotation, null, 2)
    );

    node.annotations = [newAnnotation as Annotation];

    console.log('Updated node annotations:', node.annotations);
    console.log('=== setAnnotation Debug End ===');

    return {
      success: true,
      nodeId: node.id,
      name: node.name,
      annotations: node.annotations,
    };
  } catch (error: any) {
    console.error('=== setAnnotation Error ===');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      params: JSON.stringify(params, null, 2),
    });
    return { success: false, error: error.message };
  }
}

// ──────────────────────────────────────────────────────────
// Type helpers – tweak to match your own models as needed
// ──────────────────────────────────────────────────────────

interface AnnotationInput {
  nodeId: string;
  labelMarkdown: string;
  categoryId?: string; // optional
  properties?: AnnotationProperty[]; // optional
}

interface AnnotationResult {
  success: boolean;
  nodeId: string;
  error?: string;
}

interface SetMultipleAnnotationsSummary {
  success: boolean;
  annotationsApplied?: number;
  annotationsFailed?: number;
  totalAnnotations?: number;
  results?: AnnotationResult[];
  error?: string;
}
/* ──────────────────────────────────────────────────────────
   Main function – original code with type safety added
────────────────────────────────────────────────────────── */
export async function setMultipleAnnotations(params: {
  nodeId?: string; // optional: outer wrapper may supply it
  annotations: AnnotationInput[];
}): Promise<SetMultipleAnnotationsSummary> {
  console.log('=== setMultipleAnnotations Debug Start ===');
  console.log('Input params:', JSON.stringify(params, null, 2));

  const { nodeId, annotations } = params;

  if (!annotations || annotations.length === 0) {
    console.error('Validation failed: No annotations provided');
    return {
      success: false,
      error: 'No annotations provided',
    };
  }

  console.log(
    `Processing ${annotations.length} annotations for node ${nodeId}`
  );

  const results: AnnotationResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Process annotations sequentially
  for (let i = 0; i < annotations.length; i++) {
    const annotation = annotations[i];
    console.log(
      `\nProcessing annotation ${i + 1}/${annotations.length}:`,
      JSON.stringify(annotation, null, 2)
    );

    try {
      console.log('Calling setAnnotation with params:', {
        nodeId: annotation.nodeId,
        labelMarkdown: annotation.labelMarkdown,
        categoryId: annotation.categoryId,
        properties: annotation.properties,
      });

      const result = await setAnnotation({
        nodeId: annotation.nodeId,
        labelMarkdown: annotation.labelMarkdown,
        categoryId: annotation.categoryId,
        properties: annotation.properties,
      });

      console.log('setAnnotation result:', JSON.stringify(result, null, 2));

      if (result.success) {
        successCount++;
        results.push({ success: true, nodeId: annotation.nodeId });
        console.log(`✓ Annotation ${i + 1} applied successfully`);
      } else {
        failureCount++;
        results.push({
          success: false,
          nodeId: annotation.nodeId,
          error: result.error,
        });
        console.error(`✗ Annotation ${i + 1} failed:`, result.error);
      }
    } catch (error: any) {
      failureCount++;
      const errorResult: AnnotationResult = {
        success: false,
        nodeId: annotation.nodeId,
        error: error.message,
      };
      results.push(errorResult);
      console.error(`✗ Annotation ${i + 1} failed with error:`, error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
      });
    }
  }

  const summary: SetMultipleAnnotationsSummary = {
    success: successCount > 0,
    annotationsApplied: successCount,
    annotationsFailed: failureCount,
    totalAnnotations: annotations.length,
    results,
  };

  console.log('\n=== setMultipleAnnotations Summary ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('=== setMultipleAnnotations Debug End ===');

  return summary;
}
