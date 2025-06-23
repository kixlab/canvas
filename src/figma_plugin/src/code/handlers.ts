// Command dispatch and plugin message handlers
import * as AnnotationCommands from './commands/annotationCommands';
import * as ComponentCommands from './commands/componentCommands';
import * as CreationCommands from './commands/creationCommands';
import * as LayoutCommands from './commands/layoutCommands';
import * as MiscellaneousCommands from './commands/miscellaneousCommands';
import * as OperationCommands from './commands/operationCommands';
import * as StyleCommands from './commands/styleCommands';
import * as TextCommands from './commands/textCommands';
import * as InspectionCommands from './commands/inspectionCommands';

export async function handleCommand(command: string, params: any) {
  switch (command) {
    case 'get_document_info':
      return await InspectionCommands.getDocumentInfo();
    case 'get_selection':
      return await InspectionCommands.getSelection();
    case 'get_node_info':
      return await InspectionCommands.getNodeInfo(params);
    case 'get_nodes_info':
      return await InspectionCommands.getNodesInfo(params);
    case 'read_my_design':
      return await InspectionCommands.readMyDesign();
    case 'scan_nodes_by_types':
      return await InspectionCommands.scanNodesByTypes(params);
    case 'get_result_image':
      return await InspectionCommands.getResultImage(params);

    case 'clone_node':
      return await OperationCommands.cloneNode(params);
    case 'move_node':
      return await OperationCommands.moveNode(params);
    case 'resize_node':
      return await OperationCommands.resizeNode(params);
    case 'delete_node':
      return await OperationCommands.deleteNode(params);
    case 'delete_multiple_nodes':
      return await OperationCommands.deleteMultipleNodes(params);

    case 'create_rectangle':
      return await CreationCommands.createRectangle(params);
    case 'create_frame':
      return await CreationCommands.createFrame(params);
    case 'create_text':
      return await CreationCommands.createText(params);
    case 'create_vector_from_svg':
      return await CreationCommands.createVectorFromSVG(params);
    case 'create_ellipse':
      return await CreationCommands.createEllipse(params);
    case 'create_polygon':
      return await CreationCommands.createPolygon(params);
    case 'create_line':
      return await CreationCommands.createLine(params);

    case 'set_fill_color':
      return await StyleCommands.setFillColor(params);
    case 'set_stroke_color':
      return await StyleCommands.setStrokeColor(params);
    case 'get_styles':
      return await StyleCommands.getStyles();
    case 'set_corner_radius':
      return await StyleCommands.setCornerRadius(params);

    case 'get_local_components':
      return await ComponentCommands.getLocalComponents();
    case 'create_component_instance':
      return await ComponentCommands.createComponentInstance(params);

    case 'set_text_content':
      return await TextCommands.setTextContent(params);
    case 'scan_text_nodes':
      return await TextCommands.scanTextNodes(params);
    case 'set_multiple_text_contents':
      return await TextCommands.setMultipleTextContents(params);

    case 'get_annotations':
      return await AnnotationCommands.getAnnotations(params);
    case 'set_annotation':
      return await AnnotationCommands.setAnnotation(params);
    case 'set_multiple_annotations':
      return await AnnotationCommands.setMultipleAnnotations(params);

    case 'set_layout_mode':
      return await LayoutCommands.setLayoutMode(params);
    case 'set_padding':
      return await LayoutCommands.setPadding(params);
    case 'set_axis_align':
      return await LayoutCommands.setAxisAlign(params);
    case 'set_layout_sizing':
      return await LayoutCommands.setLayoutSizing(params);
    case 'set_item_spacing':
      return await LayoutCommands.setItemSpacing(params);

    case 'export_node_as_image':
      return await MiscellaneousCommands.exportNodeAsImage(params);

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
