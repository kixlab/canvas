#!/usr/bin/env node

// Simple verification script to test the migrated MCP client
const { spawn } = require("child_process");
const path = require("path");

console.log("🔍 Verifying MCP Client Migration...\n");

// Test 1: Check TypeScript compilation
console.log("1. Checking TypeScript compilation...");
const tscProcess = spawn("npx", ["tsc", "--noEmit"], {
  cwd: __dirname,
  stdio: "pipe",
});

tscProcess.on("close", (code) => {
  if (code === 0) {
    console.log("✅ TypeScript compilation successful\n");

    // Test 2: Check that all required files exist
    console.log("2. Checking required files...");
    const fs = require("fs");
    const requiredFiles = [
      "index.ts",
      "agent.ts",
      "config.ts",
      "types.ts",
      "utils.ts",
      "prompts.ts",
      "modelFactory.ts",
      "express-types.ts",
      "package.json",
      "tsconfig.json",
    ];

    let allFilesExist = true;
    requiredFiles.forEach((file) => {
      if (fs.existsSync(path.join(__dirname, file))) {
        console.log(`  ✅ ${file}`);
      } else {
        console.log(`  ❌ ${file} - MISSING`);
        allFilesExist = false;
      }
    });

    if (allFilesExist) {
      console.log("\n✅ All required files present");
      console.log("\n🎉 Migration verification completed successfully!");
      console.log("\nNext steps:");
      console.log("1. Set up your .env file (copy from .env.example)");
      console.log("2. Build the MCP server: cd ../mcp_server && npm run build");
      console.log("3. Start the server: npm run dev");
    } else {
      console.log("\n❌ Some required files are missing");
      process.exit(1);
    }
  } else {
    console.log("❌ TypeScript compilation failed");
    process.exit(1);
  }
});

tscProcess.stderr.on("data", (data) => {
  console.error(`TypeScript Error: ${data}`);
});
