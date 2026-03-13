#!/usr/bin/env node

import { execSync } from "child_process";
import * as readline from "readline";
import { loadConfigAndEnv, setupCliConsole } from "./ai-common.js";

const { config } = loadConfigAndEnv(import.meta.url);
setupCliConsole();

const args = process.argv.slice(2);
let ticketKey = null;
let reporterNameArg = null;
let deleteMode = false;
let commentIdArg = null;
let listOnlyMode = false;
let deleteAllMode = false;
let postMode = false;
const deployedEnv = "preprod";

for (let i = 0; i < args.length; i++) {
  if ((args[i] === "-t" || args[i] === "--ticket") && args[i + 1]) {
    ticketKey = args[i + 1].trim().toUpperCase();
    i++;
  } else if ((args[i] === "-r" || args[i] === "--reporter") && args[i + 1]) {
    reporterNameArg = args[i + 1].trim();
    i++;
  } else if (args[i] === "-d" || args[i] === "--delete") {
    deleteMode = true;
  } else if ((args[i] === "-c" || args[i] === "--comment-id") && args[i + 1]) {
    commentIdArg = args[i + 1].trim();
    i++;
  } else if (args[i] === "--list-comments") {
    listOnlyMode = true;
  } else if (args[i] === "--delete-all") {
    deleteAllMode = true;
    deleteMode = true;
  } else if (args[i] === "--post") {
    postMode = true;
  }
}

function normalizeJiraBaseUrl(rawUrl) {
  if (!rawUrl) return "";
  const trimmed = String(rawUrl).trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function firstName(fullName) {
  const cleaned = String(fullName || "").trim();
  if (!cleaned) return "";
  return cleaned.split(/\s+/)[0];
}

function getLatestTag() {
  try {
    execSync("git fetch --tags --prune --prune-tags", { stdio: "ignore" });
    const allTags = execSync("git tag --sort=-version:refname", { encoding: "utf8" })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    return allTags[0] || null;
  } catch {
    return null;
  }
}

function buildMessageVariant(variantNumber, reporterFirstName, tag) {
  const variants = [
    [
      `Bonjour ${reporterFirstName},`,
      `Le changement est deploye en ${deployedEnv} avec le tag ${tag}.`,
      "Peux-tu verifier et tester de ton cote ?",
      "Merci.",
    ],
    [
      `Hello ${reporterFirstName},`,
      `Le changement est bien deploye en ${deployedEnv} (tag ${tag}).`,
      "Peux-tu faire un test de ton cote et me confirmer que tout est OK ?",
      "Merci.",
    ],
    [
      `Bonjour ${reporterFirstName},`,
      `C'est deploie en ${deployedEnv} avec la version ${tag}.`,
      "Tu peux tester quand tu as 2 min et me faire un retour ?",
      "Merci.",
    ],
  ];

  const chosen = variants[(variantNumber - 1) % variants.length];
  return chosen.join("\n");
}

function toAdfComment(markdownLikeText) {
  const lines = String(markdownLikeText || "")
    .split(/\r?\n/)
    .map((line) => line.trim());

  const content = lines.map((line) => ({
    type: "paragraph",
    content: line ? [{ type: "text", text: line }] : [],
  }));

  return {
    body: {
      type: "doc",
      version: 1,
      content,
    },
  };
}

function adfToPlainText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map((item) => adfToPlainText(item)).join("");
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  return adfToPlainText(node.content || []);
}

function commentToPreview(comment) {
  const text = adfToPlainText(comment?.body)
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 100 ? `${text.slice(0, 100)}...` : text;
}

async function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(String(answer || "").trim());
    });
  });
}

async function jiraRequest(baseUrl, authHeader, path, method = "GET", body = null) {
  if (typeof fetch !== "function") {
    throw new Error("Node fetch is unavailable in this runtime.");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`JIRA ${method} ${path} failed (${response.status}): ${text.slice(0, 500)}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function findMulesoftVersionFieldId(baseUrl, authHeader) {
  const fields = await jiraRequest(baseUrl, authHeader, "/rest/api/3/field", "GET");
  if (!Array.isArray(fields)) return null;

  const normalized = fields.map((field) => ({
    id: field?.id,
    name: String(field?.name || "").toLowerCase().trim(),
  }));

  const exact = normalized.find((field) => field.name === "mulesoft version");
  if (exact) return exact.id;

  const loose = normalized.find((field) => field.name.includes("mulesoft") && field.name.includes("version"));
  return loose ? loose.id : null;
}

async function run() {
  try {
    const jiraBaseUrl = normalizeJiraBaseUrl(process.env.JIRA_BASE_URL || config?.jira?.baseUrl);
    const jiraEmail = process.env.JIRA_EMAIL || config?.jira?.email;
    const jiraApiToken = process.env.JIRA_API_TOKEN || config?.jira?.apiToken;

    if (!jiraBaseUrl || !jiraEmail || !jiraApiToken) {
      console.error("## ERROR: Missing JIRA credentials.");
      console.error("## INFO: Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN in .env.");
      process.exit(1);
    }

    if (!ticketKey) {
      ticketKey = (await askQuestion("Ticket JIRA (ex: SFSC-1638): ")).toUpperCase();
    }
    if (!ticketKey) {
      console.error("## ERROR: Ticket JIRA is required.");
      process.exit(1);
    }

    const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString("base64")}`;
    if (deleteMode || listOnlyMode) {
      const commentsPayload = await jiraRequest(
        jiraBaseUrl,
        authHeader,
        `/rest/api/3/issue/${encodeURIComponent(ticketKey)}/comment?maxResults=50`,
        "GET"
      );
      const comments = Array.isArray(commentsPayload?.comments) ? commentsPayload.comments : [];

      if (comments.length === 0) {
        console.log(`## INFO: No comments found on ${ticketKey}.`);
        process.exit(0);
      }

      const recent = comments.slice(-15).reverse();
      console.log("\n## Recent comments");
      for (const comment of recent) {
        const id = comment?.id || "";
        const author = comment?.author?.displayName || "Unknown";
        const preview = commentToPreview(comment);
        console.log(`- id=${id} | ${author} | ${preview}`);
      }

      if (listOnlyMode && !deleteMode) {
        process.exit(0);
      }

      if (deleteAllMode) {
        console.log("\n## Interactive delete-all mode");
        console.log("## INFO: For each comment: Enter=delete, n=skip, q=stop");
        let deleted = 0;
        let skipped = 0;
        let reviewed = 0;
        const ordered = [...comments].reverse();

        for (const comment of ordered) {
          const id = comment?.id;
          if (!id) continue;

          reviewed++;
          const author = comment?.author?.displayName || "Unknown";
          const preview = commentToPreview(comment);

          console.log("\n" + "-".repeat(60));
          console.log(`Comment ${reviewed}/${ordered.length}`);
          console.log(`id=${id} | author=${author}`);
          console.log(`preview=${preview}`);
          const action = (await askQuestion("Action? (Enter=delete, n=skip, q=stop): ")).toLowerCase();

          if (action === "q") {
            console.log("## INFO: Stopped by user.");
            break;
          }
          if (action === "n") {
            skipped++;
            continue;
          }

          try {
            await jiraRequest(
              jiraBaseUrl,
              authHeader,
              `/rest/api/3/issue/${encodeURIComponent(ticketKey)}/comment/${encodeURIComponent(id)}`,
              "DELETE"
            );
            deleted++;
            console.log(`## OK: Deleted comment ${id}.`);
          } catch (error) {
            console.log(`## WARN: Failed to delete comment ${id}: ${error.message}`);
          }
        }

        console.log(`## INFO: Summary for ${ticketKey} -> reviewed=${reviewed}, deleted=${deleted}, skipped=${skipped}`);
        process.exit(0);
      }

      let targetCommentId = commentIdArg;
      if (!targetCommentId) {
        targetCommentId = await askQuestion("Comment id a supprimer: ");
      }
      if (!targetCommentId) {
        console.error("## ERROR: Comment id is required in delete mode.");
        process.exit(1);
      }

      const confirm = (await askQuestion(`Supprimer le commentaire ${targetCommentId} sur ${ticketKey} ? (yes/Enter to confirm): `)).toLowerCase();
      if (!(confirm === "" || confirm === "yes" || confirm === "y" || confirm === "oui" || confirm === "o")) {
        console.log("## WARN: Deletion cancelled.");
        process.exit(0);
      }

      await jiraRequest(
        jiraBaseUrl,
        authHeader,
        `/rest/api/3/issue/${encodeURIComponent(ticketKey)}/comment/${encodeURIComponent(targetCommentId)}`,
        "DELETE"
      );
      console.log(`## OK: Comment ${targetCommentId} deleted from ${ticketKey}.`);
      process.exit(0);
    }

    const latestTag = getLatestTag();
    if (!latestTag) {
      console.error("## ERROR: No git tag found.");
      process.exit(1);
    }

    const issue = await jiraRequest(
      jiraBaseUrl,
      authHeader,
      `/rest/api/3/issue/${encodeURIComponent(ticketKey)}?fields=reporter`,
      "GET"
    );

    const reporterFromJira = issue?.fields?.reporter?.displayName || "";
    const reporterFirstName = firstName(reporterNameArg || reporterFromJira || "team");

    let variantNumber = 1;
    let approvedMessage = "";
    while (!approvedMessage) {
      const candidate = buildMessageVariant(variantNumber, reporterFirstName, latestTag);

      console.log("\n" + "=".repeat(60));
      console.log("## Suggested Message");
      console.log("=".repeat(60));
      console.log(candidate);
      console.log("=".repeat(60));

      const answer = (await askQuestion("Publier sur JIRA ? (Enter=oui, n=regenerer, q=annuler): ")).toLowerCase();
      if (answer === "" || answer === "y" || answer === "yes" || answer === "o" || answer === "oui") {
        approvedMessage = candidate;
      } else if (answer === "n") {
        variantNumber++;
      } else if (answer === "q") {
        console.log("## WARN: Cancelled by user.");
        process.exit(0);
      }
    }

    if (!postMode) {
      console.log("\n## INFO: Preview mode only (no JIRA update, no comment posted).");
      console.log("## INFO: Use --post to publish and update 'Mulesoft Version'.");
      process.exit(0);
    }

    const mulesoftVersionFieldId = await findMulesoftVersionFieldId(jiraBaseUrl, authHeader);
    if (mulesoftVersionFieldId) {
      try {
        await jiraRequest(
          jiraBaseUrl,
          authHeader,
          `/rest/api/3/issue/${encodeURIComponent(ticketKey)}`,
          "PUT",
          { fields: { [mulesoftVersionFieldId]: latestTag } }
        );
        console.log(`## OK: Updated 'Mulesoft Version' with ${latestTag}.`);
      } catch (error) {
        console.log(`## WARN: Could not update 'Mulesoft Version' field: ${error.message}`);
      }
    } else {
      console.log("## WARN: 'Mulesoft Version' field not found, skipping field update.");
    }

    await jiraRequest(
      jiraBaseUrl,
      authHeader,
      `/rest/api/3/issue/${encodeURIComponent(ticketKey)}/comment`,
      "POST",
      toAdfComment(approvedMessage)
    );

    console.log(`## OK: Comment posted to ${ticketKey}.`);
  } catch (error) {
    console.error("## ERROR:", error.message);
    process.exit(1);
  }
}

run();
