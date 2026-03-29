import OpenAI from "openai";

import { getProviderAndModel } from "@/lib/server/config";
import type { Provider } from "@/lib/server/types";

function extractTextFromResponsesOutput(response: OpenAI.Responses.Response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of response.output || []) {
    if (!("content" in item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

export function getAiRuntime(modelOverride?: string) {
  const { config, provider, modelName } = getProviderAndModel(modelOverride);

  if (provider === "cloud") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured in .env.");
    }

    return {
      config,
      provider,
      modelName,
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
    };
  }

  return {
    config,
    provider,
    modelName,
    client: new OpenAI({
      apiKey: "ollama",
      baseURL: config.local.baseURL,
    }),
  };
}

export async function generateText(params: {
  provider: Provider;
  modelName: string;
  client: OpenAI;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}) {
  if (params.provider === "cloud") {
    const input: OpenAI.Responses.ResponseInput = [];
    if (params.systemPrompt) {
      input.push({
        role: "system",
        content: [{ type: "input_text", text: params.systemPrompt }],
      });
    }
    input.push({
      role: "user",
      content: [{ type: "input_text", text: params.userPrompt }],
    });

    const response = await params.client.responses.create({
      model: params.modelName,
      input,
      ...(Number.isFinite(params.temperature) ? { temperature: params.temperature } : {}),
      ...(Number.isFinite(params.maxOutputTokens) ? { max_output_tokens: params.maxOutputTokens } : {}),
    });

    return extractTextFromResponsesOutput(response);
  }

  const response = await params.client.chat.completions.create({
    model: params.modelName,
    messages: [
      ...(params.systemPrompt ? [{ role: "system" as const, content: params.systemPrompt }] : []),
      { role: "user" as const, content: params.userPrompt },
    ],
    ...(Number.isFinite(params.temperature) ? { temperature: params.temperature } : {}),
    ...(Number.isFinite(params.maxOutputTokens) ? { max_tokens: params.maxOutputTokens } : {}),
  });

  return response.choices[0]?.message?.content?.trim() || "";
}
