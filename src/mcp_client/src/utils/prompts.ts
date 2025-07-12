import { ImageContent } from "@modelcontextprotocol/sdk/types";

const figmaInstruction = `
1. Figma Tool Basics
- In Figma tool calls, each design element appears as a node representing either a container (frame/component) or a leaf (shape/text).
- Nodes provide uniform structural data exposing their unique properties (e.g., id, name, type, and position).
- Coordinates are global: all nodes sit relative to the canvas origin (0, 0) at the top-left.

2. Node Hierarchy
- All nodes live in one rooted tree mirroring the layer list.
- Parent-child links create the hierarchy, and a node’s index in its parent sets both z-order and sidebar order.
- When child nodes (leaf) outgrow their parent nodes (container), they will be clipped.

3. Container Layout
- With auto layout applied to the frame, Figma automatically manages direction, gap, padding, and resizing of the container and the children.
- So, manual layout property changes must account for these automatic adjustments of size and position.
- Enable auto layout only when confident, as it can cause unexpected shifts.

4. Text Mechanics
- Text nodes expose font family, style, size, and other typography traits independent of layout.
- Resizing the text node doesn’t scale the text; excess text simply overflows.
- Adequately set the text node size and alignment to avoid overflow.
`;

const agencyPrinciples = `
1. Persistence  
Keep iterating until the instruction is fully met and confirmed. Do not end the turn early.
2. Tool use  
Interact with the canvas via the provided Figma-control tools.
3. Keen Examination
Carefully examine the instructions and image (if provided) and follow them accordingly.
`;

export function getTextBasedGenerationPrompt(instruction: string): string {
  return `
**Context**
You are a UI-design agent with access to Figma via tool calls. 
Follow the **Instruction** to generate a UI design.
Refer to the **Agency Principles** and **UI Design Principles** for guidance.

**Agency Principles**
${agencyPrinciples}

**Figma Basics**
${figmaInstruction}

**Instruction**
Please analyze the user request below and reproduce the UI design inside the existing "Main Screen" frame in Figma, exactly.
User request: ${instruction}  
`;
}

export function getImageBasedGenerationPrompt(
  width: number,
  height: number
): string {
  return `
**Context**
You are a UI-design agent with access to Figma via tool calls.
Follow the **Instruction** to generate a UI design.
Refer to the **Agency Principles** and **UI Design Principles** for guidance.

**Agency Principles**
${agencyPrinciples}

**Figma Basics**
${figmaInstruction}


**Instruction**
Please analyze the following image and reproduce the UI design inside the existing "Main Screen" frame in the Figma, exactly.
The frame size is ${width}x${height} pixels.
`;
}

export function getTextImageBasedGenerationPrompt(
  instruction: string,
  width: number,
  height: number
): string {
  return `
**Context**
You are a UI-design agent with access to Figma via tool calls.
Follow the **Instruction** to generate a UI design.
Refer to the **Agency Principles** and **UI Design Principles** for guidance.

**Agency Principles**
${agencyPrinciples}

**Figma Basics**
${figmaInstruction}


**Instruction**
Please analyze the following image and the user request below, and reproduce the UI design inside the existing "Main Screen" frame in Figma, exactly.
The frame size is ${width}x${height} pixels.
User request: ${instruction}
`;
}

export function getModificationWithoutOraclePrompt(
  instruction: string
): string {
  return `
**Context**
You are a UI-design agent with access to Figma via tool calls.
Follow the **Instruction** to generate a UI design.
Refer to the **Agency Principles** and **UI Design Principles** for guidance.

1. Persistence  
Keep iterating until the user's visual specification is fully met and confirmed. Do not end the turn early.

2. Tool use  
Interact with the canvas via the provided Figma-control tools.

**Modification Task**
You are given an existing UI design and need to modify it according to the instruction.

**Instruction**
Please analyze the provided UI image and modify the UI according to the following instruction:
${instruction}
`;
}

export function getModificationWithOracleHierarchyPrompt(
  instruction: string
): string {
  return `
**Context**
You are a UI-design agent working inside Figma.

1. Persistence  
Keep iterating until the user's visual specification is fully met and confirmed. Do not end the turn early.

2. Tool use  
Interact with the canvas via the provided Figma-control tools.

**Oracle Hierarchy Mode**
You have access to perfect hierarchy information of the UI elements.

**Instruction**
Please analyze the provided screen image with hierarchy information and modify the UI according to the following instructions:
${instruction}
`;
}

export function getModificationWithOraclePerfectCanvasPrompt(
  instruction: string
): string {
  return `
**Context**
You are a UI-design agent working inside Figma.

1. Persistence  
Keep iterating until the user's visual specification is fully met and confirmed. Do not end the turn early.

2. Tool use  
Interact with the canvas via the provided Figma-control tools.

**Oracle Perfect Canvas Mode**
You have access to perfect canvas information, including all element properties and relationships.

**Instruction**
Please analyze the provided screen image with perfect canvas information and modify the UI according to the following instructions:
${instruction}
`;
}

export function getFeedbackPrompt({
  originalTargetText,
  originalTargetImage,
  pageStructureText,
}: {
  originalTargetText?: string;
  originalTargetImage?: ImageContent;
  pageStructureText?: string;
}): string {
  return `
**Instruction**
You are a feedback agent evaluating a UI design.
You will receive a screenshot of (1) the current design with element ID labels and (2) a ground truth design.
Based on the **Original Instruction** and the ground truth design, give concise feedback on (1) missing elements and (2) incorrect element properties to match the ground truth.
Refer to **Page Structure** and the image to understand the layout.
When referring to elements, mention their IDs.

${
  originalTargetImage
    ? "The target image screenshot is provided as a second image."
    : ""
}

${pageStructureText ? `**Page Structure**\n${pageStructureText}` : ""}

${
  originalTargetText
    ? `**Original Instruction**\n"""\n${originalTargetText}\n"""`
    : ""
}
`.trim();
}

export function getUpdateInstruction({
  feedbackInstruction,
  pageStructureText,
  width,
  height,
}: {
  feedbackInstruction: string;
  pageStructureText: string;
  width: number;
  height: number;
}) {
  const combinedInstruction = `

**Context**
You are a UI-design agent with access to Figma via tool calls.
Follow the **Instruction** to update the UI design in the "Main Screen" frame in the Figma.
The frame size is ${width}x${height} pixels.

**Agency Principles**
${agencyPrinciples}

**Figma Basics**
${figmaInstruction}

**Page Structure**
${pageStructureText || ""}

**Instruction**
${feedbackInstruction.trim()}
`;
  return combinedInstruction;
}
