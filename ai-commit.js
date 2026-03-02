#!/usr/bin/env node

import { execSync } from "child_process";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import * as readline from "readline";
import { tmpdir } from "os";
import path from "path";
import { loadConfigAndEnv, initOpenAIClient, printTokenUsage, generateText, setupCliConsole } from "./ai-common.js";

// Load config and env
const { config, __dirname } = loadConfigAndEnv(import.meta.url);
// Configure client based on provider
const { client, modelName, provider } = initOpenAIClient(config, __dirname);
setupCliConsole();

// Parse command-line arguments for ticket number
const args = process.argv.slice(2);
let ticketNumber = null;
let developerMessage = null;
let labels = null;
let debug = false;
const excludedLabels = new Set();
const ALLOWED_LABELS = new Set([
  "bug",
  "documentation",
  "enhancement",
  "duplicate",
  "help wanted",
  "good first issue",
  "question",
  "wontfix",
]);

function printSignatureBanner() {
  const banner = [
    "##  ____  ____  ____   __   _  _  ____  __ _   ___  _  _   __   ____ ",
    "## (  _ \\(  _ \\(  _ \\ /  \\ / )( \\/ ___)(  ( \\ / __)/ )( \\ / _\\ (  _ \\",
    "##  ) _ ( )   / ) _ ((  O )) \\/ (\\___ \\/    /( (_ \\) \\/ (/    \\ )   /",
    "## (____/(__\\_)(____/ \\__/ \\____/(____/\\_)__) \\___/\\____/\\_/\\_/(__\\_)",
  ];
  console.log("");
  console.log(banner.join("\n"));
  console.log("");
}

function parseLabelList(rawLabels) {
  if (!rawLabels) return [];

  return String(rawLabels)
    .split(",")
    .map((label) => label.trim())
    .map((label) => label.replace(/^\[+/, "").replace(/\]+$/, "").trim())
    .map((label) => label.replace(/^"+|"+$/g, "").replace(/^'+|'+$/g, "").trim())
    .filter((label) => label.length > 0);
}

function normalizeLabelName(label) {
  const cleaned = String(label || "")
    .toLowerCase()
    .trim()
    .replace(/^\[+/, "")
    .replace(/\]+$/, "")
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "")
    .replace(/^-+/, "")
    .replace(/\s+/g, " ");

  if (!cleaned) return "";
  if (cleaned === "doc" || cleaned === "docs") return "documentation";
  if (cleaned === "feature" || cleaned === "enhance") return "enhancement";
  if (cleaned === "bugs" || cleaned === "defect") return "bug";
  if (cleaned === "wont-fix") return "wontfix";
  if (cleaned === "good-first-issue") return "good first issue";
  if (cleaned === "help-wanted") return "help wanted";
  return cleaned;
}

function normalizeLabels(rawLabels) {
  return parseLabelList(rawLabels)
    .map((label) => normalizeLabelName(label))
    .filter((label) => ALLOWED_LABELS.has(label))
    .join(",");
}

function filterExcludedLabels(rawLabels) {
  const normalized = normalizeLabels(rawLabels);
  if (!normalized) return "";

  return normalized
    .split(",")
    .map((label) => label.trim())
    .filter((label) => label && !excludedLabels.has(label))
    .join(",");
}

function buildGhLabelArgs(rawLabels) {
  const list = parseLabelList(rawLabels);
  if (list.length === 0) return "";
  return list.map((label) => ` --label "${label.replace(/"/g, '\\"')}"`).join("");
}

for (let i = 0; i < args.length; i++) {
  if ((args[i] === "-t" || args[i] === "--ticket") && args[i + 1]) {
    ticketNumber = args[i + 1];
    i++;
  } else if ((args[i] === "-m" || args[i] === "--message") && args[i + 1]) {
    developerMessage = args[i + 1];
    i++;
  } else if ((args[i] === "-l" || args[i] === "--labels") && args[i + 1]) {
    labels = normalizeLabels(args[i + 1]);
    i++;
  } else if ((args[i] === "-n" || args[i] === "--exclude-label" || args[i] === "--exclude-labels") && args[i + 1]) {
    const excluded = normalizeLabelName(args[i + 1]);
    if (ALLOWED_LABELS.has(excluded)) {
      excludedLabels.add(excluded);
    }
    i++;
  } else if (
    /^-[a-z][a-z-]*$/i.test(args[i]) &&
    !["-t", "--ticket", "-m", "--message", "-l", "--labels", "-d", "--debug", "-n", "--exclude-label", "--exclude-labels"].includes(args[i])
  ) {
    // Shorthand negative labels: -bug, -documentation, -enhancement, etc.
    const excluded = normalizeLabelName(args[i]);
    if (ALLOWED_LABELS.has(excluded)) {
      excludedLabels.add(excluded);
    }
  } else if (args[i] === "-d" || args[i] === "--debug") {
    debug = true;
  }
}

if (labels) {
  labels = filterExcludedLabels(labels);
}

function detectForcedType(context) {
  if (!context) return null;

  const text = context.toLowerCase();
  const hasAny = (patterns) => patterns.some((pattern) => pattern.test(text));

  if (hasAny([/\bfix\b/, /\bbug\b/, /\bbugfix\b/])) return "fix";
  if (hasAny([/\bfeature\b/, /\badd\b/, /\bnew\b/])) return "feat";
  if (hasAny([/\brefactor\b/, /\brestructure\b/])) return "refactor";
  if (hasAny([/\bhotfix\b/, /\burgent\b/, /\bcritical\b/])) return "hotfix";
  if (hasAny([/\bdocs?\b/, /\bdocumentation\b/])) return "docs";
  if (hasAny([/\btest\b/, /\btests\b/, /\btesting\b/])) return "test";
  if (hasAny([/\bperf\b/, /\bperformance\b/, /\boptimi[sz]e\b/])) return "perf";
  if (hasAny([/\bchore\b/, /\bmaintenance\b/, /\bhousekeeping\b/, /\bdependency\b/, /\bdependencies\b/, /\bbump\b/, /\bupgrade\b/])) return "chore";

  return null;
}

function normalizeBranchType(branchName, forcedType) {
  if (!forcedType || !branchName) return branchName;

  const trimmed = branchName.trim();
  if (trimmed.toLowerCase().startsWith(`${forcedType}/`)) {
    return trimmed;
  }

  const slashIndex = trimmed.indexOf("/");
  if (slashIndex > -1 && slashIndex < trimmed.length - 1) {
    return `${forcedType}/${trimmed.slice(slashIndex + 1)}`;
  }

  return `${forcedType}/${trimmed.replace(/^\/+/, "")}`;
}

function constrainBranchLength(branchName, minWords = 3, maxWords = 4) {
  if (!branchName || !branchName.includes("/")) return branchName;

  const [typeRaw, rawRest] = branchName.split("/", 2);
  const type = String(typeRaw || "").toLowerCase();
  if (!rawRest) return branchName;

  const rest = rawRest.trim();
  const parts = rest.split("-").filter(Boolean);
  if (parts.length === 0) return `${type}/${rest.toLowerCase()}`;

  let ticketPart = "";
  let descParts = parts;

  // Keep ticket if branch starts with something like SFSC-1593-...
  if (parts.length >= 2 && /^[a-z]+$/i.test(parts[0]) && /^\d+$/.test(parts[1])) {
    ticketPart = `${parts[0]}-${parts[1]}`;
    descParts = parts.slice(2);
  }

  if (descParts.length === 0) {
    descParts = ["update", "module", "config"];
  }

  const fillerOrConnectorWords = new Set([
    "and", "or", "to", "for", "with", "without", "by", "of", "in", "on", "at", "from", "via", "the", "a", "an",
  ]);
  const normalizedDescParts = descParts
    .map((part) => part.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  // Keep explicit words only; drop connectors/fillers from the description body.
  const explicitDescParts = normalizedDescParts.filter((part) => !fillerOrConnectorWords.has(part));
  const sanitizedDescParts = explicitDescParts.length > 0 ? explicitDescParts : [...normalizedDescParts];

  // Prefer 3 explicit words; allow 4 only when there is enough meaningful content.
  const preferredMaxWords = sanitizedDescParts.length >= 4 ? 4 : 3;
  const compactDesc = sanitizedDescParts.slice(0, Math.min(maxWords, preferredMaxWords));
  while (compactDesc.length < minWords) {
    compactDesc.push(sanitizedDescParts[sanitizedDescParts.length - 1] || "change");
  }

  const descSlug = compactDesc.join("-");
  return ticketPart ? `${type}/${ticketPart}-${descSlug}` : `${type}/${descSlug}`;
}

const forcedType = detectForcedType(developerMessage);

function loadGuideFile(fileName) {
  try {
    return readFileSync(path.join(__dirname, fileName), "utf8").trim();
  } catch (error) {
    console.warn(`## WARN: Could not load ${fileName}: ${error.message}`);
    return "";
  }
}

const branchNamingGuide = loadGuideFile("BRANCH_NAMING_GUIDE.md");
const commitMessageGuide = loadGuideFile("COMMIT_MESSAGE_GUIDE.md");
const styleGuideSystemMessage = [branchNamingGuide, commitMessageGuide]
  .filter(Boolean)
  .join("\n\n");
const localCompactSystemMessage = `
Follow strict git naming/message style.
- Branch type must be one of: feat, fix, refactor, chore, docs, test, perf, hotfix
- Branch format: type/${ticketNumber || "ticket"}-short-kebab-description
- Branch description after ticket should be 3 explicit words; 4 only if needed for clarity
- Never end branch description with filler words: and, or, to, for, with, by, of, in, on, at, from, via
- Commit format: ${ticketNumber ? `[${ticketNumber}] ` : ""}type(scope): short description
- Keep labels as comma-separated values from: bug, documentation, enhancement, duplicate, help wanted, good first issue, question, wontfix
- Never use excluded labels: ${excludedLabels.size > 0 ? Array.from(excludedLabels).join(", ") : "(none)"}
- Output MUST follow the exact requested template.
`.trim();
const effectiveSystemMessage = provider === "local" ? localCompactSystemMessage : styleGuideSystemMessage;

// Read staged git diff
let diff = "";
try {
  diff = execSync("git diff --cached", { encoding: "utf8" });
} catch {
  console.error("## ERROR: Failed to read git diff");
  process.exit(1);
}

if (!diff.trim()) {
  console.error("## ERROR: No staged changes. Run: git add <files>");
  process.exit(1);
}

const LOCAL_DIFF_CHAR_LIMIT = 2500;
const effectiveDiff = provider === "local" && diff.length > LOCAL_DIFF_CHAR_LIMIT
  ? `${diff.slice(0, LOCAL_DIFF_CHAR_LIMIT)}\n\n[...diff truncated for local model context...]`
  : diff;

function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function scoreVariantAlignment(variant, guidanceTokens) {
  if (!variant || guidanceTokens.length === 0) return 0;
  const combined = `${variant.commit || ""} ${variant.branch || ""}`.toLowerCase();
  let score = 0;
  for (const token of guidanceTokens) {
    if (combined.includes(token)) score += 1;
  }
  return score;
}

function prioritizeVariantsByDeveloperMessage(variants) {
  if (!developerMessage || !Array.isArray(variants) || variants.length <= 1) return variants;
  const guidanceTokens = [...new Set(tokenize(developerMessage))];
  if (guidanceTokens.length === 0) return variants;

  return [...variants].sort((a, b) => {
    const bScore = scoreVariantAlignment(b, guidanceTokens);
    const aScore = scoreVariantAlignment(a, guidanceTokens);
    return bScore - aScore;
  });
}

function formatDurationShort(secondsValue) {
  const totalSeconds = Math.max(0, Math.round(Number(secondsValue) || 0));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
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
You analyze code changes and generate 4 different variants of:
1. A clean commit message following Conventional Commits
2. A Gitflow-compliant branch name
3. Appropriate GitHub labels based on the change type

Rules:
- Commit message format: ${ticketNumber ? `[${ticketNumber}] ` : ""}type(scope): description
- Branch name format: type/ticket-description-in-kebab-case
  ${ticketNumber ? `* Include ticket number as provided: type/${ticketNumber}-short-description\n` : ""}  * Use kebab-case for words after ticket
  * Description after ticket should be 3 explicit words; use 4 only if needed for clarity
  * Never end branch description with filler words: and, or, to, for, with, by, of, in, on, at, from, via
- Types: feat, fix, refactor, chore, docs, test, perf, hotfix
- Labels: Choose 1-2 from: bug, documentation, enhancement, duplicate, help wanted, good first issue, question, wontfix
  * bug: Something isn't working or fixes an issue
  * documentation: Improvements or additions to documentation
  * enhancement: New feature or request
  * Use labels that best match the actual code changes
${excludedLabels.size > 0 ? `  * NEVER use excluded labels: ${Array.from(excludedLabels).join(", ")}` : ""}
- Be concise and descriptive
- No emojis
- PRIORITY ORDER:
  1) Developer Context is PRIMARY intent and wording source for commit/branch descriptions.
  2) Code diff is SECONDARY for validation and scope refinement.
  3) If context and diff conflict, keep the Developer Context intent and only adjust technical nouns for correctness.
${developerMessage ? `- Developer Context: "${developerMessage}"
  * Reuse concrete terms from this context in BOTH commit description and branch description.
  * Ensure at least 2 key nouns/phrases from this context appear in each generated variant.
  * CRITICAL: If the context contains keywords like "fix", "bug", "bugfix" -> use ONLY "fix" type for ALL 4 variants
  * If it contains "feature", "add", "new" -> use ONLY "feat" type for ALL 4 variants
  * If it contains "refactor", "restructure" -> use ONLY "refactor" type for ALL 4 variants
  * If it contains "hotfix", "urgent", "critical" -> use ONLY "hotfix" type for ALL 4 variants
  * If it contains "docs", "documentation" -> use ONLY "docs" type for ALL 4 variants
  * If it contains "test", "testing" -> use ONLY "test" type for ALL 4 variants
  * If it contains "perf", "performance", "optimize" -> use ONLY "perf" type for ALL 4 variants
  * If it contains "chore", "maintenance", "dependency", "bump", "upgrade" -> use ONLY "chore" type for ALL 4 variants
  * Otherwise, base the type on the actual code changes\n` : ""}
- Generate 4 DIFFERENT variants with varying levels of detail and focus (but same type when intent is clear)
- Output in this EXACT format:
  Variant 1:
  Commit: [commit message]
  Branch: [branch name]
  Labels: [label1,label2]
  
  Variant 2:
  Commit: [commit message]
  Branch: [branch name]
  Labels: [label1,label2]
  
  Variant 3:
  Commit: [commit message]
  Branch: [branch name]
  Labels: [label1,label2]
  
  Variant 4:
  Commit: [commit message]
  Branch: [branch name]
  Labels: [label1,label2]

${ticketNumber ? `Ticket: ${ticketNumber}\n` : ""}${developerMessage ? `Developer Context (primary intent): ${developerMessage}\n\n` : ""}Code Changes:
---
${effectiveDiff}
---

Generate 4 variants using Developer Context as primary intent and the code diff as validation:
`;

function parseVariants(outputText) {
  const strictResults = [];
  const variants = outputText.split(/Variant \d+:/i).filter(v => v.trim());

  if (variants.length >= 4) {
    for (let i = 0; i < 4; i++) {
      const commitMatch = variants[i].match(/Commit:\s*(.+)/i);
      const branchMatch = variants[i].match(/Branch:\s*(.+)/i);
      const labelsMatch = variants[i].match(/Labels:\s*(.+)/i);

      let processedLabels = "";
      if (labelsMatch) {
        processedLabels = filterExcludedLabels(labelsMatch[1]);
      }

      if (commitMatch && branchMatch) {
        strictResults.push({
          commit: commitMatch[1].trim(),
          branch: constrainBranchLength(normalizeBranchType(branchMatch[1], forcedType)),
          labels: processedLabels
        });
      }
    }
  }

  if (strictResults.length >= 4) {
    return strictResults.slice(0, 4);
  }

  const relaxedResults = [];
  const relaxedRegex = /Commit:\s*(.+?)\r?\nBranch:\s*(.+?)\r?\nLabels:\s*(.*?)(?=\r?\n(?:Variant\s+\d+:|Commit:)|$)/gis;
  let match;

  while ((match = relaxedRegex.exec(outputText)) !== null) {
    const processedLabels = (match[3] || "")
      .split(',')
      .map(label => label.trim())
      .filter(label => label.length > 0)
      .join(',');
    relaxedResults.push({
      commit: match[1].trim(),
      branch: constrainBranchLength(normalizeBranchType(match[2], forcedType)),
      labels: filterExcludedLabels(processedLabels)
    });
  }

  return relaxedResults.slice(0, 4);
}

function parseJsonVariants(outputText) {
  const cleaned = outputText
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        commit: String(item?.commit || "").trim(),
        branch: constrainBranchLength(normalizeBranchType(String(item?.branch || "").trim(), forcedType)),
        labels: String(item?.labels || "")
          .split(",")
          .map(label => label.trim())
          .filter(label => label.length > 0)
          .join(","),
      }))
      .map((item) => ({
        ...item,
        labels: filterExcludedLabels(item.labels),
      }))
      .filter((item) => item.commit && item.branch)
      .slice(0, 4);
  } catch {
    return [];
  }
}

function buildRecoveryPrompt(diffContent) {
  return `
Return ONLY valid JSON. No markdown.
Generate exactly 4 objects in an array with keys: commit, branch, labels.

Rules:
- commit format: ${ticketNumber ? `[${ticketNumber}] ` : ""}type(scope): description
- branch format: type/ticket-kebab-description
- types allowed: feat, fix, refactor, chore, docs, test, perf, hotfix
- labels: comma-separated from bug, documentation, enhancement, duplicate, help wanted, good first issue, question, wontfix
${excludedLabels.size > 0 ? `- NEVER use excluded labels: ${Array.from(excludedLabels).join(", ")}` : ""}
${developerMessage ? `- Developer Context is PRIMARY intent; reuse its key wording in commit and branch description` : ""}

JSON schema:
[{"commit":"...","branch":"...","labels":"label1,label2"}]

${ticketNumber ? `Ticket: ${ticketNumber}\n` : ""}${developerMessage ? `Developer Context (primary intent): ${developerMessage}\n\n` : ""}Code Changes:
---
${diffContent}
---
`;
}

async function generateVariants() {
  const genStartTime = Date.now();
  const result = await generateText({
    client,
    provider,
    modelName,
    systemPrompt: effectiveSystemMessage,
    userPrompt: prompt,
    temperature: 0.2,
    debug,
    debugLabel: "variants-primary",
  });
  const genElapsed = ((Date.now() - genStartTime) / 1000).toFixed(2);

  printTokenUsage(result.usage, { provider, modelName, config });

  let results = parseVariants(result.text);
  if (results.length < 4) {
    const recovery = await generateText({
      client,
      provider,
      modelName,
      systemPrompt: provider === "local" ? localCompactSystemMessage : styleGuideSystemMessage,
      userPrompt: buildRecoveryPrompt(effectiveDiff),
      temperature: 0.1,
      debug,
      debugLabel: "variants-recovery",
    });
    printTokenUsage(recovery.usage, { provider, modelName, config });
    results = parseJsonVariants(recovery.text);
  }

  results = prioritizeVariantsByDeveloperMessage(results);

  if (results.length === 0 && provider === "local") {
    console.log("## WARN: Model output format was not parseable. Try a stronger local model or smaller staged diff.");
  }

  return { results, generationTime: genElapsed };
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

async function selectCommitMessage(variants, generationTime) {
  console.log(`\n## Commit message and label variants (generated in ${formatDurationShort(generationTime)}):\n`);
  variants.forEach((v, i) => {
    console.log(`${i + 1}. ${v.commit}`);
    if (v.labels) {
      console.log(`   Labels: ${v.labels}`);
    }
  });
  
  while (true) {
    const answer = await askQuestion("\nSelect commit message (Enter=1, 2-4, or 'n' for new): ");
    
    if (answer === 'n' || answer === 'N') {
      return null; // Generate new variants
    }
    
    // Default to 1 if Enter is pressed
    const choice = answer.trim() === "" ? 1 : parseInt(answer);
    if (choice >= 1 && choice <= 4) {
      return { 
        commit: variants[choice - 1].commit,
        labels: variants[choice - 1].labels
      };
    }
    
    console.log("## ERROR: Invalid choice. Please enter 1-4 or 'n'");
  }
}

async function selectBranchName(variants, generationTime) {
  console.log(`\n## Branch name variants (generated in ${formatDurationShort(generationTime)}):\n`);
  variants.forEach((v, i) => {
    console.log(`${i + 1}. ${v.branch}`);
  });
  
  while (true) {
    const answer = await askQuestion("\nSelect branch name (Enter=1, 2-4, or 'n' for new): ");
    
    if (answer === 'n' || answer === 'N') {
      return null; // Generate new variants
    }
    
    // Default to 1 if Enter is pressed
    const choice = answer.trim() === "" ? 1 : parseInt(answer);
    if (choice >= 1 && choice <= 4) {
      return variants[choice - 1].branch;
    }
    
    console.log("## ERROR: Invalid choice. Please enter 1-4 or 'n'");
  }
}

async function run() {
  const startTime = Date.now();
  
  printSignatureBanner();
  console.log(`## INFO: Using model: ${modelName} (${provider})`);
  if (excludedLabels.size > 0) {
    console.log(`## INFO: Excluding labels: ${Array.from(excludedLabels).join(", ")}`);
  }
  
  try {
    console.log("\n## Workflow: Rename branch + Commit + Create PR\n");
    
    let selectedBranch = null;
    let selectedCommit = null;
    let selectedLabels = null;
    
    // Step 1: Select branch name
      while (!selectedBranch) {
        const { results: variants, generationTime } = await generateVariants();
        if (variants.length === 0) {
          console.error("## ERROR: Failed to generate variants");
          process.exit(1);
        }
        
        selectedBranch = await selectBranchName(variants, generationTime);
        
        if (!selectedBranch) {
          console.log("\n## INFO: Generating new variants...\n");
        }
      }
      
      // Step 2: Rename branch
      console.log(`\n## OK: Selected branch: ${selectedBranch}`);
      console.log("\n## INFO: Renaming branch...");
      
      try {
        execSync(`git branch -m ${selectedBranch}`, { stdio: "inherit" });
        console.log("## OK: Branch renamed successfully");
      } catch (error) {
        console.error("## ERROR: Branch rename failed:", error.message);
        process.exit(1);
      }

    // Step 3: Select commit message and labels
    while (!selectedCommit) {
      const { results: variants, generationTime } = await generateVariants();
      if (variants.length === 0) {
        console.error("## ERROR: Failed to generate variants");
        process.exit(1);
      }
      
      const selection = await selectCommitMessage(variants, generationTime);
      
      if (!selection) {
        console.log("\n## INFO: Generating new variants...\n");
      } else {
        selectedCommit = selection.commit;
        selectedLabels = selection.labels;
      }
    }
    
    // Step 4: Commit with selected message
    console.log(`\n## OK: Selected commit message: ${selectedCommit}`);
    if (selectedLabels) {
      console.log(`## INFO: Labels: ${selectedLabels}`);
    }
    console.log("\n## INFO: Creating commit...");
    
    try {
      execSync(`git commit -m "${selectedCommit.replace(/"/g, '\\"')}"`, { stdio: "inherit" });
      console.log("## OK: Commit created successfully");
    } catch (error) {
      console.error("## ERROR: Commit failed:", error.message);
      process.exit(1);
    }
    
    // Step 5 & 6: Push and create PR
      // Step 5: Push branch to remote
      console.log("\n## INFO: Pushing branch to remote...");
      try {
        execSync(`git push -u origin ${selectedBranch}`, { stdio: "inherit" });
        console.log("## OK: Push completed successfully");
      } catch (error) {
        console.error("## ERROR: Push failed:", error.message);
        console.log("## WARN: Continuing to create PR...");
      }
      
      // Step 6: Create Pull Request
      console.log("\n## INFO: Creating pull request...");
      try {
        const baseBranchName = "develop";
        execSync(`git fetch origin ${baseBranchName}`, { stdio: "inherit" });

        const latestCommitLog = execSync(
          `git log origin/${baseBranchName}..${selectedBranch} --oneline --no-merges`,
          { encoding: "utf8" }
        );
        const prBody = buildPrBodyFromCommitLog(latestCommitLog);
        const prTitle = selectedCommit;
        const tempBodyFile = path.join(tmpdir(), `pr-body-${Date.now()}.md`);
        writeFileSync(tempBodyFile, prBody, "utf8");

        let prCommand = `gh pr create --base ${baseBranchName} --head ${selectedBranch} --title "${prTitle.replace(/"/g, '\\"')}" --body-file "${tempBodyFile}" --assignee brahimbousnguar`;
        
        // Use AI-selected labels or command-line provided labels
        const finalLabels = filterExcludedLabels(labels || selectedLabels);
        if (finalLabels) {
          prCommand += buildGhLabelArgs(finalLabels);
        }

        try {
          execSync(prCommand, { stdio: "inherit" });
          console.log("## OK: Pull request created successfully");
        } finally {
          try { unlinkSync(tempBodyFile); } catch {}
        }
      } catch (error) {
        console.error("## ERROR: PR creation failed:", error.message);
        console.log("## INFO: Make sure GitHub CLI (gh) is installed and authenticated");
      }

    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const timeStr = elapsedSeconds >= 60 
      ? `${Math.floor(elapsedSeconds / 60)}m ${(elapsedSeconds % 60).toFixed(2)}s`
      : `${elapsedSeconds.toFixed(2)}s`;
    console.log(`\n## INFO: Total time: ${timeStr}\n`);
    
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      console.error("## ERROR: Cannot connect to Ollama. Make sure it's running: ollama serve");
      console.error(`## INFO: Then pull the model: ollama pull ${modelName}`);
    } else {
      console.error("## ERROR:", error.message);
    }
    process.exit(1);
  }
}

run();
