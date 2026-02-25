#!/usr/bin/env node

import OpenAI from "openai";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { execSync } from "child_process";
import dotenv from "dotenv";
import { printTokenUsage, generateText } from "./ai-common.js";

// Load config
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from script directory
dotenv.config({ path: path.join(__dirname, ".env"), override: true });
const config = JSON.parse(readFileSync(path.join(__dirname, "config.json"), "utf8"));

// Configure client based on provider
let client;
let modelName;

// Parse provider for optional model override (e.g., "local:mistral-nemo:12b")
const [provider, modelOverride] = config.provider.split(":");

if (provider === "cloud") {
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OpenAI API key not set in .env file");
    console.error("   Add OPENAI_API_KEY to your .env file");
    process.exit(1);
  }
  client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  modelName = modelOverride || config.cloud.model;
} else {
  // Local Ollama
  client = new OpenAI({
    baseURL: config.local.baseURL,
    apiKey: "ollama", // required but unused for Ollama
  });
  modelName = modelOverride || config.local.default;
}

// Parse command-line arguments
const args = process.argv.slice(2);
let logType = "runtime"; // default: runtime
let logLines = 200; // default: 200 lines
let logPath = config.muleLogs?.defaultPath || "D:\\IDE\\AnypointStudio\\plugins\\org.mule.tooling.server.4.10.ee_7.22.0.202511192101\\mule\\logs";
let specificLogFile = null;

function showHelp() {
  console.log(`
🔍 Mule App Log Analyzer
========================

Usage: node ai-mule-logs.js [options]

Options:
  -t, --type <type>        Log type to analyze: "build" or "runtime" (default: runtime)
  -l, --lines <number>     Number of log lines to analyze (default: 200)
  -p, --path <path>        Custom path to Mule logs directory
  -f, --file <filename>    Specific log file to analyze (e.g., mule-app.log)
  -h, --help               Show this help message

Examples:
  node ai-mule-logs.js
  node ai-mule-logs.js --type build --lines 300
  node ai-mule-logs.js --path "C:\\Custom\\Path\\logs"
  node ai-mule-logs.js --file mule-app.log --lines 500
  node ai-mule-logs.js -t runtime -l 150 -f mule-app.log

Log Types:
  - runtime: Analyzes Mule Runtime Engine logs (mule-app.log, etc.)
  - build:   Analyzes Mule Build logs (deployment, startup logs)

Configuration:
  Default log path can be set in config.json under "muleLogs.defaultPath"
`);
  process.exit(0);
}

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-h" || args[i] === "--help") {
    showHelp();
  } else if ((args[i] === "-t" || args[i] === "--type") && args[i + 1]) {
    logType = args[i + 1].toLowerCase();
    if (logType !== "build" && logType !== "runtime") {
      console.error("❌ Invalid log type. Use 'build' or 'runtime'");
      process.exit(1);
    }
    i++;
  } else if ((args[i] === "-l" || args[i] === "--lines") && args[i + 1]) {
    logLines = parseInt(args[i + 1]);
    if (isNaN(logLines) || logLines < 1) {
      console.error("❌ Invalid number of lines");
      process.exit(1);
    }
    i++;
  } else if ((args[i] === "-p" || args[i] === "--path") && args[i + 1]) {
    logPath = args[i + 1];
    i++;
  } else if ((args[i] === "-f" || args[i] === "--file") && args[i + 1]) {
    specificLogFile = args[i + 1];
    i++;
  }
}

// Function to find the most recent log file
function findRecentLogFile(logDir, logType) {
  if (!existsSync(logDir)) {
    console.error(`❌ Log directory not found: ${logDir}`);
    console.error("   Use --path to specify a different directory");
    process.exit(1);
  }

  const files = readdirSync(logDir);
  
  // Filter log files based on type
  const logPatterns = {
    runtime: /^(mule-app.*\.log|mule.*\.log)$/i,
    build: /^(mule-build.*\.log|deployment.*\.log|startup.*\.log|console.*\.log|mule.*\.log)$/i
  };
  
  const pattern = logPatterns[logType];
  const logFiles = files.filter(f => pattern.test(f));
  
  if (logFiles.length === 0) {
    console.error(`❌ No ${logType} log files found in: ${logDir}`);
    console.error(`   Looking for pattern: ${pattern}`);
    process.exit(1);
  }
  
  // Get the most recent file
  const filesWithStats = logFiles.map(f => ({
    name: f,
    path: path.join(logDir, f),
    mtime: statSync(path.join(logDir, f)).mtime
  }));
  
  filesWithStats.sort((a, b) => b.mtime - a.mtime);
  
  return filesWithStats[0];
}

// Function to read last N lines from a file
function readLastLines(filePath, numLines) {
  try {
    // Read entire file
    const content = readFileSync(filePath, "utf8");
    
    if (!content || content.trim().length === 0) {
      return "";
    }
    
    // Split into lines and get last N lines
    const lines = content.split("\n");
    const startIndex = Math.max(0, lines.length - numLines);
    const lastLines = lines.slice(startIndex);
    
    return lastLines.join("\n");
  } catch (error) {
    console.error("❌ Failed to read log file:", error.message);
    console.error("   File path:", filePath);
    process.exit(1);
  }
}

// Main analysis function
async function analyzeLogs() {
  const startTime = Date.now();
  
  console.log(`\n🔍 Mule Log Analyzer`);
  console.log(`========================`);
  console.log(`📂 Log directory: ${logPath}`);
  console.log(`📝 Log type: ${logType}`);
  console.log(`📊 Lines to analyze: ${logLines}`);
  
  // Find log file
  let logFile;
  if (specificLogFile) {
    const fullPath = path.join(logPath, specificLogFile);
    if (!existsSync(fullPath)) {
      console.error(`❌ Log file not found: ${fullPath}`);
      process.exit(1);
    }
    logFile = {
      name: specificLogFile,
      path: fullPath,
      mtime: statSync(fullPath).mtime
    };
  } else {
    logFile = findRecentLogFile(logPath, logType);
  }
  
  console.log(`📄 Analyzing: ${logFile.name}`);
  console.log(`🕒 Last modified: ${logFile.mtime.toLocaleString()}`);
  console.log(`\n⏳ Reading log file...`);
  
  // Read last N lines
  const logContent = readLastLines(logFile.path, logLines);
  
  if (!logContent.trim()) {
    console.error("❌ Log file is empty or could not be read");
    process.exit(1);
  }
  
  const contentSize = (logContent.length / 1024).toFixed(2);
  console.log(`✅ Read ${logContent.split('\n').length} lines (${contentSize} KB)`);
  
  // Create prompt based on log type
  const prompt = `
You are an expert Mule ESB/Anypoint Platform developer analyzing ${logType} logs.

Task: Analyze the following Mule ${logType} log and:
1. Identify all errors, exceptions, and warnings
2. Determine the root cause of the primary error
3. Trace the error origin (which flow, component, or configuration caused it)
4. Provide actionable recommendations to fix the issue
5. Highlight any related secondary errors or warnings

${logType === "runtime" ? `
Focus on:
- Exception stack traces and error messages
- Flow execution paths
- Component failures (HTTP requests, database queries, transformations, etc.)
- Connection issues and timeouts
- Data transformation errors
- Message processing failures
` : `
Focus on:
- Deployment failures
- Application startup errors
- Configuration issues
- Dependency problems
- Plugin or connector issues
- Resource loading failures
`}

Format your response as:

## 🔴 Primary Error
[Brief description of the main error]

## 📍 Error Origin
[Exact location: flow name, component, file, line number if available]

## 🔍 Root Cause Analysis
[Detailed explanation of what caused the error]

## 📋 Stack Trace Summary
[Key parts of the stack trace with explanation]

## ⚠️ Related Issues
[Any secondary errors or warnings that might be related]

## ✅ Recommended Actions
1. [Specific action to fix the issue]
2. [Additional recommendations]
3. [Preventive measures]

## 💡 Additional Context
[Any other relevant information or insights]

---

Log Content (last ${logLines} lines):
---
${logContent}
---

Analyze the logs above and provide your detailed error analysis:
`;

  console.log(`\n🤖 Analyzing logs with ${modelName}...`);
  
  try {
    const result = await generateText({
      client,
      provider,
      modelName,
      userPrompt: prompt,
      temperature: 0.2,
      maxOutputTokens: 4000,
    });

    printTokenUsage(result.usage, { provider, modelName, config });
    
    const analysis = result.text;
    
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const timeStr = elapsedSeconds >= 60 
      ? `${Math.floor(elapsedSeconds / 60)}m ${(elapsedSeconds % 60).toFixed(2)}s`
      : `${elapsedSeconds.toFixed(2)}s`;
    
    console.log(`\n${"=".repeat(80)}`);
    console.log(`📊 ANALYSIS RESULTS`);
    console.log(`${"=".repeat(80)}\n`);
    console.log(analysis);
    console.log(`\n${"=".repeat(80)}`);
    console.log(`⏱️  Analysis completed in: ${timeStr}`);
    console.log(`${"=".repeat(80)}\n`);
    
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      console.error("❌ Cannot connect to Ollama. Make sure it's running: ollama serve");
      console.error(`   Then pull the model: ollama pull ${modelName}`);
    } else {
      console.error("❌ Error during analysis:", error.message);
    }
    process.exit(1);
  }
}

// Run the analyzer
analyzeLogs();
