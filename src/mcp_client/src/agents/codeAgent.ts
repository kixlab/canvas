import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import {
  UserRequestMessage,
  GenericMessage,
  AgentMetadata,
  RoleType,
  MessageType,
  ContentType,
  SnapshotStructure,
} from "../types";
import { ModelInstance } from "../models/baseModel";
import { Tools } from "../core/tools";
import { AgentInstance } from "./baseAgent";
import { logger } from "../utils/helpers";

const rickPath = path.resolve(__dirname, "../public/static/rick.png"); // adjust to your repo
const rickBase64 = fs.readFileSync(rickPath, "base64");
const rickDataURL = `data:image/png;base64,${rickBase64}`;

export class CodeAgent extends AgentInstance {
  async run(params: {
    requestMessage: UserRequestMessage;
    tools: Tools; // kept for interface parity, not used
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
    logger.log({
      header: "Code Agent Generation Started",
      body: `Model: ${params.model.modelName}, Provider: ${params.model.modelProvider}, Max Turns: ${this.maxTurns}`,
    });

    const { width: width = 800, height: height = 600 } = params.metadata;
    const messageContext = params.model.createMessageContext();
    messageContext.push(params.requestMessage);

    /* ---------- 1. Ask the LLM for code ---------- */
    logger.info({
      header: "Sent an LLM request for the code generation",
    });

    const apiContext = params.model.formatRequest([params.requestMessage]);
    const modelResponse = await params.model.generateResponse(apiContext);
    if (!modelResponse) {
      throw new Error("No response from model");
    }

    params.model.addToFormattedMessageContext(
      modelResponse,
      MessageType.AGENT_COMPLETION,
      messageContext
    );

    const rawText = messageContext.map((m) => m.content[0].text).join("\n");
    const cost = params.model.getCostFromResponse(modelResponse);

    /* ---------- 2. Pull code block ---------- */
    const { code, success: codeBlockExists } = extractCodeBlock(rawText);

    if (!codeBlockExists) {
      logger.error({
        header: "No code block found in the model response",
        body: `Response: ${rawText}`,
      });
      return this.run(params);
    }

    const patchedHtml = code
      // replace any src="rick.jpg|png"
      .replace(/src=(["'])rick\.(?:png|jpg)\1/gi, `src="${rickDataURL}"`)
      // also replace literal file names in CSS url() or elsewhere
      .replace(/\brick\.(?:png|jpg)\b/gi, rickDataURL);

    logger.info({
      header: "Initiated the HTML rendering process",
      body: `Code length: ${code.length}`,
    });

    /* ---------- 3. Render with Puppeteer ---------- */
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.setContent(patchedHtml!, { waitUntil: "networkidle0" });

    const screenshotBase64 = (await page.screenshot({
      type: "png",
      encoding: "base64",
      captureBeyondViewport: false,
    })) as string;
    await browser.close();

    logger.info({
      header: "Finished the HTML rendering process",
    });

    return {
      case_id: params.metadata.caseId,
      history: messageContext,
      responses: [modelResponse],
      cost: cost / 1000,
      json_structure: { html: code },
      turn: 1,
      image_uri: `data:image/png;base64,${screenshotBase64}`,
      snapshots: [],
    };
  }
}

/* ---------- 5. Helper ---------- */
function extractCodeBlock(t: string): {
  code: string;
  success: boolean;
} {
  const match = t.match(/```(?:\w*\n)?([\s\S]*?)```/);
  return match
    ? { code: match[1].trim(), success: true }
    : { code: "", success: false };
}
