/**
 * Calculate AI API cost for Gemini
 * 
 * Note: Gemini API is free for most use cases, so this returns 0.
 * If you need to track costs, you can update this function with actual pricing.
 */
export function calculateCost(
  _provider: 'gemini',
  _inputTokens: number,
  _outputTokens: number
): number {
  // Gemini API is free, return 0
  // Update this if Gemini introduces pricing
  return 0;
}

/**
 * Format cost in USD
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${(cost * 100).toFixed(4)}¢`;
  }
  return `$${cost.toFixed(4)}`;
}

/**
 * Format time duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}
