// Command dispatch and plugin message handlers
import * as CreationCommands from './commands/creationCommands';
import * as LayoutCommands from './commands/layoutCommands';
import * as OperationCommands from './commands/operationCommands';
import * as StyleCommands from './commands/styleCommands';
import * as TextCommands from './commands/textCommands';
import * as InspectionCommands from './commands/inspectionCommands';

export async function handleCommand(command: string, params: any) {
  switch (command) {
    case 'get_page_info':
      return await InspectionCommands.getPageInfo();
    case 'get_selection_info':
      return await InspectionCommands.getSelectionInfo();
    case 'get_node_info':
      return await InspectionCommands.getNodeInfo(params);
    case 'get_node_info_by_types':
      return await InspectionCommands.getNodeInfoByTypes(params);
    case 'get_page_structure':
      return await InspectionCommands.getPageStructure();
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
    case 'group_nodes':
      return await OperationCommands.groupNodes(params);
    case 'ungroup_nodes':
      return await OperationCommands.ungroupNodes(params);
    case 'rename_node':
      return await OperationCommands.renameNode(params);
    case 'reorder_node':
      return await OperationCommands.reorderNode(params);

    case 'create_rectangle':
      return await CreationCommands.createRectangle(params);
    case 'create_frame':
      return await CreationCommands.createFrame(params);
    case 'create_text':
      return await CreationCommands.createText(params);
    case 'create_graphic':
      return await CreationCommands.createGraphic(params);
    case 'create_ellipse':
      return await CreationCommands.createEllipse(params);
    case 'create_polygon':
      return await CreationCommands.createPolygon(params);
    case 'create_line':
      return await CreationCommands.createLine(params);

    case 'get_styles':
      return await StyleCommands.getStyles();
    case 'copy_style':
      return await StyleCommands.copyStyle(params);
    case 'set_fill_color':
      return await StyleCommands.setFillColor(params);
    case 'set_corner_radius':
      return await StyleCommands.setCornerRadius(params);
    case 'set_opacity':
      return await StyleCommands.setOpacity(params);
    case 'set_stroke':
      return await StyleCommands.setStroke(params);
    case 'set_fill_gradient':
      return await StyleCommands.setFillGradient(params);
    case 'set_drop_shadow':
      return await StyleCommands.setDropShadow(params);
    case 'set_inner_shadow':
      return await StyleCommands.setInnerShadow(params);

    case 'get_text_node_info':
      return await TextCommands.getTextNodeInfo(params);
    case 'set_text_content':
      return await TextCommands.setTextContent(params);
    case 'set_text_properties':
      return await TextCommands.setTextProperties(params);
    case 'set_text_decoration':
      return await TextCommands.setTextDecoration(params);
    case 'set_text_font':
      return await TextCommands.setTextFont(params);

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

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
