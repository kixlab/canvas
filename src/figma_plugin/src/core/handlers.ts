// Command dispatch and plugin message handlers
import * as Commands from './commands';
import { getErrorMessage } from './utils';

export async function handleCommand(command: string, params: any) {
  switch (command) {
    case 'get_document_info':
      return await Commands.getDocumentInfo();
    case 'get_selection':
      return await Commands.getSelection();
    case 'get_node_info':
      if (!params || !params.nodeId) {
        throw new Error('Missing nodeId parameter');
      }
      return await Commands.getNodeInfo(params.nodeId);
    case 'get_nodes_info':
      if (!params || !params.nodeIds || !Array.isArray(params.nodeIds)) {
        throw new Error('Missing or invalid nodeIds parameter');
      }
      return await Commands.getNodesInfo(params.nodeIds);
    case 'read_my_design':
      return await Commands.readMyDesign();
    case 'create_rectangle':
      return await Commands.createRectangle(params);
    case 'create_frame':
      return await Commands.createFrame(params);
    case 'create_text':
      return await Commands.createText(params);
    case 'set_fill_color':
      return await Commands.setFillColor(params);
    case 'set_stroke_color':
      return await Commands.setStrokeColor(params);
    case 'move_node':
      return await Commands.moveNode(params);
    case 'resize_node':
      return await Commands.resizeNode(params);
    case 'delete_node':
      return await Commands.deleteNode(params);
    case 'delete_multiple_nodes':
      return await Commands.deleteMultipleNodes(params);
    case 'get_styles':
      return await Commands.getStyles();
    case 'get_local_components':
      return await Commands.getLocalComponents();
    // case "get_team_components":
    //   return await getTeamComponents();
    case 'create_component_instance':
      return await Commands.createComponentInstance(params);
    case 'export_node_as_image':
      return await Commands.exportNodeAsImage(params);
    case 'set_corner_radius':
      return await Commands.setCornerRadius(params);
    case 'set_text_content':
      return await Commands.setTextContent(params);
    case 'clone_node':
      return await Commands.cloneNode(params);
    case 'scan_text_nodes':
      return await Commands.scanTextNodes(params);
    case 'set_multiple_text_contents':
      return await Commands.setMultipleTextContents(params);
    case 'get_annotations':
      return await Commands.getAnnotations(params);
    case 'set_annotation':
      return await Commands.setAnnotation(params);
    case 'scan_nodes_by_types':
      return await Commands.scanNodesByTypes(params);
    case 'set_multiple_annotations':
      return await Commands.setMultipleAnnotations(params);
    case 'set_layout_mode':
      return await Commands.setLayoutMode(params);
    case 'set_padding':
      return await Commands.setPadding(params);
    case 'set_axis_align':
      return await Commands.setAxisAlign(params);
    case 'set_layout_sizing':
      return await Commands.setLayoutSizing(params);
    case 'set_item_spacing':
      return await Commands.setItemSpacing(params);
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
