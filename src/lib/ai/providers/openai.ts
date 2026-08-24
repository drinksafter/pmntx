import "server-only";

import OpenAI from "openai";

import type { AiCompletionRequest, AiCompletionResult } from "../types";

export async function completeWithOpenAI(
  modelCode: string,
  request: AiCompletionRequest,
  apiKey: string
): Promise<AiCompletionResult> {
  const client = new OpenAI({ apiKey });
  const started = Date.now();

  const response = await client.chat.completions.create({
    model: modelCode,
    max_tokens: request.maxTokens,
    messages: [
      ...(request.system ? [{ role: "system" as const, content: request.system }] : []),
      ...request.messages,
    ],
  });

  return {
    text: response.choices[0]?.message?.content ?? "",
    tokensInput: response.usage?.prompt_tokens ?? 0,
    tokensOutput: response.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - started,
  };
}
