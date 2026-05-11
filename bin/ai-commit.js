#!/usr/bin/env node

import { execSync } from "child_process";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import * as readline from "readline";
import { tmpdir } from "os";
import path from "path";
import { loadConfigAndEnv, initOpenAIClient, printTokenUsage, generateText, setupCliConsole } from "../src/ai-common.js";

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
let debugContext = false;
let yes = false;
let jiraContextBlock = "";
let jiraIssueType = "";
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
const ALLOWED_BRANCH_TYPES = new Set(["feat", "fix", "refactor", "chore", "docs", "test", "perf", "hotfix"]);

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

function normalizeIssueTypeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function labelFromJiraIssueType(issueType) {
  const normalized = normalizeIssueTypeName(issueType);
  if (!normalized) return "";

  if (["bug", "dug", "defect"].includes(normalized)) return "bug";
  if (["task", "tache", "improvement", "enhancement"].includes(normalized)) return "enhancement";
  return "";
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

function applyJiraIssueTypeLabel(rawLabels) {
  const jiraLabel = labelFromJiraIssueType(jiraIssueType);
  const normalized = filterExcludedLabels(rawLabels);
  if (!jiraLabel || excludedLabels.has(jiraLabel)) return normalized;

  const labels = normalized
    ? normalized.split(",").map((label) => label.trim()).filter(Boolean)
    : [];
  const withoutTypeLabels = labels.filter((label) => label !== "bug" && label !== "enhancement");
  return [jiraLabel, ...withoutTypeLabels].slice(0, 2).join(",");
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
    ![
      "-t",
      "--ticket",
      "-m",
      "--message",
      "-l",
      "--labels",
      "-d",
      "--debug",
      "--debug-context",
      "--debug-windows",
      "-y",
      "--yes",
      "--auto",
      "-n",
      "--exclude-label",
      "--exclude-labels",
    ].includes(args[i])
  ) {
    // Shorthand negative labels: -bug, -documentation, -enhancement, etc.
    const excluded = normalizeLabelName(args[i]);
    if (ALLOWED_LABELS.has(excluded)) {
      excludedLabels.add(excluded);
    }
  } else if (args[i] === "-d" || args[i] === "--debug") {
    debug = true;
  } else if (args[i] === "--debug-context" || args[i] === "--debug-windows") {
    debugContext = true;
  } else if (args[i] === "-y" || args[i] === "--yes" || args[i] === "--auto") {
    yes = true;
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
  const sanitizedType = String(typeRaw || "").toLowerCase().replace(/[^a-z]/g, "");
  const type = ALLOWED_BRANCH_TYPES.has(sanitizedType) ? sanitizedType : (forcedType || "chore");
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

function loadPromptFile(fileName) {
  try {
    return readFileSync(path.join(__dirname, fileName), "utf8").trim();
  } catch (error) {
    console.warn(`## WARN: Could not load ${fileName}: ${error.message}`);
    return "";
  }
}

const branchNamingGuide = loadPromptFile("prompts/branch-naming.md");
const commitMessageGuide = loadPromptFile("prompts/commit-message.md");

function buildBranchSystemPrompt({ jsonOnly = false } = {}) {
  return `
${branchNamingGuide}

Additional workflow rules:
- Generate branch variants only.
- Developer Context (-m) is the primary intent source when present.
- Without Developer Context, use JIRA context as the branch naming source.
- Do not use git diff for branch naming unless Developer Context explicitly mentions it.
- Override the guide output rule for this CLI run: return 4 variants, not 1 branch.

Output:
${jsonOnly ? "- Return ONLY valid JSON. No markdown." : "- Return exactly 4 branch variants in the requested template. No extra commentary."}
`.trim();
}

function buildCommitSystemPrompt({ jsonOnly = false } = {}) {
  return `
${commitMessageGuide}

Additional workflow rules:
- Generate commit message and label variants only.
- Developer Context (-m) is the primary intent source when present.
- Without Developer Context, use git diff as the commit message source.
- Do not use full JIRA ticket context for commit wording.
- Override the guide output rule for this CLI run: return 4 variants, not 1 commit.

Label standards:
- Choose 0-2 labels from: bug, documentation, enhancement, duplicate, help wanted, good first issue, question, wontfix
- If JIRA issue type is Task/Tache, use enhancement. If JIRA issue type is Bug, use bug.
- Never use excluded labels: ${excludedLabels.size > 0 ? Array.from(excludedLabels).join(", ") : "(none)"}

Output:
${jsonOnly ? "- Return ONLY valid JSON. No markdown." : "- Return exactly 4 commit variants in the requested template. No extra commentary."}
`.trim();
}

const branchSystemPrompt = buildBranchSystemPrompt();
const commitSystemPrompt = buildCommitSystemPrompt();

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

function normalizeJiraBaseUrl(rawUrl) {
  if (!rawUrl) return "";
  const trimmed = String(rawUrl).trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function adfToPlainText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map((item) => adfToPlainText(item)).join("");

  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";

  const content = adfToPlainText(node.content || []);
  if (["paragraph", "heading", "listItem", "bulletList", "orderedList", "tableRow"].includes(node.type)) {
    return `${content}\n`;
  }
  return content;
}

function normalizeMultilineText(value, maxLength = 1800) {
  const text = String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[truncated]`;
}

function extractCommentText(comment) {
  if (!comment) return "";
  if (typeof comment.body === "string") return comment.body;
  return normalizeMultilineText(adfToPlainText(comment.body), 500);
}

async function fetchJiraTicketContext(ticketKey, config) {
  if (typeof fetch !== "function") {
    console.log("## WARN: This Node.js version does not support fetch; skipping JIRA context.");
    return "";
  }

  const jiraBaseUrl = normalizeJiraBaseUrl(process.env.JIRA_BASE_URL || config?.jira?.baseUrl);
  const jiraEmail = process.env.JIRA_EMAIL || config?.jira?.email;
  const jiraApiToken = process.env.JIRA_API_TOKEN || config?.jira?.apiToken;

  if (!jiraBaseUrl || !jiraEmail || !jiraApiToken) {
    console.log("## WARN: JIRA credentials missing (JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN); skipping JIRA context.");
    return "";
  }

  const auth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
  };

  const issueUrl = `${jiraBaseUrl}/rest/api/3/issue/${encodeURIComponent(ticketKey)}?fields=summary,description,status,issuetype,labels,comment`;
  const worklogUrl = `${jiraBaseUrl}/rest/api/3/issue/${encodeURIComponent(ticketKey)}/worklog?maxResults=5`;

  try {
    const [issueRes, worklogRes] = await Promise.all([
      fetch(issueUrl, { method: "GET", headers }),
      fetch(worklogUrl, { method: "GET", headers }),
    ]);

    if (!issueRes.ok) {
      const body = await issueRes.text();
      throw new Error(`JIRA issue fetch failed (${issueRes.status}): ${body.slice(0, 300)}`);
    }

    const issue = await issueRes.json();
    const fields = issue?.fields || {};
    const summary = normalizeMultilineText(fields.summary || "", 300);
    const description = normalizeMultilineText(adfToPlainText(fields.description), 1400);
    const status = fields?.status?.name || "Unknown";
    const issueType = fields?.issuetype?.name || "Unknown";
    jiraIssueType = issueType;
    const issueLabels = Array.isArray(fields?.labels) ? fields.labels.join(", ") : "";
    const comments = Array.isArray(fields?.comment?.comments) ? fields.comment.comments : [];
    const recentComments = comments
      .slice(-3)
      .map((comment) => {
        const author = comment?.author?.displayName || "Unknown";
        const text = extractCommentText(comment);
        return text ? `- ${author}: ${text}` : "";
      })
      .filter(Boolean)
      .join("\n");

    let recentWorklogs = "";
    if (worklogRes.ok) {
      const worklogs = await worklogRes.json();
      const items = Array.isArray(worklogs?.worklogs) ? worklogs.worklogs : [];
      recentWorklogs = items
        .slice(-3)
        .map((worklog) => {
          const author = worklog?.author?.displayName || "Unknown";
          const note = normalizeMultilineText(adfToPlainText(worklog?.comment), 300) || "No comment";
          return `- ${author}: ${note}`;
        })
        .join("\n");
    }

    const sections = [
      `Ticket: ${ticketKey}`,
      `Type: ${issueType}`,
      `Status: ${status}`,
      summary ? `Summary: ${summary}` : "",
      issueLabels ? `Labels: ${issueLabels}` : "",
      description ? `Requirements/Description:\n${description}` : "",
      recentComments ? `Recent Comments (what was done):\n${recentComments}` : "",
      recentWorklogs ? `Recent Worklogs (what was done):\n${recentWorklogs}` : "",
    ].filter(Boolean);

    return sections.join("\n\n");
  } catch (error) {
    console.log(`## WARN: Could not load JIRA context for ${ticketKey}: ${error.message}`);
    return "";
  }
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

function getBranchPromptContext() {
  const trimmedDeveloperMessage = String(developerMessage || "").trim();
  const hasDeveloperContext = trimmedDeveloperMessage.length > 0;

  return {
    trimmedDeveloperMessage,
    promptJiraContext: hasDeveloperContext ? "" : jiraContextBlock,
    excludedContextReason: hasDeveloperContext
      ? "Developer Context (-m) is present, so JIRA context is excluded from branch generation."
      : "",
  };
}

function getCommitPromptContext(diffContent = effectiveDiff) {
  const trimmedDeveloperMessage = String(developerMessage || "").trim();
  const hasDeveloperContext = trimmedDeveloperMessage.length > 0;

  return {
    trimmedDeveloperMessage,
    promptDiff: hasDeveloperContext ? "" : diffContent,
    excludedContextReason: hasDeveloperContext
      ? "Developer Context (-m) is present, so diff context is excluded from commit generation."
      : "",
  };
}

function buildBranchPrompt() {
  const {
    trimmedDeveloperMessage,
    promptJiraContext,
  } = getBranchPromptContext();

  return `
Generate 4 different branch name variants.

${ticketNumber ? `Ticket: ${ticketNumber}\n` : ""}${trimmedDeveloperMessage ? `Developer Context (-m, highest priority):\n${trimmedDeveloperMessage}\n\nUse concrete wording from Developer Context in every branch.\n\n` : ""}${promptJiraContext ? `JIRA Ticket Context:\n${promptJiraContext}\n\n` : ""}
Output exactly:
Variant 1:
Branch: [branch name]

Variant 2:
Branch: [branch name]

Variant 3:
Branch: [branch name]

Variant 4:
Branch: [branch name]
`;
}

function buildCommitPrompt() {
  const {
    trimmedDeveloperMessage,
    promptDiff,
  } = getCommitPromptContext();

  const jiraIssueTypeLine = jiraIssueType ? `JIRA Issue Type: ${jiraIssueType}\n` : "";

  return `
Generate 4 different commit message and label variants.

${ticketNumber ? `Ticket: ${ticketNumber}\n` : ""}${jiraIssueTypeLine}${trimmedDeveloperMessage ? `Developer Context (-m, highest priority):\n${trimmedDeveloperMessage}\n\nUse concrete wording from Developer Context in every commit message.\n\n` : ""}${promptDiff ? `Code Changes:
---
${promptDiff}
---

` : ""}
Output exactly:
Variant 1:
Commit: [commit message]
Labels: [label1,label2]

Variant 2:
Commit: [commit message]
Labels: [label1,label2]

Variant 3:
Commit: [commit message]
Labels: [label1,label2]

Variant 4:
Commit: [commit message]
Labels: [label1,label2]
`;
}

function parseBranchVariants(outputText) {
  const results = [];
  const variants = outputText.split(/Variant \d+:/i).filter(v => v.trim());

  for (const variant of variants) {
    const branchMatch = variant.match(/Branch:\s*(.+)/i);
    if (branchMatch) {
      results.push({
        branch: constrainBranchLength(normalizeBranchType(branchMatch[1], forcedType)),
      });
    }
  }

  if (results.length > 0) return results.slice(0, 4);

  return String(outputText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(feat|fix|refactor|chore|docs|test|perf|hotfix)\//i.test(line))
    .map((branch) => ({
      branch: constrainBranchLength(normalizeBranchType(branch, forcedType)),
    }))
    .slice(0, 4);
}

function parseCommitVariants(outputText) {
  const results = [];
  const variants = outputText.split(/Variant \d+:/i).filter(v => v.trim());

  for (const variant of variants) {
    const commitMatch = variant.match(/Commit:\s*(.+)/i);
    const labelsMatch = variant.match(/Labels:\s*(.+)/i);
    if (commitMatch) {
      results.push({
        commit: commitMatch[1].trim(),
        labels: applyJiraIssueTypeLabel(labelsMatch ? labelsMatch[1] : ""),
      });
    }
  }

  return results.slice(0, 4);
}

function parseJsonBranchVariants(outputText) {
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
        branch: constrainBranchLength(normalizeBranchType(String(item?.branch || "").trim(), forcedType)),
      }))
      .filter((item) => item.branch)
      .slice(0, 4);
  } catch {
    return [];
  }
}

function parseJsonCommitVariants(outputText) {
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
        labels: String(item?.labels || "")
          .split(",")
          .map(label => label.trim())
          .filter(label => label.length > 0)
          .join(","),
      }))
      .map((item) => ({
        ...item,
        labels: applyJiraIssueTypeLabel(item.labels),
      }))
      .filter((item) => item.commit)
      .slice(0, 4);
  } catch {
    return [];
  }
}

function buildBranchRecoveryPrompt() {
  const {
    trimmedDeveloperMessage,
    promptJiraContext,
  } = getBranchPromptContext();

  return `
Return ONLY valid JSON. No markdown.
Generate exactly 4 objects in an array with key: branch.

JSON schema:
[{"branch":"..."}]

${ticketNumber ? `Ticket: ${ticketNumber}\n` : ""}${trimmedDeveloperMessage ? `Developer Context (-m, highest priority):\n${trimmedDeveloperMessage}\n\n` : ""}${promptJiraContext ? `JIRA Ticket Context:\n${promptJiraContext}\n\n` : ""}
`;
}

function buildCommitRecoveryPrompt() {
  const {
    trimmedDeveloperMessage,
    promptDiff,
  } = getCommitPromptContext();

  const jiraIssueTypeLine = jiraIssueType ? `JIRA Issue Type: ${jiraIssueType}\n` : "";

  return `
Return ONLY valid JSON. No markdown.
Generate exactly 4 objects in an array with keys: commit, labels.

JSON schema:
[{"commit":"...","labels":"label1,label2"}]

${ticketNumber ? `Ticket: ${ticketNumber}\n` : ""}${jiraIssueTypeLine}${trimmedDeveloperMessage ? `Developer Context (-m, highest priority):\n${trimmedDeveloperMessage}\n\n` : ""}${promptDiff ? `Code Changes:
---
${promptDiff}
---
` : ""}
`;
}

function estimateTokenCount(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

function printContextWindow(label, value) {
  const text = String(value || "");
  console.log(`\n## DEBUG: --- Context Window: ${label} ---`);
  console.log(`## DEBUG: chars=${text.length}, approx_tokens=${estimateTokenCount(text)}`);
  if (text.trim()) {
    console.log(text);
  } else {
    console.log("## DEBUG: (empty)");
  }
  console.log(`## DEBUG: --- End Context Window: ${label} ---`);
}

function printBranchContextWindows({ userPrompt, recoveryPrompt = "" }) {
  const {
    trimmedDeveloperMessage,
    promptJiraContext,
    excludedContextReason,
  } = getBranchPromptContext();
  console.log("\n## DEBUG: === Branch Context Windows ===");
  console.log(`## DEBUG: ticket=${ticketNumber || "(none)"}`);
  console.log(`## DEBUG: jiraIssueType=${jiraIssueType || "(none)"}`);
  console.log(`## DEBUG: jiraIssueTypeLabel=${labelFromJiraIssueType(jiraIssueType) || "(none)"}`);
  console.log(`## DEBUG: provider=${provider}`);
  console.log(`## DEBUG: model=${modelName}`);
  if (excludedContextReason) {
    console.log(`## DEBUG: ${excludedContextReason}`);
  }
  printContextWindow("branch system prompt", branchSystemPrompt);
  printContextWindow("developer context", trimmedDeveloperMessage);
  if (promptJiraContext) {
    printContextWindow("JIRA ticket context", promptJiraContext);
  } else if (jiraContextBlock) {
    console.log("\n## DEBUG: JIRA ticket context excluded from branch prompt");
  }
  printContextWindow("branch user prompt", userPrompt);
  if (recoveryPrompt) {
    printContextWindow("branch recovery user prompt", recoveryPrompt);
  }
  console.log("\n## DEBUG: === End Branch Context Windows ===\n");
}

function printCommitContextWindows({ userPrompt, recoveryPrompt = "" }) {
  const {
    trimmedDeveloperMessage,
    promptDiff,
    excludedContextReason,
  } = getCommitPromptContext();
  console.log("\n## DEBUG: === Commit Context Windows ===");
  console.log(`## DEBUG: ticket=${ticketNumber || "(none)"}`);
  console.log(`## DEBUG: jiraIssueType=${jiraIssueType || "(none)"}`);
  console.log(`## DEBUG: jiraIssueTypeLabel=${labelFromJiraIssueType(jiraIssueType) || "(none)"}`);
  console.log(`## DEBUG: provider=${provider}`);
  console.log(`## DEBUG: model=${modelName}`);
  if (excludedContextReason) {
    console.log(`## DEBUG: ${excludedContextReason}`);
  }
  printContextWindow("commit system prompt", commitSystemPrompt);
  printContextWindow("developer context", trimmedDeveloperMessage);
  if (promptDiff) {
    printContextWindow("effective staged diff", promptDiff);
  } else if (diff.trim()) {
    console.log("\n## DEBUG: staged diff excluded from commit prompt");
  }
  printContextWindow("commit user prompt", userPrompt);
  if (recoveryPrompt) {
    printContextWindow("commit recovery user prompt", recoveryPrompt);
  }
  console.log("\n## DEBUG: === End Commit Context Windows ===\n");
}

async function generateBranchVariants() {
  const genStartTime = Date.now();
  const primaryPrompt = buildBranchPrompt();
  if (debugContext) {
    printBranchContextWindows({ userPrompt: primaryPrompt });
  }
  const result = await generateText({
    client,
    provider,
    modelName,
    systemPrompt: branchSystemPrompt,
    userPrompt: primaryPrompt,
    temperature: 0.2,
    debug,
    debugLabel: "branch-variants-primary",
  });
  const genElapsed = ((Date.now() - genStartTime) / 1000).toFixed(2);

  printTokenUsage(result.usage, { provider, modelName, config });

  let results = parseBranchVariants(result.text);
  if (results.length < 4) {
    const recoveryPrompt = buildBranchRecoveryPrompt();
    if (debugContext) {
      printBranchContextWindows({ userPrompt: primaryPrompt, recoveryPrompt });
    }
    const recovery = await generateText({
      client,
      provider,
      modelName,
      systemPrompt: buildBranchSystemPrompt({ jsonOnly: true }),
      userPrompt: recoveryPrompt,
      temperature: 0.1,
      debug,
      debugLabel: "branch-variants-recovery",
    });
    printTokenUsage(recovery.usage, { provider, modelName, config });
    results = parseJsonBranchVariants(recovery.text);
  }

  results = prioritizeVariantsByDeveloperMessage(results);

  if (results.length === 0 && provider === "local") {
    console.log("## WARN: Model output format was not parseable. Try a stronger local model or smaller staged diff.");
  }

  return { results, generationTime: genElapsed };
}

async function generateCommitVariants() {
  const genStartTime = Date.now();
  const primaryPrompt = buildCommitPrompt();
  if (debugContext) {
    printCommitContextWindows({ userPrompt: primaryPrompt });
  }
  const result = await generateText({
    client,
    provider,
    modelName,
    systemPrompt: commitSystemPrompt,
    userPrompt: primaryPrompt,
    temperature: 0.2,
    debug,
    debugLabel: "commit-variants-primary",
  });
  const genElapsed = ((Date.now() - genStartTime) / 1000).toFixed(2);

  printTokenUsage(result.usage, { provider, modelName, config });

  let results = parseCommitVariants(result.text);
  if (results.length < 4) {
    const recoveryPrompt = buildCommitRecoveryPrompt();
    if (debugContext) {
      printCommitContextWindows({ userPrompt: primaryPrompt, recoveryPrompt });
    }
    const recovery = await generateText({
      client,
      provider,
      modelName,
      systemPrompt: buildCommitSystemPrompt({ jsonOnly: true }),
      userPrompt: recoveryPrompt,
      temperature: 0.1,
      debug,
      debugLabel: "commit-variants-recovery",
    });
    printTokenUsage(recovery.usage, { provider, modelName, config });
    results = parseJsonCommitVariants(recovery.text);
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

  if (yes) {
    console.log("\n## INFO: --yes enabled; selecting commit message 1");
    return {
      commit: variants[0].commit,
      labels: variants[0].labels,
    };
  }
  
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

  if (yes) {
    console.log("\n## INFO: --yes enabled; selecting branch name 1");
    return variants[0].branch;
  }
  
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
  if (yes) {
    console.log("## INFO: Non-interactive mode enabled; defaulting selections to option 1");
  }
  if (excludedLabels.size > 0) {
    console.log(`## INFO: Excluding labels: ${Array.from(excludedLabels).join(", ")}`);
  }
  
  try {
    console.log("\n## Workflow: Rename branch + Commit + Create PR\n");

    if (ticketNumber) {
      console.log(`## INFO: Loading JIRA context for ticket ${ticketNumber}...`);
      jiraContextBlock = await fetchJiraTicketContext(ticketNumber, config);
      if (jiraContextBlock) {
        const jiraLabel = labelFromJiraIssueType(jiraIssueType);
        if (developerMessage?.trim()) {
          console.log("## OK: JIRA ticket context loaded for issue type and labels; -m remains the generation priority.");
        } else {
          console.log("## OK: JIRA ticket context loaded for branch generation and label correction.");
        }
        if (jiraLabel) {
          console.log(`## INFO: JIRA issue type '${jiraIssueType}' maps to GitHub label '${jiraLabel}'.`);
        }
      }
      if (developerMessage?.trim()) {
        console.log("## INFO: Developer context provided with -m; excluding full JIRA context and diff context from generation.");
      }
    }
    
    let selectedBranch = null;
    let selectedCommit = null;
    let selectedLabels = null;
    
    // Step 1: Select branch name
      while (!selectedBranch) {
	        const { results: variants, generationTime } = await generateBranchVariants();
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
	      const { results: variants, generationTime } = await generateCommitVariants();
      if (variants.length === 0) {
        console.error("## ERROR: Failed to generate variants");
        process.exit(1);
      }
      
      const selection = await selectCommitMessage(variants, generationTime);
      
      if (!selection) {
        console.log("\n## INFO: Generating new variants...\n");
      } else {
        selectedCommit = selection.commit;
        selectedLabels = applyJiraIssueTypeLabel(selection.labels);
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
        const finalLabels = labels ? filterExcludedLabels(labels) : applyJiraIssueTypeLabel(selectedLabels);
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
