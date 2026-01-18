import dotenv from "dotenv";
import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { createRoutes } from "./routes";
import { globalSession } from "./core/session";
import { ServerStatus } from "./types";
import { logger } from "./utils/helpers";

// Setup variables and configurations

dotenv.config();
const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const PORT = portArg ? parseInt(portArg.split("=")[1], 10) : 3000;

const initializeServer = async () => {
  try {
    await globalSession.initialize();
    globalSession.state.status = ServerStatus.READY;
    logger.info({ header: "MCP Client intialization complete" });
  } catch (error) {
    logger.error({
      header: "Failed to initialize MCP client",
      body: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
};

const shutdownServer = async () => {
  if (globalSession.state.status === ServerStatus.CLOSING) {
    logger.info({ header: "Server is already shutting down..." });
    return;
  }
  globalSession.state.status = ServerStatus.CLOSING;
  logger.info({ header: "Shutting down gracefully..." });
  try {
    await globalSession.shutdown();
    logger.info({ header: "MCP Client shutdown complete" });
    globalSession.state.status = ServerStatus.CLOSED;
    process.exit(0);
  } catch (error) {
    logger.error({
      header: "Error during shutdown",
      body: error instanceof Error ? error.message : String(error),
    });
    globalSession.state.status = ServerStatus.ERROR;
    process.exit(1);
  }
};

process.on("SIGINT", shutdownServer);
process.on("SIGTERM", shutdownServer);

// (1) Initialize the Express application

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// (2) Static files setup
const publicDir = path.join(__dirname, "./public");
const staticDir = path.join(publicDir, "static");
const templatesDir = path.join(publicDir, "templates");

fs.mkdirSync(staticDir, { recursive: true });
fs.mkdirSync(templatesDir, { recursive: true });

// (3) Routing setup
app.use("/static", express.static(staticDir));
app.get("/", (_req: Request, res: Response) => {
  const indexPath = path.join(templatesDir, "index.html");
  if (fs.existsSync(indexPath)) {
    logger.debug({
      header: "Serving debugging interface",
      body: `Path: ${indexPath}`,
    });
    res.sendFile(indexPath);
  } else {
    res.send(`
        <html>
          <head><title>MCP Client Server</title></head>
          <body>
            <h1>MCP Client Server</h1>
            <p>There is an error with the server.</p>
          </body>
        </html>
      `);
  }
});
app.use("/", createRoutes());

// (4) Server initialization
app.listen(PORT, () => {
  try {
    initializeServer();
  } catch (error) {
    logger.error({
      header: "Error during server initialization",
      body: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
  logger.info({
    header: `Start MCP client initialization`,
    body: `Server is running on port ${PORT}`,
  });
});
