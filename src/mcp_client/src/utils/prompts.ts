// Prompts for the MCP client - TypeScript version of Python prompts

import { ImageContent } from "@modelcontextprotocol/sdk/types";

export function getTextBasedGenerationPrompt(instruction: string): string {
  return `
[CONTEXT]
You are a UI-design agent working inside Figma.

**Persistence**  
Keep iterating until the user's visual specification is fully met and confirmed. Do not end the turn early.

**Tool use**  
Interact with the canvas via the provided Figma-control tools.

**Keen Examination**
Carefully examine the instruction and follow it accordingly.

[INSTRUCTION]
Please analyze the following text and generate a UI inside the [ROOT FRAME] in the Figma canvas.
${instruction}  
`;
}

export function getImageBasedGenerationPrompt(): string {
  return `
[CONTEXT]
You are a UI-design agent working inside Figma.

**Persistence**  
Keep iterating until the user's visual specification is fully met and confirmed. Do not end the turn early.

**Tool use**  
Interact with the canvas via the provided Figma-control tools.

**Keen Observation**
Carefully examine the provided screen image and precisely replicate it accordingly.

[INSTRUCTION]
Please analyze the following screen image and generate a UI inside the [ROOT FRAME] in the Figma canvas.
`;
}

export function getTextImageBasedGenerationPrompt(instruction: string): string {
  return `
[CONTEXT]
You are a UI-design agent working inside Figma.

**Persistence**  
Keep iterating until the user's visual specification is fully met and confirmed. Do not end the turn early.

**Tool use**  
Interact with the canvas via the provided Figma-control tools.

**Keen Inspection**
Carefully examine the provided screen image and text, and precisely replicate them accordingly.

[INSTRUCTION]
Please analyze the following screen image and text instruction, and generate a UI inside the [ROOT FRAME] in the Figma canvas.
${instruction}
`;
}

export function getModificationWithoutOraclePrompt(
  instruction: string
): string {
  return `
[CONTEXT]
You are a UI-design agent working inside Figma.

**Persistence**  
Keep iterating until the user's visual specification is fully met and confirmed. Do not end the turn early.

**Tool use**  
Interact with the canvas via the provided Figma-control tools.

**Modification Task**
You are given an existing UI design and need to modify it according to the instruction.

[INSTRUCTION]
Please analyze the provided screen image and modify the UI according to the following instruction:
${instruction}
`;
}

export function getModificationWithOracleHierarchyPrompt(
  instruction: string
): string {
  return `
[CONTEXT]
You are a UI-design agent working inside Figma.

**Persistence**  
Keep iterating until the user's visual specification is fully met and confirmed. Do not end the turn early.

**Tool use**  
Interact with the canvas via the provided Figma-control tools.

**Oracle Hierarchy Mode**
You have access to perfect hierarchy information of the UI elements.

[INSTRUCTION]
Please analyze the provided screen image with hierarchy information and modify the UI according to the following instruction:
${instruction}
`;
}

export function getModificationWithOraclePerfectCanvasPrompt(
  instruction: string
): string {
  return `
[CONTEXT]
You are a UI-design agent working inside Figma.

**Persistence**  
Keep iterating until the user's visual specification is fully met and confirmed. Do not end the turn early.

**Tool use**  
Interact with the canvas via the provided Figma-control tools.

**Oracle Perfect Canvas Mode**
You have access to perfect canvas information including all element properties and relationships.

[INSTRUCTION]
Please analyze the provided screen image with perfect canvas information and modify the UI according to the following instruction:
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
  let prompts = `
** Instruction **
You are a feedback agent tasked with evaluating the user interface design.
You will receive a screenshot of the current design.
Based on the **Original Instruction**, provide concise feedback on how to improve the design to match the original instruction.
Precisely, refer to **Page Structure** to understand the current design layout.
In your instruction, when referring to existing elements, mention their names and IDs.
`;

  if (originalTargetImage) {
    prompts += `The target image screenshot is provided as a second image.`;
  }

  if (pageStructureText) {
    prompts += `
** Page Structure **
${pageStructureText}
`;
  }

  if (originalTargetText) {
    prompts += `
** Original Instruction **
  """
  ${originalTargetText}
  """
`;
  }

  return prompts;
}

export function combineFeedbackInstruction({
  feedbackInstruction,
  pageStructureText,
  originalTargetText,
}: {
  feedbackInstruction: string;
  pageStructureText: string;
  originalTargetText?: string;
}) {
  const combinedInstruction = `

Follow the ** Feedback Instruction ** below to update the design.
Refer to the ** Original Instruction ** for context.

** Original Instruction **
  """ 
  ${originalTargetText || ""}
  """

** Feedback Instruction **
  """
  ${feedbackInstruction.trim()}
  """

** Page Structure **
"""
${pageStructureText || ""}
"""
`;
  return combinedInstruction;
}
