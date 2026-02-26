import dotenv from "dotenv";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import OpenAI from "openai";

export function loadConfigAndEnv(metaUrl) {
  const __filename = fileURLToPath(metaUrl);
  const __dirname = path.dirname(__filename);
  dotenv.config({ path: path.join(__dirname, ".env"), override: true, quiet: true });
  const config = JSON.parse(readFileSync(path.join(__dirname, "config.json"), "utf8"));
  return { config, __dirname };
}

export function initOpenAIClient(config, __dirname, modelOverrideArg) {
  let client;
  let modelName;
  const [provider, modelOverride] = config.provider.split(":");
  const effectiveModelOverride = modelOverrideArg || modelOverride;

  if (provider === "cloud") {
    if (!process.env.OPENAI_API_KEY) {
      console.error("ERROR: OpenAI API key not set in .env file");
      console.error("   Add OPENAI_API_KEY to your .env file");
      process.exit(1);
    }
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    modelName = effectiveModelOverride || config.cloud.model;
  } else {
    // Local Ollama
    client = new OpenAI({
      baseURL: config.local.baseURL,
      apiKey: "ollama", // required but unused for Ollama
    });
    modelName = effectiveModelOverride || config.local.default;
  }
  return { client, modelName, provider };
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
}) {
  if (debug) {
    const title = debugLabel ? ` [${debugLabel}]` : "";
    console.log(`\n--- LLM Request${title} ---`);
    console.log(`provider: ${provider}`);
    console.log(`model: ${modelName}`);
    if (Number.isFinite(temperature)) {
      console.log(`temperature: ${temperature}`);
    }
    if (Number.isFinite(maxOutputTokens)) {
      console.log(`maxOutputTokens: ${maxOutputTokens}`);
    }
    if (systemPrompt) {
      console.log("\n[system prompt]");
      console.log(systemPrompt);
    }
    console.log("\n[user prompt]");
    console.log(userPrompt);
    console.log("--- End LLM Request ---\n");
  }

  if (provider === "cloud") {
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

  const request = {
    model: modelName,
    messages,
  };
  if (Number.isFinite(temperature)) request.temperature = temperature;
  if (Number.isFinite(maxOutputTokens)) request.max_tokens = maxOutputTokens;

  const response = await client.chat.completions.create(request);
  return {
    text: response?.choices?.[0]?.message?.content?.trim() || "",
    usage: response?.usage || null,
    raw: response,
  };
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

  console.log(`\nINFO: Token usage: prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokens}`);

  if (provider !== "cloud") return;

  const pricing = getCloudModelPricing(config, modelName);
  if (!pricing) {
    console.log(`INFO: No pricing configured for model '${modelName}'.`);
    console.log("   Add it under cloud.pricing in config.json (inputPer1M/outputPer1M, optional cachedInputPer1M).");
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
  console.log(`INFO: Model pricing (${modelName}): ${pricingText}`);
  if (cachedPromptTokens > 0 || Number.isFinite(pricing.cachedInputPer1M)) {
    console.log(
      `INFO: Estimated request cost: ${formatUsd(totalCost)} (input=${formatUsd(inputCost)}, cached_input=${formatUsd(cachedInputCost)}, output=${formatUsd(outputCost)})`
    );
  } else {
    console.log(`INFO: Estimated request cost: ${formatUsd(totalCost)} (input=${formatUsd(inputCost)}, output=${formatUsd(outputCost)})`);
  }
}
