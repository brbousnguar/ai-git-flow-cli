"use client";

import { FormEvent, useEffect, useState } from "react";

type FeatureKey = "commit" | "release" | "jira";

type CommitVariant = {
  branch: string;
  commit: string;
  labels: string;
};

type CommitPreviewResponse = {
  currentBranch: string;
  jiraContext: string;
  suggestedLabels: string;
  variants: CommitVariant[];
};

type ReleasePreviewResponse = {
  baseBranch: string;
  headBranch: string;
  compareUrl: string;
  version: string;
  prTitle: string;
  releaseNotes: string;
  labels: string;
};

type DeployPreviewResponse = {
  latestTag: string;
  reporterName: string;
  message: string;
};

type CommentPreview = {
  id: string;
  author: string;
  preview: string;
};

type RepoStatus = {
  repoName: string;
  repoPath: string;
  currentBranch: string;
  hasStagedChanges: boolean;
  stagedFiles: string[];
  modifiedFiles: string[];
  untrackedFiles: string[];
  statusLines: string[];
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data as T;
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data as T;
}

const featureMeta: Record<FeatureKey, { title: string; subtitle: string }> = {
  commit: {
    title: "Commit + PR",
    subtitle: "Requires a repo with staged changes before preview generation.",
  },
  release: {
    title: "Release PR",
    subtitle: "Works against the selected repo to compare develop and main.",
  },
  jira: {
    title: "JIRA Deploy Reply",
    subtitle: "Uses the selected repo to resolve the latest git tag before posting.",
  },
};

export default function HomePage() {
  const [status, setStatus] = useState("Idle. Select a feature and repository.");
  const [busy, setBusy] = useState("");

  const [feature, setFeature] = useState<FeatureKey>("commit");
  const [repos, setRepos] = useState<string[]>([]);
  const [reposBaseDir, setReposBaseDir] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");
  const [repoStatus, setRepoStatus] = useState<RepoStatus | null>(null);

  const [ticket, setTicket] = useState("");
  const [developerMessage, setDeveloperMessage] = useState("");
  const [labels, setLabels] = useState("");
  const [excludedLabels, setExcludedLabels] = useState("");
  const [commitPreview, setCommitPreview] = useState<CommitPreviewResponse | null>(null);
  const [selectedVariant, setSelectedVariant] = useState(0);

  const [releaseVersion, setReleaseVersion] = useState("");
  const [releasePreview, setReleasePreview] = useState<ReleasePreviewResponse | null>(null);

  const [deployTicket, setDeployTicket] = useState("");
  const [deployReporter, setDeployReporter] = useState("");
  const [deployVariant, setDeployVariant] = useState(1);
  const [deployPreview, setDeployPreview] = useState<DeployPreviewResponse | null>(null);
  const [jiraComments, setJiraComments] = useState<CommentPreview[]>([]);

  useEffect(() => {
    async function loadRepos() {
      setBusy("repos");
      try {
        const data = await getJson<{ baseDir: string; repos: string[] }>("/api/repos");
        setRepos(data.repos);
        setReposBaseDir(data.baseDir);
        if (data.repos.length > 0) {
          setSelectedRepo((current) => (current && data.repos.includes(current) ? current : data.repos[0]));
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load repositories.");
      } finally {
        setBusy("");
      }
    }

    loadRepos();
  }, []);

  useEffect(() => {
    if (!selectedRepo) {
      setRepoStatus(null);
      return;
    }

    async function loadRepoStatus() {
      setBusy("repo-status");
      setStatus(`Loading repository status for ${selectedRepo}...`);
      try {
        const data = await postJson<RepoStatus>("/api/repos", { repoName: selectedRepo });
        setRepoStatus(data);
        setCommitPreview(null);
        setReleasePreview(null);
        setDeployPreview(null);
        setJiraComments([]);
        setSelectedVariant(0);
        setStatus(`Repository ${selectedRepo} is ready for inspection.`);
      } catch (error) {
        setRepoStatus(null);
        setStatus(error instanceof Error ? error.message : "Failed to load repository status.");
      } finally {
        setBusy("");
      }
    }

    loadRepoStatus();
  }, [selectedRepo]);

  async function handleCommitPreview(event: FormEvent) {
    event.preventDefault();
    if (!selectedRepo) return;

    setBusy("commit-preview");
    setStatus(`Generating commit variants for ${selectedRepo}...`);

    try {
      const data = await postJson<CommitPreviewResponse>("/api/commit", {
        mode: "preview",
        developerMessage,
        excludedLabels: excludedLabels
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        labels,
        repoName: selectedRepo,
        ticket,
      });
      setCommitPreview(data);
      setSelectedVariant(0);
      setStatus("Commit workflow preview ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Commit preview failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleCommitExecute() {
    if (!commitPreview?.variants[selectedVariant] || !selectedRepo) return;

    setBusy("commit-execute");
    setStatus(`Running commit workflow for ${selectedRepo}...`);

    try {
      const variant = commitPreview.variants[selectedVariant];
      const result = await postJson<{
        branch: string;
        commit: string;
        compareUrl: string;
        pr: { ok: boolean; output: string };
      }>("/api/commit", {
        mode: "execute",
        branch: variant.branch,
        commit: variant.commit,
        labels: labels || variant.labels,
        repoName: selectedRepo,
      });

      const prInfo = result.pr.ok ? result.pr.output : `${result.pr.output}\n${result.compareUrl}`.trim();
      setStatus(`Commit workflow completed for ${selectedRepo}.\n${prInfo}`);
      const refreshed = await postJson<RepoStatus>("/api/repos", { repoName: selectedRepo });
      setRepoStatus(refreshed);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Commit workflow failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleReleasePreview(event: FormEvent) {
    event.preventDefault();
    if (!selectedRepo) return;

    setBusy("release-preview");
    setStatus(`Generating release PR preview for ${selectedRepo}...`);

    try {
      const data = await postJson<ReleasePreviewResponse>("/api/release", {
        mode: "preview",
        repoName: selectedRepo,
        version: releaseVersion,
      });
      setReleasePreview(data);
      setStatus("Release preview ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Release preview failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleReleaseCreate() {
    if (!releasePreview || !selectedRepo) return;

    setBusy("release-create");
    setStatus(`Creating release PR for ${selectedRepo}...`);

    try {
      const result = await postJson<{ ok: boolean; output: string; compareUrl: string }>("/api/release", {
        mode: "create",
        baseBranch: releasePreview.baseBranch,
        body: releasePreview.releaseNotes,
        headBranch: releasePreview.headBranch,
        labels: releasePreview.labels,
        repoName: selectedRepo,
        title: releasePreview.prTitle,
      });

      setStatus(result.ok ? result.output : `${result.output}\n${result.compareUrl}`.trim());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Release PR creation failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleDeployPreview(event: FormEvent) {
    event.preventDefault();
    if (!selectedRepo) return;

    setBusy("deploy-preview");
    setStatus(`Generating deployment reply for ${selectedRepo}...`);

    try {
      const data = await postJson<DeployPreviewResponse>("/api/jira-deploy", {
        mode: "preview",
        repoName: selectedRepo,
        reporterName: deployReporter,
        ticketKey: deployTicket,
        variant: deployVariant,
      });
      setDeployPreview(data);
      setStatus("Deployment reply preview ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "JIRA deploy preview failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleDeployPublish() {
    if (!deployPreview) return;

    setBusy("deploy-publish");
    setStatus(`Publishing deployment reply to ${deployTicket}...`);

    try {
      await postJson("/api/jira-deploy", {
        mode: "publish",
        message: deployPreview.message,
        tag: deployPreview.latestTag,
        ticketKey: deployTicket,
      });
      setStatus(`JIRA comment posted to ${deployTicket}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "JIRA publish failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleLoadComments() {
    setBusy("deploy-comments");
    setStatus(`Loading recent comments for ${deployTicket}...`);

    try {
      const result = await postJson<{ comments: CommentPreview[] }>("/api/jira-deploy", {
        mode: "list-comments",
        ticketKey: deployTicket,
      });
      setJiraComments(result.comments);
      setStatus("Recent JIRA comments loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Loading comments failed.");
    } finally {
      setBusy("");
    }
  }

  async function handleDeleteComment(commentId: string) {
    setBusy(`delete-${commentId}`);
    setStatus(`Deleting JIRA comment ${commentId}...`);

    try {
      await postJson("/api/jira-deploy", {
        mode: "delete-comment",
        commentId,
        ticketKey: deployTicket,
      });
      setJiraComments((current) => current.filter((item) => item.id !== commentId));
      setStatus(`Deleted JIRA comment ${commentId}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Comment deletion failed.");
    } finally {
      setBusy("");
    }
  }

  const selectedCommitVariant = commitPreview?.variants[selectedVariant];
  const changedFileCount =
    (repoStatus?.stagedFiles.length || 0) +
    (repoStatus?.modifiedFiles.length || 0) +
    (repoStatus?.untrackedFiles.length || 0);

  return (
    <main className="shell">
      <section className="hero hero-compact">
        <div>
          <p className="eyebrow">Repository Console</p>
          <h1>GPT Git Tools</h1>
          <p className="intro">
            Pick one feature, choose a repository under your Roche Bobois workspace, then verify the changed files
            before running the workflow.
          </p>
        </div>
        <pre className="status">{status}</pre>
      </section>

      <section className="panel selector-panel">
        <div className="selector-grid">
          <label>
            Feature
            <select value={feature} onChange={(event) => setFeature(event.target.value as FeatureKey)}>
              <option value="commit">Commit + PR</option>
              <option value="release">Release PR</option>
              <option value="jira">JIRA Deploy Reply</option>
            </select>
          </label>
          <label>
            Repository
            <select value={selectedRepo} onChange={(event) => setSelectedRepo(event.target.value)} disabled={busy === "repos"}>
              {repos.length === 0 ? <option value="">No repository found</option> : null}
              {repos.map((repo) => (
                <option key={repo} value={repo}>
                  {repo}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="info-strip">
          <span>Feature: {featureMeta[feature].title}</span>
          <span>Base dir: {reposBaseDir || "Loading..."}</span>
          {repoStatus ? <span>Branch: {repoStatus.currentBranch || "(detached)"}</span> : null}
        </div>
        <p className="helper">{featureMeta[feature].subtitle}</p>
      </section>

      <section className="grid feature-grid">
        <article className="panel readiness-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Repository Check</p>
              <h2>{selectedRepo || "Select a repository"}</h2>
            </div>
            <span className="tag">{changedFileCount} changed files</span>
          </div>

          {repoStatus ? (
            <div className="stack">
              <div className="info-strip">
                <span>{repoStatus.hasStagedChanges ? "Commit-ready" : "No staged diff"}</span>
                <span>{repoStatus.stagedFiles.length} staged</span>
                <span>{repoStatus.modifiedFiles.length} modified</span>
                <span>{repoStatus.untrackedFiles.length} untracked</span>
              </div>
              <label>
                Repository path
                <input value={repoStatus.repoPath} readOnly />
              </label>
              <div className="file-columns">
                <div className="file-card">
                  <strong>Staged files</strong>
                  <ul>
                    {repoStatus.stagedFiles.length > 0 ? repoStatus.stagedFiles.map((file) => <li key={file}>{file}</li>) : <li>None</li>}
                  </ul>
                </div>
                <div className="file-card">
                  <strong>Modified files</strong>
                  <ul>
                    {repoStatus.modifiedFiles.length > 0 ? repoStatus.modifiedFiles.map((file) => <li key={file}>{file}</li>) : <li>None</li>}
                  </ul>
                </div>
                <div className="file-card">
                  <strong>Untracked files</strong>
                  <ul>
                    {repoStatus.untrackedFiles.length > 0 ? repoStatus.untrackedFiles.map((file) => <li key={file}>{file}</li>) : <li>None</li>}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <p className="helper">Select a repository to inspect its current git state.</p>
          )}
        </article>

        <article className="panel feature-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Selected Feature</p>
              <h2>{featureMeta[feature].title}</h2>
            </div>
            <span className="tag">{selectedRepo || "repo required"}</span>
          </div>

          {feature === "commit" ? (
            <>
              <form onSubmit={handleCommitPreview} className="stack">
                <label>
                  Ticket
                  <input value={ticket} onChange={(event) => setTicket(event.target.value)} placeholder="SFSC-1638" />
                </label>
                <label>
                  Developer context
                  <textarea
                    rows={4}
                    value={developerMessage}
                    onChange={(event) => setDeveloperMessage(event.target.value)}
                    placeholder="bugfix, resolve timeout in payment processing"
                  />
                </label>
                <label>
                  Preferred labels
                  <input value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="bug,enhancement" />
                </label>
                <label>
                  Excluded labels
                  <input value={excludedLabels} onChange={(event) => setExcludedLabels(event.target.value)} placeholder="documentation" />
                </label>
                <button type="submit" disabled={busy !== "" || !repoStatus?.hasStagedChanges}>
                  {busy === "commit-preview" ? "Generating..." : "Preview commit workflow"}
                </button>
              </form>

              {commitPreview ? (
                <div className="stack">
                  <div className="info-strip">
                    <span>Current branch: {commitPreview.currentBranch || "(detached)"}</span>
                  </div>
                  {commitPreview.jiraContext ? <pre className="context-box">{commitPreview.jiraContext}</pre> : null}
                  <div className="variant-list">
                    {commitPreview.variants.map((variant, index) => (
                      <button
                        key={`${variant.branch}-${index}`}
                        type="button"
                        className={`variant ${selectedVariant === index ? "active" : ""}`}
                        onClick={() => setSelectedVariant(index)}
                      >
                        <strong>{variant.commit}</strong>
                        <span>{variant.branch}</span>
                        <em>{variant.labels || "no labels"}</em>
                      </button>
                    ))}
                  </div>
                  <button type="button" disabled={busy !== "" || !selectedCommitVariant} onClick={handleCommitExecute}>
                    {busy === "commit-execute" ? "Executing..." : "Run selected workflow"}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {feature === "release" ? (
            <>
              <form onSubmit={handleReleasePreview} className="stack">
                <label>
                  Version override
                  <input value={releaseVersion} onChange={(event) => setReleaseVersion(event.target.value)} placeholder="1.2.4" />
                </label>
                <button type="submit" disabled={busy !== "" || !selectedRepo}>
                  {busy === "release-preview" ? "Generating..." : "Preview release PR"}
                </button>
              </form>

              {releasePreview ? (
                <div className="stack">
                  <div className="info-strip">
                    <span>
                      {releasePreview.headBranch} to {releasePreview.baseBranch}
                    </span>
                    <span>{releasePreview.version ? `v${releasePreview.version}` : "auto title"}</span>
                  </div>
                  <label>
                    PR title
                    <input
                      value={releasePreview.prTitle}
                      onChange={(event) =>
                        setReleasePreview((current) => (current ? { ...current, prTitle: event.target.value } : current))
                      }
                    />
                  </label>
                  <label>
                    Release notes
                    <textarea
                      rows={10}
                      value={releasePreview.releaseNotes}
                      onChange={(event) =>
                        setReleasePreview((current) =>
                          current ? { ...current, releaseNotes: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                  <label>
                    Labels
                    <input
                      value={releasePreview.labels}
                      onChange={(event) =>
                        setReleasePreview((current) => (current ? { ...current, labels: event.target.value } : current))
                      }
                    />
                  </label>
                  {releasePreview.compareUrl ? (
                    <a href={releasePreview.compareUrl} target="_blank" rel="noreferrer" className="link">
                      Open compare URL
                    </a>
                  ) : null}
                  <button type="button" disabled={busy !== ""} onClick={handleReleaseCreate}>
                    {busy === "release-create" ? "Creating..." : "Create release PR"}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {feature === "jira" ? (
            <>
              <form onSubmit={handleDeployPreview} className="stack">
                <label>
                  Ticket
                  <input value={deployTicket} onChange={(event) => setDeployTicket(event.target.value)} placeholder="SFSC-1638" />
                </label>
                <label>
                  Reporter
                  <input value={deployReporter} onChange={(event) => setDeployReporter(event.target.value)} placeholder="auto from JIRA" />
                </label>
                <label>
                  Variant
                  <input
                    type="number"
                    min={1}
                    max={9}
                    value={deployVariant}
                    onChange={(event) => setDeployVariant(Number(event.target.value || 1))}
                  />
                </label>
                <button type="submit" disabled={busy !== "" || !selectedRepo}>
                  {busy === "deploy-preview" ? "Generating..." : "Preview deploy reply"}
                </button>
              </form>

              {deployPreview ? (
                <div className="stack">
                  <div className="info-strip">
                    <span>Reporter: {deployPreview.reporterName}</span>
                    <span>Tag: {deployPreview.latestTag}</span>
                  </div>
                  <textarea
                    rows={8}
                    value={deployPreview.message}
                    onChange={(event) =>
                      setDeployPreview((current) => (current ? { ...current, message: event.target.value } : current))
                    }
                  />
                  <div className="button-row">
                    <button type="button" disabled={busy !== ""} onClick={handleDeployPublish}>
                      {busy === "deploy-publish" ? "Publishing..." : "Publish to JIRA"}
                    </button>
                    <button type="button" disabled={busy !== "" || !deployTicket} onClick={handleLoadComments}>
                      {busy === "deploy-comments" ? "Loading..." : "Load recent comments"}
                    </button>
                  </div>
                </div>
              ) : null}

              {jiraComments.length > 0 ? (
                <div className="comment-list">
                  {jiraComments.map((comment) => (
                    <div key={comment.id} className="comment-card">
                      <strong>{comment.author}</strong>
                      <span>{comment.preview}</span>
                      <button type="button" disabled={busy !== ""} onClick={() => handleDeleteComment(comment.id)}>
                        {busy === `delete-${comment.id}` ? "Deleting..." : `Delete ${comment.id}`}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </article>
      </section>
    </main>
  );
}
