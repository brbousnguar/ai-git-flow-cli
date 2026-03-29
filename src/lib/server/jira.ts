import { loadAppConfig } from "@/lib/server/config";
import { adfToPlainText, normalizeJiraBaseUrl, normalizeMultilineText } from "@/lib/server/utils";

function getJiraCredentials() {
  const config = loadAppConfig();
  const baseUrl = normalizeJiraBaseUrl(process.env.JIRA_BASE_URL || config.jira?.baseUrl);
  const email = process.env.JIRA_EMAIL || config.jira?.email || "";
  const apiToken = process.env.JIRA_API_TOKEN || config.jira?.apiToken || "";

  return { baseUrl, email, apiToken };
}

function getAuthHeader(email: string, apiToken: string) {
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
}

export function hasJiraCredentials() {
  const { baseUrl, email, apiToken } = getJiraCredentials();
  return Boolean(baseUrl && email && apiToken);
}

export async function jiraRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { baseUrl, email, apiToken } = getJiraCredentials();
  if (!baseUrl || !email || !apiToken) {
    throw new Error("JIRA credentials are missing. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN.");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: getAuthHeader(email, apiToken),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`JIRA request failed (${response.status}): ${text.slice(0, 300)}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export async function fetchJiraTicketContext(ticketKey: string) {
  if (!hasJiraCredentials()) return "";

  const issue = await jiraRequest<{
    fields?: {
      summary?: string;
      description?: unknown;
      status?: { name?: string };
      issuetype?: { name?: string };
      labels?: string[];
      comment?: { comments?: Array<{ author?: { displayName?: string }; body?: unknown }> };
    };
  }>(`/rest/api/3/issue/${encodeURIComponent(ticketKey)}?fields=summary,description,status,issuetype,labels,comment`);

  const worklogs = await jiraRequest<{
    worklogs?: Array<{ author?: { displayName?: string }; comment?: unknown }>;
  }>(`/rest/api/3/issue/${encodeURIComponent(ticketKey)}/worklog?maxResults=5`);

  const fields = issue.fields || {};
  const recentComments = (fields.comment?.comments || [])
    .slice(-3)
    .map((comment) => {
      const author = comment.author?.displayName || "Unknown";
      const text = normalizeMultilineText(adfToPlainText(comment.body), 500);
      return text ? `- ${author}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");

  const recentWorklogs = (worklogs.worklogs || [])
    .slice(-3)
    .map((worklog) => {
      const author = worklog.author?.displayName || "Unknown";
      const text = normalizeMultilineText(adfToPlainText(worklog.comment), 300) || "No comment";
      return `- ${author}: ${text}`;
    })
    .join("\n");

  return [
    `Ticket: ${ticketKey}`,
    fields.issuetype?.name ? `Type: ${fields.issuetype.name}` : "",
    fields.status?.name ? `Status: ${fields.status.name}` : "",
    fields.summary ? `Summary: ${normalizeMultilineText(fields.summary, 300)}` : "",
    fields.labels?.length ? `Labels: ${fields.labels.join(", ")}` : "",
    fields.description ? `Requirements/Description:\n${normalizeMultilineText(adfToPlainText(fields.description), 1400)}` : "",
    recentComments ? `Recent Comments:\n${recentComments}` : "",
    recentWorklogs ? `Recent Worklogs:\n${recentWorklogs}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function fetchJiraReporter(ticketKey: string) {
  const issue = await jiraRequest<{ fields?: { reporter?: { displayName?: string } } }>(
    `/rest/api/3/issue/${encodeURIComponent(ticketKey)}?fields=reporter`,
  );
  return issue.fields?.reporter?.displayName || "";
}

export async function listJiraComments(ticketKey: string) {
  const payload = await jiraRequest<{
    comments?: Array<{ id?: string; author?: { displayName?: string }; body?: unknown }>;
  }>(`/rest/api/3/issue/${encodeURIComponent(ticketKey)}/comment?maxResults=50`);

  return (payload.comments || []).map((comment) => ({
    id: comment.id || "",
    author: comment.author?.displayName || "Unknown",
    preview: normalizeMultilineText(adfToPlainText(comment.body), 180),
  }));
}

export async function deleteJiraComment(ticketKey: string, commentId: string) {
  await jiraRequest(`/rest/api/3/issue/${encodeURIComponent(ticketKey)}/comment/${encodeURIComponent(commentId)}`, {
    method: "DELETE",
  });
}

export async function findMulesoftVersionFieldId() {
  const fields = await jiraRequest<Array<{ id?: string; name?: string }>>("/rest/api/3/field");
  const normalized = fields.map((field) => ({
    id: field.id || "",
    name: String(field.name || "").toLowerCase().trim(),
  }));

  return (
    normalized.find((field) => field.name === "mulesoft version")?.id ||
    normalized.find((field) => field.name.includes("mulesoft") && field.name.includes("version"))?.id ||
    ""
  );
}

export async function updateJiraField(ticketKey: string, fieldId: string, value: string) {
  await jiraRequest(`/rest/api/3/issue/${encodeURIComponent(ticketKey)}`, {
    method: "PUT",
    body: JSON.stringify({ fields: { [fieldId]: value } }),
  });
}

export async function postJiraComment(ticketKey: string, text: string) {
  await jiraRequest(`/rest/api/3/issue/${encodeURIComponent(ticketKey)}/comment`, {
    method: "POST",
    body: JSON.stringify({
      body: {
        type: "doc",
        version: 1,
        content: String(text || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .map((line) => ({
            type: "paragraph",
            content: line ? [{ type: "text", text: line }] : [],
          })),
      },
    }),
  });
}
