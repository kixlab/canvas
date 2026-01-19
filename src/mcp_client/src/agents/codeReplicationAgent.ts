import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import {
  AgentMetadata,
  ContentType,
  GenericMessage,
  MessageType,
  RoleType,
  SnapshotStructure,
  UserRequestMessage,
} from "../types";
import { ModelInstance } from "../models/modelInstance";
import { Tools } from "../core/tools";
import { AgentInstance } from "./agentInstance";
import { logger } from "../utils/helpers";

const rickPath = path.resolve(__dirname, "../public/static/rick.png");
const rickBase64 = fs.readFileSync(rickPath, "base64");
const rickDataURL = `data:image/png;base64,${rickBase64}`;

export class CodeReplicationAgent extends AgentInstance {
  // Generate HTML/CSS, render to an image, and return the screenshot + source.
  async run(params: {
    requestMessage: UserRequestMessage;
    tools: Tools;
    model: ModelInstance;
    metadata: AgentMetadata;
  }): Promise<{
    case_id: string;
    history: GenericMessage[];
    responses: any[];
    cost: number;
    json_structure: Object;
    turn: number;
    image_uri: string;
    snapshots: SnapshotStructure[];
  }> {
    logger.info({
      header: "Code Replication Agent Generation Started",
      body: `Model: ${params.model.modelName}, Provider: ${params.model.modelProvider}, Max Turns: ${this.maxTurns}`,
    });

    logger.info({
      header: "Request Details",
      body: `Case ID: ${params.metadata.caseId}, Width: ${params.metadata.width || 800}, Height: ${params.metadata.height || 600}`,
    });

    if (params.requestMessage.content && params.requestMessage.content.length > 0) {
      const textContent = params.requestMessage.content.find((c: any) => c.type === 'text');
      if (textContent && (textContent as any).text) {
        const text = (textContent as any).text;
        logger.info({
          header: "User Request Message",
          body: `Length: ${text.length}, Preview: ${text.substring(0, 100)}...`,
        });
      }
    }

    const { width: width = 800, height: height = 600 } = params.metadata;
    const messageContext = params.model.createMessageContext();
    messageContext.push(params.requestMessage);

    logger.info({
      header: "Sent an LLM request for the code generation",
    });

    const apiContext = params.model.formatRequest([params.requestMessage]);
    logger.info({
      header: "Sending request to LLM",
      body: `Context length: ${JSON.stringify(apiContext).length}`,
    });
    
    const modelResponse = await params.model.generateResponse(apiContext);
    if (!modelResponse) {
      logger.error({
        header: "LLM Response Error",
        body: "No response received from model",
      });
      throw new Error("No response from model");
    }
    
    logger.info({
      header: "LLM Response Received",
      body: `Response type: ${typeof modelResponse}, Has content: ${!!modelResponse.content}`,
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("LLM response timeout")), 60000);
    });
    
    try {
      await Promise.race([modelResponse, timeoutPromise]);
    } catch (error) {
      logger.error({
        header: "LLM Response Timeout",
        body: "Response took too long",
      });
      throw error;
    }

    params.model.addToFormattedMessageContext(
      modelResponse,
      MessageType.AGENT_COMPLETION,
      messageContext
    );

    let rawText = "";
    if (modelResponse && modelResponse.content) {
      if (Array.isArray(modelResponse.content)) {
        const textContent = modelResponse.content.find((c: any) => c.type === 'text');
        if (textContent) {
          rawText = textContent.text;
        }
      } else if (typeof modelResponse.content === 'string') {
        rawText = modelResponse.content;
      }
    }
    
    if (!rawText && messageContext.length > 0) {
      const lastMessage = messageContext[messageContext.length - 1];
      if (lastMessage && lastMessage.content && lastMessage.content.length > 0) {
        const textContent = lastMessage.content.find((c: any) => c.type === 'text');
        if (textContent) {
          rawText = textContent.text;
        }
      }
    }

    if (modelResponse && modelResponse.status === 'incomplete') {
      logger.warn({
        header: "LLM Response Incomplete",
        body: `Reason: ${modelResponse.incomplete_details?.reason || 'unknown'}`,
      });
    }
    
    const cost = params.model.getCostFromResponse(modelResponse);

    logger.info({
      header: "Extracted raw text from model response",
      body: `Length: ${rawText.length}, Preview: ${rawText.substring(0, 200)}...`,
    });

    const { code, success: codeBlockExists } = extractCodeBlock(rawText);

    logger.info({
      header: "Code block extraction result",
      body: `Success: ${codeBlockExists}, Code length: ${code.length}`,
    });

    if (!codeBlockExists) {
      logger.error({
        header: "No code block found in the model response",
        body: `Response: ${rawText}`,
      });
      return {
        case_id: params.metadata.caseId,
        history: messageContext,
        responses: [modelResponse],
        cost: cost / 1000,
        json_structure: { html: "" },
        turn: 1,
        image_uri: "",
        snapshots: [],
      };
    }

    const patchedHtml = code
      .replace(/src=(["'])rick\.(?:png|jpg)\1/gi, `src="${rickDataURL}"`)
      .replace(/\brick\.(?:png|jpg)\b/gi, rickDataURL);

    logger.info({
      header: "Initiated the HTML rendering process",
      body: `Code length: ${code.length}, Viewport: ${width}x${height}`,
    });

    logger.info({
      header: "Starting Puppeteer browser",
      body: "Launching headless Chrome...",
    });
    
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    
    logger.info({
      header: "Setting page content",
      body: `HTML length: ${patchedHtml!.length}`,
    });
    
    await page.setContent(patchedHtml!, { waitUntil: "networkidle0" });
    
    logger.info({
      header: "Taking screenshot",
      body: "Capturing page as PNG...",
    });

    const screenshotBase64 = (await page.screenshot({
      type: "png",
      encoding: "base64",
      captureBeyondViewport: false,
    })) as string;
    
    logger.info({
      header: "Screenshot captured",
      body: `Base64 length: ${screenshotBase64.length}`,
    });
    
    await browser.close();

    logger.info({
      header: "Finished the HTML rendering process",
    });

    const result = {
      case_id: params.metadata.caseId,
      history: messageContext,
      responses: [modelResponse],
      cost: cost / 1000,
      json_structure: { html: code },
      turn: 1,
      image_uri: `data:image/png;base64,${screenshotBase64}`,
      snapshots: [],
    };

    logger.info({
      header: "Code Replication Agent Generation Completed",
      body: `Cost: ${result.cost}, Turn: ${result.turn}, History length: ${result.history.length}`,
    });

    return result;
  }
}

// Extract the first reasonable code block or HTML payload from a model response.
function extractCodeBlock(t: string): {
  code: string;
  success: boolean;
} {
  const patterns = [
    /```(?:\w*\n)?([\s\S]*?)```/,
    /```html\s*\n([\s\S]*?)```/,
    /```css\s*\n([\s\S]*?)```/,
    /```\s*\n([\s\S]*?)```/,
  ];
  
  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match) {
      return { code: match[1].trim(), success: true };
    }
  }
  
  if (t.trim().startsWith('<!DOCTYPE html>') || t.trim().startsWith('<html')) {
    return { code: t.trim(), success: true };
  }
  
  if (t.includes('<!DOCTYPE html>') || t.includes('<html')) {
    const htmlStart = t.indexOf('<!DOCTYPE html>');
    const htmlStartAlt = t.indexOf('<html');
    const start = htmlStart !== -1 ? htmlStart : htmlStartAlt;
    
    if (start !== -1) {
      const partialHtml = t.substring(start);
      return { code: partialHtml, success: true };
    }
  }
  
  return { code: "", success: false };
}
