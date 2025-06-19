import dotenv from "dotenv";
import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { createRoutes } from "./routes";
import { globalSession } from "./core/session";
import { AgentType } from "./types";

dotenv.config();
const PORT = process.env.PORT || 3000;

// Parse CLI arguments
const args = process.argv.slice(2);
const agentTypeArg = args.find((arg) => arg.startsWith("--agent_type="));
const AGENT_TYPE = agentTypeArg ? agentTypeArg.split("=")[1] : AgentType.REACT;

// Validate agent type
if (!Object.values(AgentType).includes(AGENT_TYPE as any)) {
  console.error('Invalid agent_type. Use "single" or "multi"');
  process.exit(1);
}

// Startup and shutdown handlers
let isShuttingDown = false;

const initializeServer = async () => {
  try {
    await globalSession.initialize(AGENT_TYPE as AgentType);
    console.log(`MCP Client initialized with agent type: ${AGENT_TYPE}`);
  } catch (error) {
    console.error("Failed to initialize MCP client:", error);
    process.exit(1);
  }
};

const shutdownServer = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("Shutting down gracefully...");
  try {
    await globalSession.shutdown();
    console.log("MCP Client shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on("SIGINT", shutdownServer);
process.on("SIGTERM", shutdownServer);

///////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files setup
const publicDir = path.join(__dirname, "../public");
const staticDir = path.join(publicDir, "static");
const templatesDir = path.join(publicDir, "templates");

// Ensure directories exist
fs.mkdirSync(staticDir, { recursive: true });
fs.mkdirSync(templatesDir, { recursive: true });

app.use("/static", express.static(staticDir));

// Home route
app.get("/", (_req: Request, res: Response) => {
  const indexPath = path.join(templatesDir, "index.html");
  console.log(`Serving index from: ${indexPath}`);
  console.log(
    `${
      fs.existsSync(indexPath)
        ? "Index template exists"
        : "Index template does not exist"
    }`
  );

  // Check if the HTML template exists
  if (fs.existsSync(indexPath)) {
    console.log("Index template found, serving it.");
    res.sendFile(indexPath);
  } else {
    res.send(`
        <html>
          <head><title>MCP Client Server</title></head>
          <body>
            <h1>MCP Client Server</h1>
            <p>Agent Type: ${AGENT_TYPE}</p>
            <p>There is an error with the server.</p>
          </body>
        </html>
      `);
  }
});

// API routes
app.use("/", createRoutes());

app.listen(PORT, () => {
  initializeServer().catch((error) => {
    console.error("Error during server initialization:", error);
    process.exit(1);
  });

  console.log(`MCP Client server running on http://localhost:${PORT}`);
  console.log(`Agent Type: ${AGENT_TYPE}`);
});
