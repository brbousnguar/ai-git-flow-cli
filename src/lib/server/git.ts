import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { GitCommandResult } from "@/lib/server/types";

const execFileAsync = promisify(execFile);

async function runGit(repoPath: string, args: string[], allowFailure = false): Promise<GitCommandResult> {
  try {
    const result = await execFileAsync("git", args, {
      cwd: repoPath,
      maxBuffer: 1024 * 1024 * 12,
      windowsHide: true,
    });

    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    };
  } catch (error) {
    if (allowFailure) {
      const failed = error as { stdout?: string; stderr?: string };
      return {
        stdout: failed.stdout || "",
        stderr: failed.stderr || "",
      };
    }
    throw error;
  }
}

async function runCommand(repoPath: string, command: string, args: string[], allowFailure = false): Promise<GitCommandResult> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: repoPath,
      maxBuffer: 1024 * 1024 * 12,
      windowsHide: true,
    });

    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    };
  } catch (error) {
    if (allowFailure) {
      const failed = error as { stdout?: string; stderr?: string };
      return {
        stdout: failed.stdout || "",
        stderr: failed.stderr || "",
      };
    }
    throw error;
  }
}

export async function getStagedDiff(repoPath: string) {
  const result = await runGit(repoPath, ["diff", "--cached"]);
  return result.stdout.trim();
}

export async function getCurrentBranch(repoPath: string) {
  const result = await runGit(repoPath, ["branch", "--show-current"]);
  return result.stdout.trim();
}

export async function renameCurrentBranch(repoPath: string, branchName: string) {
  await runGit(repoPath, ["branch", "-m", branchName]);
}

export async function createCommit(repoPath: string, message: string) {
  await runGit(repoPath, ["commit", "-m", message]);
}

export async function pushBranch(repoPath: string, branchName: string) {
  await runGit(repoPath, ["push", "-u", "origin", branchName]);
}

export async function fetchOrigin(repoPath: string, branchName?: string) {
  const args = branchName ? ["fetch", "origin", branchName] : ["fetch", "origin", "--prune"];
  await runGit(repoPath, args);
}

export async function getCommitLog(repoPath: string, range: string) {
  const result = await runGit(repoPath, ["log", range, "--oneline", "--no-merges"]);
  return result.stdout.trim();
}

export async function getDiff(repoPath: string, range: string) {
  const result = await runGit(repoPath, ["diff", range]);
  return result.stdout.trim();
}

export async function getAllTags(repoPath: string) {
  const result = await runGit(repoPath, ["tag", "--sort=-version:refname"]);
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function getRemoteUrl(repoPath: string) {
  const result = await runGit(repoPath, ["config", "--get", "remote.origin.url"]);
  return result.stdout.trim();
}

export async function verifyRef(repoPath: string, ref: string) {
  const result = await runGit(repoPath, ["rev-parse", "--verify", ref], true);
  return Boolean(result.stdout.trim());
}

export async function createPullRequest(params: {
  repoPath: string;
  base: string;
  head: string;
  title: string;
  body: string;
  labels?: string;
  assignee?: string;
}) {
  const args = ["pr", "create", "--base", params.base, "--head", params.head, "--title", params.title, "--body", params.body];
  if (params.assignee) {
    args.push("--assignee", params.assignee);
  }
  for (const label of String(params.labels || "")
    .split(",")
    .map((item) => item.trim())
      .filter(Boolean)) {
    args.push("--label", label);
  }

  const result = await runCommand(params.repoPath, "gh", args, true);
  if (!result.stderr && result.stdout.trim()) {
    return { ok: true, output: result.stdout.trim() };
  }

  const combined = `${result.stdout}\n${result.stderr}`.trim();
  if (/https:\/\/github\.com\/.+\/pull\/\d+/i.test(combined)) {
    return { ok: true, output: combined };
  }

  return { ok: false, output: combined || "GitHub CLI failed." };
}

export function buildPrBodyFromCommitLog(rawCommitLog: string) {
  const messages = String(rawCommitLog || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[a-f0-9]{7,40}\s+/i, ""))
    .filter(Boolean);

  if (messages.length === 0) {
    return "## Commits Included\n- No commit messages found";
  }

  return ["## Commits Included", ...messages.map((message) => `- ${message}`)].join("\n");
}

export function remoteUrlToCompareUrl(remoteUrl: string, base: string, head: string) {
  let repoUrl = remoteUrl.trim();
  if (repoUrl.startsWith("git@github.com:")) {
    repoUrl = repoUrl.replace("git@github.com:", "https://github.com/").replace(/\.git$/, "");
  } else {
    repoUrl = repoUrl.replace(/\.git$/, "");
  }

  if (!repoUrl.startsWith("https://github.com/")) return "";
  return `${repoUrl}/compare/${base}...${head}`;
}

export async function getRepoStatus(repoPath: string) {
  const [branch, status, stagedFiles, modifiedFiles, untrackedFiles] = await Promise.all([
    getCurrentBranch(repoPath),
    runGit(repoPath, ["status", "--short"]),
    runGit(repoPath, ["diff", "--cached", "--name-only"]),
    runGit(repoPath, ["diff", "--name-only"]),
    runGit(repoPath, ["ls-files", "--others", "--exclude-standard"]),
  ]);

  return {
    currentBranch: branch,
    hasStagedChanges: Boolean(stagedFiles.stdout.trim()),
    stagedFiles: stagedFiles.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    modifiedFiles: modifiedFiles.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    untrackedFiles: untrackedFiles.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    statusLines: status.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  };
}
