import { ImageContent } from "@modelcontextprotocol/sdk/types";
import { AgentType } from "../types";

const figmaInstruction = `
1. Figma Tool Basics
- In Figma tool calls, each design element appears as a node representing either a container (frame/component) or a leaf (shape/text).
- Nodes provide uniform structural data exposing their unique properties.
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

export function getTextBasedGenerationPrompt(
  instruction: string,
  agent: AgentType
): string {
  if (agent === AgentType.REACT || agent === AgentType.FEEDBACK) {
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
Please analyze the following text and reproduce the UI design inside the existing "Main Screen" frame in the Figma, exactly.
Text: ${instruction}
`;
  } else if (agent === AgentType.CODE) {
    return `
You are an expert web developer who specializes in HTML and CSS. A user will provide you with a screenshot of a mobile app.
You need to return a single html file that uses HTML and CSS to reproduce the given mobile app.
Include all CSS code in the HTML file itself. If it involves any images, use "rick.jpg" as the placeholder.
Some images on the webpage are replaced with a blue rectangle as the placeholder, use "rick.jpg" for those as well.
Do not hallucinate any dependencies to external files.
You do not need to include JavaScript scripts for dynamic interactions. Pay attention to things like size, text, position, and color of all the elements, as well as the overall layout.
Respond with the content of the HTML+CSS file. Wrap the code in backticks.
The page must be designed to match 600-pixel width and 800-pixel height.
Precisely, follow the instruction: ${instruction}
`;
  } else if (agent === AgentType.SINGLE) {
    return ``;
  } else {
    throw new Error(`Unsupported agent type: ${agent}`);
  }
}

export function getImageBasedGenerationPrompt(
  width: number,
  height: number,
  agent: AgentType
): string {
  if (agent === AgentType.REACT || agent === AgentType.FEEDBACK) {
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
  } else if (agent === AgentType.CODE) {
    return `
You are an expert web developer who specializes in HTML and CSS. A user will provide you with a screenshot of a mobile app.
You need to return a single html file that uses HTML and CSS to reproduce the given mobile app.
Include all CSS code in the HTML file itself. If it involves any images, use "rick.jpg" as the placeholder.
Some images on the webpage are replaced with a blue rectangle as the placeholder, use "rick.jpg" for those as well.
Do not hallucinate any dependencies to external files.
You do not need to include JavaScript scripts for dynamic interactions. Pay attention to things like size, text, position, and color of all the elements, as well as the overall layout.
Respond with the content of the HTML+CSS file. Wrap the code in backticks.
The page must be designed to match ${width}-pixel width and ${height}-pixel height.
`;
  } else if (agent === AgentType.SINGLE) {
    return ``;
  } else {
    throw new Error(`Unsupported agent type: ${agent}`);
  }
}

export function getTextImageBasedGenerationPrompt(
  instruction: string,
  width: number,
  height: number,
  agent: AgentType
): string {
  if (agent === AgentType.REACT || agent === AgentType.FEEDBACK) {
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
Please analyze the following screen image and text instruction, and reproduce the UI design inside the existing "Main Screen" frame in the Figma, exactly.
The frame size is ${width}x${height} pixels.
Text: ${instruction}
`;
  } else if (agent === AgentType.CODE) {
    return `
You are an expert web developer who specializes in HTML and CSS. A user will provide you with a screenshot of a mobile app.
You need to return a single html file that uses HTML and CSS to reproduce the given mobile app.
Include all CSS code in the HTML file itself. If it involves any images, use "rick.jpg" as the placeholder.
Some images on the webpage are replaced with a blue rectangle as the placeholder, use "rick.jpg" for those as well.
Do not hallucinate any dependencies to external files.
You do not need to include JavaScript scripts for dynamic interactions. Pay attention to things like size, text, position, and color of all the elements, as well as the overall layout.
Respond with the content of the HTML+CSS file. Wrap the code in backticks.
The page must be designed to match ${width}-pixel width and ${height}-pixel height.
Precisely, follow the instruction: ${instruction}
`;
  } else if (agent === AgentType.SINGLE) {
    return ``;
  } else {
    throw new Error(`Unsupported agent type: ${agent}`);
  }
}

export function getTextImageBasedModificationPrompt(
  instruction: string,
  width: number,
  height: number
): string {
  return `
**Context**
You are a UI-design agent with access to Figma via tool calls.
Follow the **Instruction** to modify a UI design.
Refer to the **Agency Principles** and **Figma Basics** for guidance.

**Agency Principles**
${agencyPrinciples}

**Figma Basics**
${figmaInstruction}

**Instruction**
Please analyze the provided screen image and text instruction, then update the UI design within the existing “Main Screen” frame in Figma to precisely match the image and the instruction.
The frame size is ${width}x${height} pixels.
Text: ${instruction}
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
