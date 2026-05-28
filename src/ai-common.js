import dotenv from "dotenv";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import OpenAI from "openai";

function normalizeCliLine(line, level = "log") {
  const text = String(line ?? "");
  if (text.length === 0) return text;

  const normalizeSingle = (raw) => {
    if (raw.trim() === "") return raw;

    let normalized = raw
      .replace(/ðŸ”„|🔄/g, "INFO:")
      .replace(/â„¹ï¸|ℹ️/g, "INFO:")
      .replace(/âš ï¸|⚠️/g, "WARN:")
      .replace(/âŒ|❌/g, "ERROR:")
      .replace(/âœ…|✅/g, "OK:")
      .replace(/ðŸ¤–|🤖/g, "INFO:")
      .replace(/ðŸ“¦|📦/g, "")
      .replace(/â±ï¸|⏱️/g, "INFO:")
      .replace(/ðŸ“¥|📥|ðŸ“¤|📤/g, "INFO:")
      .replace(/ðŸ“‹|📋|🏷️/g, "INFO:")
      .replace(/ðŸš€|🚀|ðŸ”—|🔗/g, "INFO:")
      .replace(/ðŸ”|🔍|ðŸ“‚|📂|ðŸ“|📝|ðŸ“Š|📊|ðŸ“„|📄|ðŸ•’|🕒|â³|⏳/g, "INFO:")
      .replace(/â†’|→/g, "->")
      .trim();

    if (!/^((INFO|WARN|ERROR|OK|DEBUG):|##\s)/.test(normalized)) {
      if (level === "error") normalized = `ERROR: ${normalized}`;
      else if (level === "warn") normalized = `WARN: ${normalized}`;
    }

    if (!normalized.startsWith("## ")) {
      normalized = `## ${normalized}`;
    }
    return normalized;
  };

  return text
    .split(/\r?\n/)
    .map((linePart) => normalizeSingle(linePart))
    .join("\n");
}

export function setupCliConsole() {
  if (globalThis.__cliConsoleNormalized) return;
  globalThis.__cliConsoleNormalized = true;

  const rawLog = console.log.bind(console);
  const rawWarn = console.warn.bind(console);
  const rawError = console.error.bind(console);

  const formatArgs = (args, level) =>
    args.map((arg, idx) => (idx === 0 && typeof arg === "string" ? normalizeCliLine(arg, level) : arg));

  console.log = (...args) => rawLog(...formatArgs(args, "log"));
  console.warn = (...args) => rawWarn(...formatArgs(args, "warn"));
  console.error = (...args) => rawError(...formatArgs(args, "error"));
}

export function loadConfigAndEnv(metaUrl) {
  const __filename = fileURLToPath(metaUrl);
  const __dirname = path.dirname(path.dirname(__filename));
  dotenv.config({ path: path.join(__dirname, ".env"), override: true, quiet: true });
  const config = JSON.parse(readFileSync(path.join(__dirname, "config.json"), "utf8"));
  return { config, __dirname };
}

function parseProvider(rawProvider = "local") {
  const text = String(rawProvider || "local");
  const separatorIndex = text.indexOf(":");
  if (separatorIndex === -1) {
    return { provider: text, modelOverride: null };
  }
  return {
    provider: text.slice(0, separatorIndex),
    modelOverride: text.slice(separatorIndex + 1) || null,
  };
}

export function parseAiRuntimeArgs(args = []) {
  const runtime = {
    provider: null,
    model: null,
    ollamaUrl: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if ((arg === "--provider" || arg === "--ai-provider") && args[i + 1]) {
      runtime.provider = args[i + 1];
      i++;
    } else if (arg.startsWith("--provider=")) {
      runtime.provider = arg.slice("--provider=".length);
    } else if (arg.startsWith("--ai-provider=")) {
      runtime.provider = arg.slice("--ai-provider=".length);
    } else if (arg === "--cloud") {
      runtime.provider = "cloud";
    } else if (arg === "--local" || arg === "--ollama-auto" || arg === "--ollama-fallback") {
      runtime.provider = "local";
    } else if (arg === "--pure-local" || arg === "--local-ollama" || arg === "--localhost-ollama") {
      runtime.provider = "pure-local";
    } else if (arg === "--hosted-ollama" || arg === "--hosted") {
      runtime.provider = "hosted-ollama";
    } else if ((arg === "--model" || arg === "--ai-model") && args[i + 1]) {
      runtime.model = args[i + 1];
      i++;
    } else if (arg.startsWith("--model=")) {
      runtime.model = arg.slice("--model=".length);
    } else if (arg.startsWith("--ai-model=")) {
      runtime.model = arg.slice("--ai-model=".length);
    } else if ((arg === "--ollama-url" || arg === "--ollama-base-url") && args[i + 1]) {
      runtime.ollamaUrl = args[i + 1];
      i++;
    } else if (arg.startsWith("--ollama-url=")) {
      runtime.ollamaUrl = arg.slice("--ollama-url=".length);
    } else if (arg.startsWith("--ollama-base-url=")) {
      runtime.ollamaUrl = arg.slice("--ollama-base-url=".length);
    }
  }

  return runtime;
}

function normalizeBaseURL(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function isLocalhostBaseURL(rawUrl) {
  const text = String(rawUrl || "").toLowerCase();
  return text.includes("localhost") || text.includes("127.0.0.1") || text.includes("[::1]");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toOllamaApiBaseURL(rawBaseURL) {
  const baseURL = normalizeBaseURL(rawBaseURL);
  if (!baseURL) return "";
  return baseURL.replace(/\/v1$/i, "");
}

function selectLocalEndpoints(localConfig = {}, mode = "local") {
  const configuredEndpoints = Array.isArray(localConfig.endpoints) ? localConfig.endpoints : [];
  if (mode === "local") return configuredEndpoints;

  const matcher = mode === "pure-local"
    ? (endpoint) => isLocalhostBaseURL(endpoint.baseURL || localConfig.baseURL)
    : (endpoint) => !isLocalhostBaseURL(endpoint.baseURL || localConfig.baseURL);
  const selected = configuredEndpoints.filter(matcher);

  if (selected.length > 0) return selected;
  if (mode === "pure-local") {
    return [
      {
        name: "pure-local",
        baseURL: localConfig.baseURL || "http://localhost:11434/v1",
        default: localConfig.default,
        models: localConfig.models,
      },
    ];
  }
  return [];
}

export function applyAiRuntimeOverrides(config, runtime = {}) {
  const providerMode = String(runtime.provider || "").trim().toLowerCase();
  const model = String(runtime.model || "").trim();
  const ollamaUrl = normalizeBaseURL(runtime.ollamaUrl);

  if (!providerMode && !model && !ollamaUrl) {
    return { config, modelOverride: null, runtimeLabel: "" };
  }

  const effectiveConfig = JSON.parse(JSON.stringify(config));
  let runtimeLabel = "";

  if (providerMode) {
    if (["cloud", "openai"].includes(providerMode)) {
      effectiveConfig.provider = "cloud";
      runtimeLabel = "cloud";
    } else if (["local", "ollama", "ollama-auto", "ollama-fallback"].includes(providerMode)) {
      effectiveConfig.provider = "local";
      runtimeLabel = "ollama-auto";
    } else if (["pure-local", "local-ollama", "localhost-ollama", "localhost", "local-only"].includes(providerMode)) {
      effectiveConfig.provider = "local";
      effectiveConfig.local = {
        ...(effectiveConfig.local || {}),
        endpoints: selectLocalEndpoints(effectiveConfig.local, "pure-local"),
      };
      runtimeLabel = "local-ollama";
    } else if (["hosted-ollama", "hosted", "remote-ollama"].includes(providerMode)) {
      effectiveConfig.provider = "local";
      effectiveConfig.local = {
        ...(effectiveConfig.local || {}),
        endpoints: selectLocalEndpoints(effectiveConfig.local, "hosted-ollama"),
      };
      runtimeLabel = "hosted-ollama";
    } else {
      console.error(`## ERROR: Unknown provider '${runtime.provider}'. Use cloud, local, pure-local, or hosted-ollama.`);
      process.exit(1);
    }
  }

  if (ollamaUrl) {
    effectiveConfig.provider = "local";
    effectiveConfig.local = {
      ...(effectiveConfig.local || {}),
      endpoints: [
        {
          name: providerMode === "pure-local" ? "pure-local" : "cli-ollama",
          baseURL: ollamaUrl,
          default: model || effectiveConfig.local?.default,
          models: effectiveConfig.local?.models || {},
        },
      ],
    };
    runtimeLabel = "ollama-url";
  }

  return {
    config: effectiveConfig,
    modelOverride: model || null,
    runtimeLabel,
  };
}

function buildLocalEndpointConfigs(localConfig = {}, effectiveModelOverride = null) {
  const configuredEndpoints = Array.isArray(localConfig.endpoints) ? localConfig.endpoints : [];
  const endpoints = configuredEndpoints.length > 0
    ? configuredEndpoints
    : [
        {
          name: "local",
          baseURL: localConfig.baseURL,
          default: localConfig.default,
          models: localConfig.models,
        },
      ];

  return endpoints
    .map((endpoint, index) => ({
      name: endpoint.name || `local-${index + 1}`,
      baseURL: endpoint.baseURL || localConfig.baseURL,
      modelName: effectiveModelOverride || endpoint.default || localConfig.default,
      models: endpoint.models || localConfig.models || {},
    }))
    .filter((endpoint) => endpoint.baseURL && endpoint.modelName);
}

export function initOpenAIClient(config, __dirname, modelOverrideArg, runtimeLabel = "") {
  let client;
  let modelName;
  let providerLabel;
  const { provider, modelOverride } = parseProvider(config.provider);
  const effectiveModelOverride = modelOverrideArg || modelOverride;

  if (provider === "cloud") {
    if (!process.env.OPENAI_API_KEY) {
      console.error("## ERROR: OpenAI API key not set in .env file");
      console.error("## INFO: Add OPENAI_API_KEY to your .env file");
      process.exit(1);
    }
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    modelName = effectiveModelOverride || config.cloud.model;
    providerLabel = runtimeLabel || provider;
  } else {
    const localEndpoints = buildLocalEndpointConfigs(config.local, effectiveModelOverride);
    if (localEndpoints.length === 0) {
      console.error("## ERROR: No local Ollama endpoints configured in config.json");
      process.exit(1);
    }

    const clients = localEndpoints.map((endpoint) => ({
      ...endpoint,
      client: new OpenAI({
        baseURL: endpoint.baseURL,
        apiKey: "ollama", // required but unused for Ollama
      }),
    }));

    client = new OpenAI({
      baseURL: clients[0].baseURL,
      apiKey: "ollama", // required but unused for Ollama
    });
    client.__localFallbacks = clients;
    modelName = clients[0].modelName;
    providerLabel = runtimeLabel
      ? `${runtimeLabel}:${clients[0].name || provider}`
      : clients[0].name || provider;
  }
  return { client, modelName, provider, providerLabel };
}

export function formatLocalEndpointFallback(config) {
  const endpoints = buildLocalEndpointConfigs(config?.local);
  if (endpoints.length === 0) return "local Ollama";
  return endpoints
    .map((endpoint) => `${endpoint.name} (${endpoint.baseURL}, model=${endpoint.modelName})`)
    .join(" -> ");
}

export function isLocalConnectionError(error) {
  const codes = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH"]);
  const code = error?.code || error?.cause?.code;
  if (codes.has(code)) return true;

  const message = String(error?.message || error?.cause?.message || "").toLowerCase();
  return message.includes("connection error") || message.includes("fetch failed");
}

export function isLocalModelRunnerError(error) {
  const status = error?.status || error?.response?.status;
  const message = String(error?.message || error?.cause?.message || "").toLowerCase();

  return status >= 500 && (
    message.includes("model runner") ||
    message.includes("resource limitations") ||
    message.includes("unexpectedly stopped")
  );
}

function shouldRetryLocalModelRunner(error, attempt) {
  return attempt === 1 && isLocalModelRunnerError(error);
}

function extractTextFromResponsesOutput(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content?.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function normalizeUsageFromResponses(usage) {
  if (!usage) return null;
  return {
    prompt_tokens: usage.input_tokens || 0,
    completion_tokens: usage.output_tokens || 0,
    total_tokens: usage.total_tokens || (usage.input_tokens || 0) + (usage.output_tokens || 0),
    prompt_tokens_details: {
      cached_tokens: usage?.input_tokens_details?.cached_tokens || 0,
    },
  };
}

export async function generateText({
  client,
  provider,
  modelName,
  userPrompt,
  systemPrompt = "",
  temperature,
  maxOutputTokens,
  debug = false,
  debugLabel = "",
  progress = false,
  stream = false,
  think = false,
}) {
  if (debug) {
    const title = debugLabel ? ` [${debugLabel}]` : "";
    console.log(`\n## DEBUG: --- LLM Request${title} ---`);
    console.log(`## DEBUG: provider: ${provider}`);
    console.log(`## DEBUG: model: ${modelName}`);
    if (Number.isFinite(temperature)) {
      console.log(`## DEBUG: temperature: ${temperature}`);
    }
    if (Number.isFinite(maxOutputTokens)) {
      console.log(`## DEBUG: maxOutputTokens: ${maxOutputTokens}`);
    }
    if (systemPrompt) {
      console.log("\n## DEBUG: [system prompt]");
      console.log(systemPrompt);
    }
    console.log("\n## DEBUG: [user prompt]");
    console.log(userPrompt);
    console.log("## DEBUG: --- End LLM Request ---\n");
  }

  if (provider === "cloud") {
    if (stream) {
      console.warn("## WARN: --stream is currently supported for local Ollama requests only; using normal cloud request.");
    }
    const input = [];
    if (systemPrompt) {
      input.push({
        role: "system",
        content: [{ type: "input_text", text: systemPrompt }],
      });
    }
    input.push({
      role: "user",
      content: [{ type: "input_text", text: userPrompt }],
    });

    const request = {
      model: modelName,
      input,
    };
    if (Number.isFinite(temperature)) request.temperature = temperature;
    if (Number.isFinite(maxOutputTokens)) request.max_output_tokens = maxOutputTokens;

    let response;
    try {
      response = await client.responses.create(request);
    } catch (error) {
      const message = String(error?.message || "");
      const unsupportedTemp =
        message.includes("Unsupported parameter") && message.includes("temperature");
      if (unsupportedTemp && Object.prototype.hasOwnProperty.call(request, "temperature")) {
        const retryRequest = { ...request };
        delete retryRequest.temperature;
        response = await client.responses.create(retryRequest);
      } else {
        throw error;
      }
    }
    return {
      text: extractTextFromResponsesOutput(response),
      usage: normalizeUsageFromResponses(response.usage),
      raw: response,
    };
  }

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: userPrompt });

  const localFallbacks = Array.isArray(client.__localFallbacks)
    ? client.__localFallbacks
    : [{ name: "local", client, modelName }];
  let lastError;

  for (const endpoint of localFallbacks) {
    const request = {
      model: endpoint.modelName || modelName,
      messages,
    };
    if (Number.isFinite(temperature)) request.temperature = temperature;
    if (Number.isFinite(maxOutputTokens)) request.max_tokens = maxOutputTokens;

    for (let attempt = 1; attempt <= 2; attempt++) {
      let progressTimer = null;
      const startTime = Date.now();
      try {
        if (debug && (localFallbacks.length > 1 || attempt > 1)) {
          console.log(`## DEBUG: local endpoint: ${endpoint.name} (${endpoint.baseURL || "configured client"})`);
          console.log(`## DEBUG: local endpoint model: ${request.model}`);
          console.log(`## DEBUG: local endpoint attempt: ${attempt}`);
        }

        if (progress) {
          progressTimer = setInterval(() => {
            const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
            console.log(`## INFO: Still waiting for ${endpoint.name} (${request.model}) after ${elapsedSeconds}s...`);
          }, 15000);
        }

        const ollamaApiBaseURL = toOllamaApiBaseURL(endpoint.baseURL);
        if (ollamaApiBaseURL) {
          const body = {
            model: request.model,
            messages,
            stream,
            think,
          };
          const options = {};
          if (Number.isFinite(temperature)) options.temperature = temperature;
          if (Number.isFinite(maxOutputTokens)) options.num_predict = maxOutputTokens;
          if (Object.keys(options).length > 0) body.options = options;

          if (stream) {
            process.stdout.write(`\n## STREAM: ${endpoint.name} (${request.model})\n`);
          }

          const response = await fetch(`${ollamaApiBaseURL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            const errorBody = await response.text();
            const error = new Error(`Ollama chat failed (${response.status}): ${errorBody.slice(0, 300)}`);
            error.status = response.status;
            throw error;
          }

          if (stream) {
            const decoder = new TextDecoder();
            const chunks = [];
            let buffer = "";

            for await (const rawChunk of response.body) {
              buffer += decoder.decode(rawChunk, { stream: true });
              const lines = buffer.split(/\r?\n/);
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.trim()) continue;
                const parsed = JSON.parse(line);
                const content = parsed?.message?.content || "";
                if (content) {
                  chunks.push(content);
                  process.stdout.write(content);
                }
              }
            }

            if (buffer.trim()) {
              const parsed = JSON.parse(buffer);
              const content = parsed?.message?.content || "";
              if (content) {
                chunks.push(content);
                process.stdout.write(content);
              }
            }

            process.stdout.write("\n## STREAM: end\n");
            if (progressTimer) clearInterval(progressTimer);
            return {
              text: chunks.join("").trim(),
              usage: null,
              raw: null,
            };
          }

          const responseBody = await response.json();
          if (progressTimer) clearInterval(progressTimer);
          return {
            text: responseBody?.message?.content?.trim() || "",
            usage: responseBody
              ? {
                  prompt_tokens: responseBody.prompt_eval_count || 0,
                  completion_tokens: responseBody.eval_count || 0,
                  total_tokens: (responseBody.prompt_eval_count || 0) + (responseBody.eval_count || 0),
                }
              : null,
            raw: responseBody,
          };
        }

        if (stream) {
          process.stdout.write(`\n## STREAM: ${endpoint.name} (${request.model})\n`);
          const chunks = [];
          const response = await endpoint.client.chat.completions.create({
            ...request,
            stream: true,
          });

          for await (const chunk of response) {
            const content = chunk?.choices?.[0]?.delta?.content || "";
            if (content) {
              chunks.push(content);
              process.stdout.write(content);
            }
          }

          process.stdout.write("\n## STREAM: end\n");
          if (progressTimer) clearInterval(progressTimer);
          return {
            text: chunks.join("").trim(),
            usage: null,
            raw: null,
          };
        }

        const response = await endpoint.client.chat.completions.create(request);
        if (progressTimer) clearInterval(progressTimer);
        return {
          text: response?.choices?.[0]?.message?.content?.trim() || "",
          usage: response?.usage || null,
          raw: response,
        };
      } catch (error) {
        if (progressTimer) clearInterval(progressTimer);
        lastError = error;
        error.ollamaEndpointName = endpoint.name;
        error.ollamaEndpointBaseURL = endpoint.baseURL;
        error.ollamaModelName = request.model;

        if (shouldRetryLocalModelRunner(error, attempt)) {
          console.warn(`## WARN: Local Ollama endpoint '${endpoint.name}' model runner stopped; retrying once.`);
          await sleep(1500);
          continue;
        }

        const hasNextEndpoint = endpoint !== localFallbacks[localFallbacks.length - 1];
        if (!hasNextEndpoint) break;

        const reason = error?.message ? ` ${error.message}` : "";
        console.warn(`## WARN: Local Ollama endpoint '${endpoint.name}' failed; trying next endpoint.${reason}`);
        break;
      }
    }
  }

  throw lastError;
}

function formatUsd(value, decimals = 6) {
  return `$${value.toFixed(decimals)}`;
}

function formatRate(value) {
  return `$${value.toFixed(2)}/1M`;
}

function getCloudModelPricing(config, modelName) {
  const configured = config?.cloud?.pricing?.[modelName];
  if (
    configured &&
    Number.isFinite(configured.inputPer1M) &&
    Number.isFinite(configured.outputPer1M)
  ) {
    return configured;
  }
  return null;
}

export function printTokenUsage(usage, { provider, modelName, config }) {
  if (!usage) return;

  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || promptTokens + completionTokens;
  const cachedPromptTokens = usage?.prompt_tokens_details?.cached_tokens || 0;
  const nonCachedPromptTokens = Math.max(promptTokens - cachedPromptTokens, 0);

  console.log(`\n## INFO: Token usage: prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokens}`);

  if (provider !== "cloud") return;

  const pricing = getCloudModelPricing(config, modelName);
  if (!pricing) {
    console.log(`## WARN: No pricing configured for model '${modelName}'.`);
    console.log("## INFO: Add it under cloud.pricing in config.json (inputPer1M/outputPer1M, optional cachedInputPer1M).");
    return;
  }

  const effectiveCachedRate = Number.isFinite(pricing.cachedInputPer1M)
    ? pricing.cachedInputPer1M
    : pricing.inputPer1M;
  const inputCost = (nonCachedPromptTokens / 1_000_000) * pricing.inputPer1M;
  const cachedInputCost = (cachedPromptTokens / 1_000_000) * effectiveCachedRate;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPer1M;
  const totalCost = inputCost + cachedInputCost + outputCost;

  const pricingText = Number.isFinite(pricing.cachedInputPer1M)
    ? `input=${formatRate(pricing.inputPer1M)}, cached_input=${formatRate(pricing.cachedInputPer1M)}, output=${formatRate(pricing.outputPer1M)}`
    : `input=${formatRate(pricing.inputPer1M)}, output=${formatRate(pricing.outputPer1M)}`;
  console.log(`## INFO: Model pricing (${modelName}): ${pricingText}`);
  if (cachedPromptTokens > 0 || Number.isFinite(pricing.cachedInputPer1M)) {
    console.log(
      `## INFO: Estimated request cost: ${formatUsd(totalCost)} (input=${formatUsd(inputCost)}, cached_input=${formatUsd(cachedInputCost)}, output=${formatUsd(outputCost)})`
    );
  } else {
    console.log(`## INFO: Estimated request cost: ${formatUsd(totalCost)} (input=${formatUsd(inputCost)}, output=${formatUsd(outputCost)})`);
  }
}
