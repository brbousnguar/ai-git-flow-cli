#!/usr/bin/env node

import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import * as readline from "readline";
import { tmpdir } from "os";
import path from "path";
import { loadConfigAndEnv, initOpenAIClient, printTokenUsage, generateText, setupCliConsole } from "./ai-common.js";

// Load config and env
const { config, __dirname } = loadConfigAndEnv(import.meta.url);
// Configure client based on provider
const { client, modelName, provider } = initOpenAIClient(config, __dirname);
setupCliConsole();

// Parse command-line arguments for version/tag
const args = process.argv.slice(2);
let version = null;
let labels = null;

function parseLabelList(rawLabels) {
  if (!rawLabels) return [];

  return String(rawLabels)
    .split(",")
    .map((label) => label.trim())
    .map((label) => label.replace(/^\[+/, "").replace(/\]+$/, "").trim())
    .map((label) => label.replace(/^"+|"+$/g, "").replace(/^'+|'+$/g, "").trim())
    .filter((label) => label.length > 0);
}

function normalizeLabels(rawLabels) {
  return parseLabelList(rawLabels).join(",");
}

function buildGhLabelArgs(rawLabels) {
  const list = parseLabelList(rawLabels);
  if (list.length === 0) return "";
  return list.map((label) => ` --label "${label.replace(/"/g, '\\"')}"`).join("");
}

for (let i = 0; i < args.length; i++) {
  if ((args[i] === "-v" || args[i] === "--version") && args[i + 1]) {
    version = args[i + 1];
    // Remove 'v' prefix if present to avoid duplication
    version = version.replace(/^v/i, "");
    i++;
  } else if ((args[i] === "-l" || args[i] === "--labels") && args[i + 1]) {
    labels = normalizeLabels(args[i + 1]);
    i++;
  }
}

// If no version provided, auto-detect and increment from last tag
if (!version) {
  try {
    // Fetch latest tags from remote and prune deleted ones
    console.log("🔄 Fetching latest tags from remote...");
    execSync("git fetch --tags --prune --prune-tags", { encoding: "utf8", stdio: "ignore" });
    
    // Get the latest tag globally (not just from current branch history)
    const allTags = execSync("git tag --sort=-version:refname", { encoding: "utf8" })
      .trim()
      .split(/\r?\n/) // Handle both \n and \r\n line endings
      .filter(tag => tag.length > 0);
    
    if (allTags.length === 0) {
      throw new Error("No tags found");
    }
    
    const lastTag = allTags[0];
    console.log(`ℹ️  Last tag: ${lastTag}`);
    
    // Parse version (handle both v1.0.0 and 1.0.0 formats)
    const versionMatch = lastTag.match(/v?(\d+)\.(\d+)\.(\d+)/);
    if (versionMatch) {
      const major = parseInt(versionMatch[1]);
      const minor = parseInt(versionMatch[2]);
      const patch = parseInt(versionMatch[3]);
      
      // Increment patch version
      version = `${major}.${minor}.${patch + 1}`;
      console.log(`ℹ️  Auto-incremented version: v${version}`);
    } else {
      console.log("⚠️  Could not parse last tag, using 'Release' as title");
    }
  } catch (error) {
    console.log("ℹ️  No tags found, using 'Release' as title");
  }
}

// Detect production branch name (main or master) - prefer remote
let prodBranch = "main";

// Check remote first for production branch (since it's the source of truth)
try {
  execSync("git rev-parse --verify origin/main", { encoding: "utf8", stdio: "pipe" });
  prodBranch = "origin/main";
} catch {
  try {
    execSync("git rev-parse --verify origin/master", { encoding: "utf8", stdio: "pipe" });
    prodBranch = "origin/master";
  } catch {
    // Fall back to local
    try {
      execSync("git rev-parse --verify main", { encoding: "utf8", stdio: "pipe" });
      prodBranch = "main";
    } catch {
      try {
        execSync("git rev-parse --verify master", { encoding: "utf8", stdio: "pipe" });
        prodBranch = "master";
      } catch {
        console.error("❌ Neither 'main' nor 'master' branch found");
        console.error("   Try: git fetch origin");
        process.exit(1);
      }
    }
  }
}

// Detect develop branch name - prefer local, fall back to remote
let devBranch = "develop";
try {
  execSync("git rev-parse --verify develop", { encoding: "utf8", stdio: "pipe" });
  devBranch = "develop";
} catch {
  try {
    execSync("git rev-parse --verify dev", { encoding: "utf8", stdio: "pipe" });
    devBranch = "dev";
  } catch {
    // Try remote develop
    try {
      execSync("git rev-parse --verify origin/develop", { encoding: "utf8", stdio: "pipe" });
      devBranch = "origin/develop";
      console.log(`ℹ️  Using remote develop branch (not found locally)`);
    } catch {
      try {
        execSync("git rev-parse --verify origin/dev", { encoding: "utf8", stdio: "pipe" });
        devBranch = "origin/dev";
        console.log(`ℹ️  Using remote dev branch (not found locally)`);
      } catch {
        console.error("❌ No 'develop' branch found locally or on remote");
        console.error("   Try: git fetch origin develop");
        process.exit(1);
      }
    }
  }
}

const baseBranchName = prodBranch.replace("origin/", "");
const headBranchName = devBranch.replace("origin/", "");

try {
  console.log("INFO: Fetching latest branches from origin before diff...");
  execSync("git fetch origin --prune", { stdio: "inherit" });

  execSync(`git rev-parse --verify origin/${baseBranchName}`, { encoding: "utf8", stdio: "pipe" });
  execSync(`git rev-parse --verify origin/${headBranchName}`, { encoding: "utf8", stdio: "pipe" });
} catch (error) {
  console.error("ERROR: Failed to fetch/verify remote branches before release diff:", error.message);
  process.exit(1);
}

prodBranch = `origin/${baseBranchName}`;
devBranch = `origin/${headBranchName}`;
console.log(`ℹ️  Comparing: ${devBranch} → ${prodBranch}`);

// Get diff between production and develop branches
let diff = "";
let commitLog = "";
try {
  // Get the actual diff
  diff = execSync(`git diff ${prodBranch}...${devBranch}`, { encoding: "utf8" });
  
  // Get commit messages for context
  commitLog = execSync(`git log ${prodBranch}..${devBranch} --oneline --no-merges`, { 
    encoding: "utf8" 
  });
} catch (error) {
  console.error(`❌ Failed to get git diff between ${prodBranch} and ${devBranch}`);
  console.error("   Try: git fetch origin");
  process.exit(1);
}

if (!diff.trim() && !commitLog.trim()) {
  console.error("❌ No changes between main and develop");
  process.exit(1);
}

function buildPrBodyFromCommitLog(rawCommitLog) {
  const messages = String(rawCommitLog || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[a-f0-9]{7,40}\s+/i, ""))
    .filter(Boolean);

  if (messages.length === 0) {
    return "## Commits Included\n- No commit messages found";
  }

  return ["## Commits Included", ...messages.map((msg) => `- ${msg}`)].join("\n");
}

// Prompt
const prompt = `
Generate concise Release Notes for merging ${devBranch} into ${prodBranch}, and suggest appropriate GitHub labels.

IMPORTANT: Output ONLY the Release Notes section followed by Labels. Do NOT include a PR Title line.

Output format:
**Release Notes:**
[List high-level changes only]
[Use proper markdown formatting with bold headers]
[Categories if needed: **Features:**, **Bug Fixes:**, **Refactoring:**, **Chores:**]
[NO code references, file names, or technical details]
[NO backticks or code formatting]
[SKIP empty sections]
[Be extremely brief - one line per change]

**Labels:** [label1,label2]
[Choose 1-2 from: bug, documentation, enhancement, duplicate, help wanted, good first issue, question, wontfix]
[bug: Something isn't working or fixes an issue]
[documentation: Improvements or additions to documentation]
[enhancement: New feature or request]
[Use labels that best match the release changes]

Example good format:
**Release Notes:**
- Update API dependency to latest version
- Fix authentication timeout issue

**Labels:** enhancement,bug

Example bad format (avoid):
- Updated the \`rbb-my-orders-sapi\` dependency version to \`1.0.35\` in pom.xml

---BEGIN ANALYSIS DATA (do not include in output)---
Commits: ${commitLog}
Diff: ${diff.slice(0, 8000)}
---END ANALYSIS DATA---
`;

async function generatePRDetails(variantNumber = 1) {
  const variantInstruction = variantNumber > 1 
    ? `\n\nIMPORTANT: This is variant #${variantNumber}. Generate DIFFERENT content from previous variants by:
- Using different wording and phrasing
- Focusing on different aspects of the changes
- Varying the level of detail
- Organizing information differently\n`
    : "";
  
  const result = await generateText({
    client,
    provider,
    modelName,
    userPrompt: prompt + variantInstruction,
    temperature: 0.7,
  });

  printTokenUsage(result.usage, { provider, modelName, config });

  return result.text;
}

async function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function run() {
  const startTime = Date.now();
  
  console.log(`🤖 Using model: ${modelName} (${provider})`);
  
  try {
    let output = null;
    let suggestedLabels = null;
    let approved = false;
    let variantNumber = 1;
    
    // Keep generating until user approves
    while (!approved) {
      const genStart = Date.now();
      output = await generatePRDetails(variantNumber);
      const genElapsed = (Date.now() - genStart) / 1000;
      const genTimeStr = genElapsed >= 60 
        ? `${Math.floor(genElapsed / 60)}m ${(genElapsed % 60).toFixed(2)}s`
        : `${genElapsed.toFixed(2)}s`;
      
      // Extract labels from output
      const labelsMatch = output.match(/\*\*Labels:\*\*\s*([^\r\n]+)/i);
      if (labelsMatch) {
        suggestedLabels = normalizeLabels(labelsMatch[1]);
      }
      
      console.log("\n" + "=".repeat(60));
      console.log("📦 Pull Request: develop → main");
      console.log("=".repeat(60));
      console.log(output);
      console.log("=".repeat(60));
      console.log(`⏱️  Generated in ${genTimeStr}\n`);
      
      const answer = await askQuestion("Use this PR? (Enter/yes or 'n' for new): ");
      
      if (answer.trim() === "" || answer.toLowerCase() === "yes" || answer.toLowerCase() === "y") {
        approved = true;
      } else {
        variantNumber++;
        console.log(`\n🔄 Generating variant #${variantNumber}...\n`);
      }
    }
    
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const timeStr = elapsedSeconds >= 60 
      ? `${Math.floor(elapsedSeconds / 60)}m ${(elapsedSeconds % 60).toFixed(2)}s`
      : `${elapsedSeconds.toFixed(2)}s`;
    
    console.log(`\n✅ PR approved! Total time: ${timeStr}\n`);
    
    // Ask for confirmation to create PR
    const createAnswer = await askQuestion("Create Pull Request? (Enter/yes or 'n' to cancel): ");
    
    if (createAnswer.trim() === "" || createAnswer.toLowerCase() === "yes" || createAnswer.toLowerCase() === "y") {
      try {
        // Refresh remote refs before creating the PR (no local checkout/switch)
        console.log("\nFetching latest branches from origin before PR creation...");
        execSync("git fetch origin --prune", { stdio: "inherit" });
        execSync(`git rev-parse --verify origin/${baseBranchName}`, { encoding: "utf8", stdio: "pipe" });
        execSync(`git rev-parse --verify origin/${headBranchName}`, { encoding: "utf8", stdio: "pipe" });
        console.log("\n✅ Remote branches fetched successfully!");
        
        // Get repository URL from git remote
        try {
          const remoteUrl = execSync("git config --get remote.origin.url", { encoding: "utf8" }).trim();
          let repoUrl = remoteUrl;
          
          // Convert SSH URL to HTTPS if needed
          if (remoteUrl.startsWith("git@github.com:")) {
            repoUrl = remoteUrl.replace("git@github.com:", "https://github.com/").replace(/\.git$/, "");
          } else if (remoteUrl.startsWith("https://github.com/")) {
            repoUrl = remoteUrl.replace(/\.git$/, "");
          }
          
          const prUrl = `${repoUrl}/compare/${baseBranchName}...${headBranchName}`;
          
          // Use version as title and include only commit messages in PR body
          const prTitle = version ? `v${version}` : "Release";
          const latestCommitLog = execSync(`git log origin/${baseBranchName}..origin/${headBranchName} --oneline --no-merges`, {
            encoding: "utf8"
          });
          const prBody = buildPrBodyFromCommitLog(latestCommitLog);
          
          // Debug: Show what will be sent
          console.log("\n📋 PR Details:");
          console.log("   Title:", prTitle);
          console.log("   Body length:", prBody.length, "characters");
          console.log("   Body preview:", prBody.substring(0, 200) + "...");
          
          // Try to create PR with GitHub CLI
          console.log("\n🚀 Attempting to create Pull Request...");
          try {
            // Validate gh availability/auth explicitly for clearer errors
            execSync("gh --version", { stdio: "pipe" });
            execSync("gh auth status -h github.com", { stdio: "pipe" });

            // Write body to temporary file to avoid shell escaping issues
            const tempFile = path.join(tmpdir(), `pr-body-${Date.now()}.md`);
            writeFileSync(tempFile, prBody, "utf8");
            
            try {
              // Use AI-suggested labels or command-line provided labels
              const finalLabels = labels || suggestedLabels;
              let prCommand = `gh pr create --base ${baseBranchName} --head ${headBranchName} --title "${prTitle}" --body-file "${tempFile}" --assignee brahimbousnguar`;
              
              if (finalLabels) {
                prCommand += buildGhLabelArgs(finalLabels);
                console.log(`🏷️  Using labels: ${finalLabels}`);
              }
              
              execSync(prCommand, { stdio: "inherit" });
              console.log("\n✅ Pull Request created successfully!");
            } finally {
              // Clean up temp file
              try { unlinkSync(tempFile); } catch {}
            }
          } catch (ghError) {
            // GitHub CLI not available or failed
            console.log("\n⚠️  GitHub CLI not available or failed to create PR automatically");
            if (ghError?.message) {
              console.log(`   Reason: ${ghError.message}`);
            }
            console.log("\n🔗 Open this URL to create the Pull Request:");
            console.log(`   ${prUrl}`);
            console.log("\n   Title: " + prTitle);
            console.log("   Body:\n   " + prBody.split('\n').join('\n   '));
          }
          
        } catch (error) {
          console.log("\n🔗 Create PR manually at your repository's compare page");
        }
        
      } catch (error) {
        console.error("\n❌ Error creating PR:", error.message);
      }
    } else {
      console.log("\n❌ PR creation cancelled");
    }
    
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      console.error("❌ Cannot connect to Ollama. Make sure it's running: ollama serve");
      console.error(`   Then pull the model: ollama pull ${modelName}`);
    } else {
      console.error("❌ Error:", error.message);
    }
    process.exit(1);
  }
}

run();
