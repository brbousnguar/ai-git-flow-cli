import { readFileSync } from "node:fs";
import path from "node:path";

import { getAppRoot, resolveRepoPath } from "@/lib/server/config";
import {
  buildPrBodyFromCommitLog,
  createCommit,
  createPullRequest,
  fetchOrigin,
  getCommitLog,
  getCurrentBranch,
  getRemoteUrl,
  getStagedDiff,
  pushBranch,
  remoteUrlToCompareUrl,
  renameCurrentBranch,
} from "@/lib/server/git";
import { fetchJiraTicketContext } from "@/lib/server/jira";
import { generateText, getAiRuntime } from "@/lib/server/openai";
import type { CommitVariant } from "@/lib/server/types";
import { parseLabelList, slugify } from "@/lib/server/utils";

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

function loadTextFile(fileName: string) {
  try {
    return readFileSync(path.join(getAppRoot(), fileName), "utf8").trim();
  } catch {
    return "";
  }
}

function normalizeLabelName(label: string) {
  const cleaned = String(label || "")
    .toLowerCase()
    .trim()
    .replace(/^\[+/, "")
    .replace(/\]+$/, "")
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "")
    .replace(/^-+/, "")
    .replace(/\s+/g, " ");

  if (cleaned === "docs" || cleaned === "doc") return "documentation";
  if (cleaned === "feature" || cleaned === "enhance") return "enhancement";
  if (cleaned === "bugs" || cleaned === "defect") return "bug";
  if (cleaned === "wont-fix") return "wontfix";
  if (cleaned === "good-first-issue") return "good first issue";
  if (cleaned === "help-wanted") return "help wanted";
  return cleaned;
}

function normalizeLabels(rawLabels = "") {
  return parseLabelList(rawLabels)
    .map(normalizeLabelName)
    .filter((label) => ALLOWED_LABELS.has(label))
    .join(",");
}

function filterExcludedLabels(rawLabels = "", excludedLabels: string[] = []) {
  const excluded = new Set(excludedLabels.map(normalizeLabelName));
  return normalizeLabels(rawLabels)
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean)
    .filter((label) => !excluded.has(label))
    .join(",");
}

function detectType(context: string) {
  const text = context.toLowerCase();
  if (/\bfix\b|\bbug\b|\bbugfix\b/.test(text)) return "fix";
  if (/\bfeature\b|\badd\b|\bnew\b/.test(text)) return "feat";
  if (/\brefactor\b|\brestructure\b/.test(text)) return "refactor";
  if (/\bhotfix\b|\burgent\b|\bcritical\b/.test(text)) return "hotfix";
  if (/\bdocs?\b|\bdocumentation\b/.test(text)) return "docs";
  if (/\btest\b|\btests\b|\btesting\b/.test(text)) return "test";
  if (/\bperf\b|\bperformance\b|\boptimi[sz]e\b/.test(text)) return "perf";
  if (/\bchore\b|\bmaintenance\b|\bdependency\b|\bbump\b|\bupgrade\b/.test(text)) return "chore";
  return "feat";
}

function coerceBranchName(branch: string, forcedType: string, ticket?: string) {
  const compact = branch.includes("/")
    ? branch
    : `${forcedType}/${ticket ? `${ticket.toLowerCase()}-` : ""}${slugify(branch)}`;
  const [, ...rest] = compact.split("/");
  const body = slugify(rest.join("/"));
  return `${forcedType}/${body}`;
}

function parseVariants(rawText: string, forcedType: string, ticket?: string, excludedLabels: string[] = []): CommitVariant[] {
  const variantBlocks = rawText.split(/Variant \d+:/i).filter((item) => item.trim());
  const results: CommitVariant[] = [];

  for (const block of variantBlocks) {
    const commit = block.match(/Commit:\s*(.+)/i)?.[1]?.trim() || "";
    const branch = block.match(/Branch:\s*(.+)/i)?.[1]?.trim() || "";
    const labels = block.match(/Labels:\s*(.+)/i)?.[1]?.trim() || "";
    if (!commit || !branch) continue;
    results.push({
      commit,
      branch: coerceBranchName(branch, forcedType, ticket),
      labels: filterExcludedLabels(labels, excludedLabels),
    });
  }

  return results.slice(0, 4);
}

function buildPrompt(params: {
  diff: string;
  ticket?: string;
  developerMessage?: string;
  jiraContext?: string;
  excludedLabels: string[];
}) {
  const trimmedDeveloperMessage = String(params.developerMessage || "").trim();
  const exclusiveDeveloperContext = trimmedDeveloperMessage.length > 0;
  const forcedType = detectType(trimmedDeveloperMessage || params.jiraContext || "feature");
  const promptJiraContext = exclusiveDeveloperContext ? "none" : params.jiraContext || "none";
  const promptDiff = exclusiveDeveloperContext ? "none" : params.diff.slice(0, 12000);

  return {
    forcedType,
    userPrompt: `
Generate 4 variants for a git workflow.

Each variant must include:
- Commit: ${params.ticket ? `[${params.ticket}] ` : ""}${forcedType}(scope): concise description
- Branch: ${forcedType}/${params.ticket ? `${params.ticket.toLowerCase()}-` : ""}kebab-case-description
- Labels: 1-2 comma-separated values from bug, documentation, enhancement, duplicate, help wanted, good first issue, question, wontfix

Rules:
- Reuse the most important nouns from the provided context.
${exclusiveDeveloperContext
  ? `- Developer message is the ONLY intent source for this run.
- Ignore JIRA ticket details except for preserving the ticket key in the output format.
- Ignore staged diff details for naming and wording.
- If the developer message is short, expand only with neutral wording and do not invent unrelated scope.`
  : `- Prioritize JIRA context first, then developer message, then the diff.
- Keep branch descriptions short and explicit.
- Never use labels excluded by the user.`}
- Output exactly:
Variant 1:
Commit: ...
Branch: ...
Labels: ...

Variant 2:
Commit: ...
Branch: ...
Labels: ...

Variant 3:
Commit: ...
Branch: ...
Labels: ...

Variant 4:
Commit: ...
Branch: ...
Labels: ...

Ticket: ${params.ticket || "none"}
Excluded labels: ${params.excludedLabels.join(", ") || "none"}

JIRA Context:
${promptJiraContext}

Developer Message:
${trimmedDeveloperMessage || "none"}

Staged Diff:
${promptDiff}
`.trim(),
    systemPrompt: [loadTextFile("BRANCH_NAMING_GUIDE.md"), loadTextFile("COMMIT_MESSAGE_GUIDE.md")]
      .filter(Boolean)
      .join("\n\n"),
  };
}

export async function previewCommitWorkflow(input: {
  repoName: string;
  ticket?: string;
  developerMessage?: string;
  labels?: string;
  excludedLabels?: string[];
}) {
  const repoPath = resolveRepoPath(input.repoName);
  const diff = await getStagedDiff(repoPath);
  if (!diff) {
    throw new Error("No staged changes found. Stage files before generating commit variants.");
  }

  const jiraContext = input.ticket && !String(input.developerMessage || "").trim()
    ? await fetchJiraTicketContext(input.ticket)
    : "";
  const runtime = getAiRuntime();
  const prompt = buildPrompt({
    diff,
    developerMessage: input.developerMessage,
    excludedLabels: input.excludedLabels || [],
    jiraContext,
    ticket: input.ticket,
  });
  const rawText = await generateText({
    ...runtime,
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    temperature: 0.2,
  });

  const variants = parseVariants(rawText, prompt.forcedType, input.ticket, input.excludedLabels || []);
  if (variants.length === 0) {
    throw new Error("The model response could not be parsed into commit variants.");
  }

  return {
    currentBranch: await getCurrentBranch(repoPath),
    jiraContext,
    variants,
    suggestedLabels: filterExcludedLabels(input.labels || variants[0]?.labels || "", input.excludedLabels || []),
  };
}

export async function executeCommitWorkflow(input: {
  repoName: string;
  branch: string;
  commit: string;
  labels?: string;
  baseBranch?: string;
}) {
  const repoPath = resolveRepoPath(input.repoName);
  const selectedBranch = input.branch.trim();
  const selectedCommit = input.commit.trim();
  const selectedLabels = normalizeLabels(input.labels || "");
  const baseBranch = input.baseBranch || "develop";

  if (!selectedBranch || !selectedCommit) {
    throw new Error("Branch and commit message are required.");
  }

  await renameCurrentBranch(repoPath, selectedBranch);
  await createCommit(repoPath, selectedCommit);
  await pushBranch(repoPath, selectedBranch);
  await fetchOrigin(repoPath, baseBranch);

  const commitLog = await getCommitLog(repoPath, `origin/${baseBranch}..${selectedBranch}`);
  const prBody = buildPrBodyFromCommitLog(commitLog);
  const prResult = await createPullRequest({
    repoPath,
    assignee: "brahimbousnguar",
    base: baseBranch,
    body: prBody,
    head: selectedBranch,
    labels: selectedLabels,
    title: selectedCommit,
  });

  const remoteUrl = await getRemoteUrl(repoPath);
  return {
    branch: selectedBranch,
    commit: selectedCommit,
    labels: selectedLabels,
    pr: prResult,
    compareUrl: remoteUrlToCompareUrl(remoteUrl, baseBranch, selectedBranch),
  };
}
