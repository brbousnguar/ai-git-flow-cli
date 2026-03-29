import dotenv from "dotenv";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { AppConfig, Provider } from "@/lib/server/types";

const appRoot = process.cwd();
const defaultReposBaseDir = "D:\\Projects\\RocheBB\\Repos";
let envLoaded = false;
let cachedConfig: AppConfig | null = null;

function ensureEnvLoaded() {
  if (envLoaded) return;
  dotenv.config({ path: path.join(appRoot, ".env"), override: true, quiet: true });
  envLoaded = true;
}

export function getAppRoot() {
  return appRoot;
}

export function getReposBaseDir() {
  ensureEnvLoaded();
  return process.env.REPOS_BASE_DIR || defaultReposBaseDir;
}

export function loadAppConfig(): AppConfig {
  ensureEnvLoaded();
  if (!cachedConfig) {
    cachedConfig = JSON.parse(readFileSync(path.join(appRoot, "config.json"), "utf8")) as AppConfig;
  }
  return cachedConfig;
}

export function getProviderAndModel(modelOverride?: string) {
  const config = loadAppConfig();
  const [providerRaw, providerModelOverride] = String(config.provider || "cloud").split(":");
  const provider = (providerRaw === "local" ? "local" : "cloud") as Provider;
  const modelName =
    modelOverride ||
    providerModelOverride ||
    (provider === "cloud" ? config.cloud.model : config.local.default);

  return { config, provider, modelName };
}

export function listAvailableRepos() {
  const baseDir = getReposBaseDir();

  return readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      const fullPath = path.join(baseDir, name);
      try {
        return statSync(path.join(fullPath, ".git")).isDirectory() || statSync(path.join(fullPath, ".git")).isFile();
      } catch {
        return false;
      }
    })
    .sort((left, right) => left.localeCompare(right));
}

export function resolveRepoPath(repoName: string) {
  const cleanName = String(repoName || "").trim();
  if (!cleanName) {
    throw new Error("Repository name is required.");
  }

  const allowedRepos = new Set(listAvailableRepos());
  if (!allowedRepos.has(cleanName)) {
    throw new Error(`Unknown repository '${cleanName}'.`);
  }

  return path.join(getReposBaseDir(), cleanName);
}
