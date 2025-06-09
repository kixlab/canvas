// Command dispatch and plugin message handlers
import * as AnnotateCommand from './commands/annotateCommand';
import * as ComponentCommand from './commands/componentCommand';
import * as CreateCommand from './commands/createCommand';
import * as LayoutCommand from './commands/layoutCommand';
import * as MiscellaneousCommand from './commands/miscellaneousCommand';
import * as OperateCommand from './commands/operateCommand';
import * as StyleCommand from './commands/styleCommand';
import * as TextCommand from './commands/textCommand';
import * as InspectCommand from './commands/inspectCommand';

export async function handleCommand(command: string, params: any) {
  switch (command) {
    case 'get_document_info':
      return await InspectCommand.getDocumentInfo();
    case 'get_selection':
      return await InspectCommand.getSelection();
    case 'get_node_info':
      return await InspectCommand.getNodeInfo(params);
    case 'get_nodes_info':
      return await InspectCommand.getNodesInfo(params);
    case 'read_my_design':
      return await InspectCommand.readMyDesign();
    case 'scan_nodes_by_types':
      return await InspectCommand.scanNodesByTypes(params);

    case 'clone_node':
      return await OperateCommand.cloneNode(params);
    case 'move_node':
      return await OperateCommand.moveNode(params);
    case 'resize_node':
      return await OperateCommand.resizeNode(params);
    case 'delete_node':
      return await OperateCommand.deleteNode(params);
    case 'delete_multiple_nodes':
      return await OperateCommand.deleteMultipleNodes(params);

    case 'create_rectangle':
      return await CreateCommand.createRectangle(params);
    case 'create_frame':
      return await CreateCommand.createFrame(params);
    case 'create_text':
      return await CreateCommand.createText(params);

    case 'set_fill_color':
      return await StyleCommand.setFillColor(params);
    case 'set_stroke_color':
      return await StyleCommand.setStrokeColor(params);
    case 'get_styles':
      return await StyleCommand.getStyles();
    case 'set_corner_radius':
      return await StyleCommand.setCornerRadius(params);

    case 'get_local_components':
      return await ComponentCommand.getLocalComponents();
    // case "get_team_components":
    //   return await ComponentCommand.getTeamComponents();
    case 'create_component_instance':
      return await ComponentCommand.createComponentInstance(params);

    case 'set_text_content':
      return await TextCommand.setTextContent(params);
    case 'scan_text_nodes':
      return await TextCommand.scanTextNodes(params);
    case 'set_multiple_text_contents':
      return await TextCommand.setMultipleTextContents(params);

    case 'get_annotations':
      return await AnnotateCommand.getAnnotations(params);
    case 'set_annotation':
      return await AnnotateCommand.setAnnotation(params);
    case 'set_multiple_annotations':
      return await AnnotateCommand.setMultipleAnnotations(params);

    case 'set_layout_mode':
      return await LayoutCommand.setLayoutMode(params);
    case 'set_padding':
      return await LayoutCommand.setPadding(params);
    case 'set_axis_align':
      return await LayoutCommand.setAxisAlign(params);
    case 'set_layout_sizing':
      return await LayoutCommand.setLayoutSizing(params);
    case 'set_item_spacing':
      return await LayoutCommand.setItemSpacing(params);

    case 'export_node_as_image':
      return await MiscellaneousCommand.exportNodeAsImage(params);

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
