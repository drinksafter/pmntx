import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import type { AiCompletionRequest, AiCompletionResult } from "../types";

export async function completeWithAnthropic(
  modelCode: string,
  request: AiCompletionRequest,
  apiKey: string
): Promise<AiCompletionResult> {
  const client = new Anthropic({ apiKey });
  const started = Date.now();

  const response = await client.messages.create({
    model: modelCode,
    max_tokens: request.maxTokens,
    system: request.system,
    messages: request.messages,
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  return {
    text,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    latencyMs: Date.now() - started,
  };
}
