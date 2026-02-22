// USD per 1M tokens
export const LLM_PRICES: Record<string, { input: number; output: number }> = {
  'google/gemini-2.0-flash-lite':              { input: 0.075, output: 0.30  },
  'google/gemini-2.0-flash':                   { input: 0.10,  output: 0.40  },
  'google/gemini-2.5-flash':                   { input: 0.15,  output: 0.60  },
  'google/gemini-2.5-pro':                     { input: 1.25,  output: 10.00 },
  'openrouter/openai/gpt-4o-mini':             { input: 0.15,  output: 0.60  },
  'openrouter/openai/gpt-4o':                  { input: 2.50,  output: 10.00 },
  'openrouter/anthropic/claude-3.5-sonnet':    { input: 3.00,  output: 15.00 },
  'openrouter/anthropic/claude-3.7-sonnet':    { input: 3.00,  output: 15.00 },
  'openrouter/deepseek/deepseek-chat-v3-0324': { input: 0.27,  output: 1.10  },
}

export function estimateCost(model: string, inputTokens: number | null | undefined, outputTokens: number | null | undefined): number | null {
  if (inputTokens == null || outputTokens == null) return null
  const prices = LLM_PRICES[model]
  if (!prices) return null
  return (inputTokens / 1_000_000) * prices.input + (outputTokens / 1_000_000) * prices.output
}
