import {
  createPullRequest,
  fetchOrigin,
  getAllTags,
  getCommitLog,
  getDiff,
  getRemoteUrl,
  remoteUrlToCompareUrl,
  verifyRef,
} from "@/lib/server/git";
import { resolveRepoPath } from "@/lib/server/config";
import { fetchJiraTicketContext, hasJiraCredentials } from "@/lib/server/jira";
import { generateText, getAiRuntime } from "@/lib/server/openai";

function extractJiraKeys(commitLog: string) {
  return [...new Set((commitLog.match(/\b[A-Z][A-Z0-9]+-\d+\b/g) || []).map((key) => key.trim()))];
}

async function resolveReleaseBranches(repoPath: string) {
  const baseCandidates = ["origin/main", "origin/master", "main", "master"];
  const headCandidates = ["origin/develop", "origin/dev", "develop", "dev"];

  const base = (await Promise.all(baseCandidates.map(async (ref) => ({ ref, ok: await verifyRef(repoPath, ref) })))).find((item) => item.ok)?.ref;
  const head = (await Promise.all(headCandidates.map(async (ref) => ({ ref, ok: await verifyRef(repoPath, ref) })))).find((item) => item.ok)?.ref;

  if (!base || !head) {
    throw new Error("Could not resolve release branches. Expected main/master and develop/dev.");
  }

  return {
    baseRemote: base.startsWith("origin/") ? base : `origin/${base}`,
    headRemote: head.startsWith("origin/") ? head : `origin/${head}`,
    baseBranch: base.replace(/^origin\//, ""),
    headBranch: head.replace(/^origin\//, ""),
  };
}

function nextVersionFromTag(tag?: string) {
  if (!tag) return "";
  const match = tag.match(/v?(\d+)\.(\d+)\.(\d+)/i);
  if (!match) return "";
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function extractReleaseNotes(output: string) {
  const title = output.match(/\*\*PR Title:\*\*\s*(.+)/i)?.[1]?.trim() || "";
  const notes = output.match(/\*\*Release Notes:\*\*([\s\S]*?)(?:\n\*\*Labels:\*\*|$)/i)?.[1]?.trim() || "";
  const labels = output.match(/\*\*Labels:\*\*\s*(.+)/i)?.[1]?.trim() || "";
  return { title, notes, labels };
}

export async function previewRelease(repoName: string, version?: string) {
  const repoPath = resolveRepoPath(repoName);
  await fetchOrigin(repoPath);
  const { baseBranch, baseRemote, headBranch, headRemote } = await resolveReleaseBranches(repoPath);
  const diff = await getDiff(repoPath, `${baseRemote}...${headRemote}`);
  const commitLog = await getCommitLog(repoPath, `${baseRemote}..${headRemote}`);

  if (!diff && !commitLog) {
    throw new Error(`No changes found between ${headBranch} and ${baseBranch}.`);
  }

  const tags = await getAllTags(repoPath);
  const resolvedVersion = version || nextVersionFromTag(tags[0]);
  const jiraKeys = extractJiraKeys(commitLog);
  const jiraContext = hasJiraCredentials()
    ? (await Promise.all(jiraKeys.slice(0, 8).map((key) => fetchJiraTicketContext(key)))).filter(Boolean).join("\n\n")
    : "";

  const runtime = getAiRuntime();
  const output = await generateText({
    ...runtime,
    temperature: 0.4,
    userPrompt: `
Generate release PR content for merging ${headBranch} into ${baseBranch}.

Output exactly:
**PR Title:** Release ${resolvedVersion ? `v${resolvedVersion}` : ""}
**Release Notes:**
- [TICKET] concise user-facing summary

**Labels:** enhancement,bug

Rules:
- Group by JIRA ticket when possible.
- Keep language user-facing and concise.
- No filenames or code snippets.
- Labels must be 1-2 values chosen from bug, documentation, enhancement.

Commit log:
${commitLog}

JIRA context:
${jiraContext || "none"}

Diff excerpt:
${diff.slice(0, 12000)}
`.trim(),
  });

  const parsed = extractReleaseNotes(output);
  return {
    baseBranch,
    headBranch,
    compareUrl: remoteUrlToCompareUrl(await getRemoteUrl(repoPath), baseBranch, headBranch),
    version: resolvedVersion,
    prTitle: parsed.title || (resolvedVersion ? `Release v${resolvedVersion}` : "Release"),
    releaseNotes: parsed.notes || output.trim(),
    labels: parsed.labels,
  };
}

export async function createReleasePr(input: {
  repoName: string;
  baseBranch: string;
  headBranch: string;
  title: string;
  body: string;
  labels?: string;
}) {
  const repoPath = resolveRepoPath(input.repoName);
  const result = await createPullRequest({
    repoPath,
    assignee: "brahimbousnguar",
    base: input.baseBranch,
    body: input.body,
    head: input.headBranch,
    labels: input.labels,
    title: input.title,
  });

  return {
    ...result,
    compareUrl: remoteUrlToCompareUrl(await getRemoteUrl(repoPath), input.baseBranch, input.headBranch),
  };
}
