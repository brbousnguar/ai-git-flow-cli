import { resolveRepoPath } from "@/lib/server/config";
import { getAllTags } from "@/lib/server/git";
import {
  deleteJiraComment,
  fetchJiraReporter,
  findMulesoftVersionFieldId,
  listJiraComments,
  postJiraComment,
  updateJiraField,
} from "@/lib/server/jira";

const deployedEnv = "preprod";

function firstName(fullName: string) {
  return String(fullName || "").trim().split(/\s+/)[0] || "";
}

export function buildDeployMessage(reporterName: string, tag: string, variantNumber = 1) {
  const name = firstName(reporterName) || "team";
  const variants = [
    [`Bonjour ${name},`, `Le changement est deploye en ${deployedEnv} avec le tag ${tag}.`, "Peux-tu verifier et tester de ton cote ?", "Merci."],
    [`Hello ${name},`, `Le changement est bien deploye en ${deployedEnv} (tag ${tag}).`, "Peux-tu faire un test de ton cote et me confirmer que tout est OK ?", "Merci."],
    [`Bonjour ${name},`, `C'est deploie en ${deployedEnv} avec la version ${tag}.`, "Tu peux tester quand tu as 2 min et me faire un retour ?", "Merci."],
  ];

  return variants[(variantNumber - 1) % variants.length].join("\n");
}

export async function previewDeployMessage(input: { repoName: string; ticketKey: string; reporterName?: string; variant?: number }) {
  const repoPath = resolveRepoPath(input.repoName);
  const tags = await getAllTags(repoPath);
  const latestTag = tags[0];
  if (!latestTag) {
    throw new Error("No git tag found for deployment message generation.");
  }

  const jiraReporter = !input.reporterName ? await fetchJiraReporter(input.ticketKey) : "";
  const reporterName = input.reporterName || jiraReporter || "team";

  return {
    latestTag,
    reporterName,
    message: buildDeployMessage(reporterName, latestTag, input.variant || 1),
  };
}

export async function publishDeployMessage(ticketKey: string, message: string, tag: string) {
  const fieldId = await findMulesoftVersionFieldId();
  if (fieldId) {
    await updateJiraField(ticketKey, fieldId, tag);
  }
  await postJiraComment(ticketKey, message);
}

export async function getDeployComments(ticketKey: string) {
  return listJiraComments(ticketKey);
}

export async function removeDeployComment(ticketKey: string, commentId: string) {
  await deleteJiraComment(ticketKey, commentId);
}
