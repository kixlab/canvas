import dotenv from "dotenv";
import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { createRoutes } from "./routes";
import { globalSession } from "./core/session";

///////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////
// Setup variables and configurations

dotenv.config();
const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const PORT = portArg ? parseInt(portArg.split("=")[1], 10) : 3000;
let isShuttingDown = false;

const initializeServer = async () => {
  try {
    await globalSession.initialize();
    console.log(`MCP Client initialized`);
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

process.on("SIGINT", shutdownServer);
process.on("SIGTERM", shutdownServer);

///////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////
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
    console.log(`Serving a debugging interface from: ${indexPath}`);
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
    console.error("Error during server initialization:", error);
    process.exit(1);
  }
  console.log(`MCP Client server is running on port ${PORT}`);
});
