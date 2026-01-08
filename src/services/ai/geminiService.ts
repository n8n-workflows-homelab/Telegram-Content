import { GoogleGenerativeAI } from "@google/generative-ai";
import configManager from "../../config/configManager";
import logger from "../../utils/logger";
import { withTimeout } from "../../utils/timeout";

class GeminiService {
  public client: GoogleGenerativeAI | null = null;

  constructor() {
    const config = configManager.getConfig();
    const apiKey = config.ai.gemini.apiKey?.trim();

    if (!apiKey || apiKey === "") {
      logger.warn(
        "Gemini API key is not configured. Gemini service will not be available."
      );
      return;
    }

    // Basic validation: Gemini API keys are typically longer than 20 characters
    if (apiKey.length < 20) {
      logger.warn("Gemini API key appears too short. It may be invalid.");
    }

    try {
      this.client = new GoogleGenerativeAI(apiKey);
      logger.info("Gemini service initialized");
    } catch (error: any) {
      logger.error(`Failed to initialize Gemini service: ${error.message}`);
      this.client = null;
    }
  }

  /**
   * Try free tier models as fallback
   */
  private async tryFreeTierModels(
    prompt: string,
    maxTokens: number | undefined,
    timeoutMs: number,
    startTime: number,
    reason: string
  ): Promise<{
    content: string;
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
  } | null> {
    const config = configManager.getConfig();
    const freeTierModels = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];

    logger.warn(
      `${reason} for model ${config.ai.gemini.model}, trying free tier models...`
    );

    for (const freeTierModel of freeTierModels) {
      try {
        logger.info(`Trying free tier model: ${freeTierModel}`);
        const freeTierModelInstance = this.client!.getGenerativeModel({
          model: freeTierModel,
          generationConfig: {
            temperature: config.ai.temperature,
            maxOutputTokens: maxTokens,
          },
        });

        const freeTierApiCall = freeTierModelInstance.generateContent(prompt);
        const freeTierResponse = (await withTimeout(
          freeTierApiCall,
          timeoutMs,
          "Gemini API"
        )) as any;
        const processingTime = Date.now() - startTime;

        const content = freeTierResponse.response.text() || "";
        const usageMetadata = freeTierResponse.response.usageMetadata;
        const inputTokens = usageMetadata?.promptTokenCount || 0;
        const outputTokens = usageMetadata?.candidatesTokenCount || 0;
        const tokensUsed =
          usageMetadata?.totalTokenCount || inputTokens + outputTokens;

        logger.info(`✅ Successfully used free tier model: ${freeTierModel}`);
        logger.info(
          `Gemini completion generated in ${processingTime}ms, tokens: ${tokensUsed} (in: ${inputTokens}, out: ${outputTokens})`
        );

        return { content, tokensUsed, inputTokens, outputTokens };
      } catch (freeTierError: any) {
        // Continue to next free tier model
        logger.warn(
          `Free tier model ${freeTierModel} also failed: ${freeTierError.message}`
        );
        continue;
      }
    }

    return null; // All free tier models failed
  }

  /**
   * Generate completion with Gemini
   */
  async generateCompletion(
    prompt: string,
    maxTokens?: number,
    timeout?: number
  ): Promise<{
    content: string;
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
  }> {
    if (!this.client) {
      throw new Error(
        "Gemini API key is not configured. Please set ai.gemini.apiKey in config.json"
      );
    }

    const startTime = Date.now();
    const config = configManager.getConfig();
    const timeoutMs = timeout || config.rateLimit.aiRequestTimeout;

    try {
      const model = this.client.getGenerativeModel({
        model: config.ai.gemini.model,
        generationConfig: {
          temperature: config.ai.temperature,
          maxOutputTokens: maxTokens,
        },
      });

      // Gemini API call
      const apiCall = model.generateContent(prompt);

      // Wrap with timeout
      const response = (await withTimeout(
        apiCall,
        timeoutMs,
        "Gemini API"
      )) as any;
      const processingTime = Date.now() - startTime;

      // Extract content from response
      const content = response.response.text() || "";

      // Extract token usage from response
      const usageMetadata = response.response.usageMetadata;
      const inputTokens = usageMetadata?.promptTokenCount || 0;
      const outputTokens = usageMetadata?.candidatesTokenCount || 0;
      const tokensUsed =
        usageMetadata?.totalTokenCount || inputTokens + outputTokens;

      logger.info(
        `Gemini completion generated in ${processingTime}ms, tokens: ${tokensUsed} (in: ${inputTokens}, out: ${outputTokens}), max_tokens: ${maxTokens || "default"}`
      );

      return { content, tokensUsed, inputTokens, outputTokens };
    } catch (error: any) {
      // Check if error is about quota exceeded (429)
      const isQuotaExceeded =
        error.message?.includes("429") ||
        error.message?.includes("quota") ||
        error.message?.includes("exceeded your current quota") ||
        error.message?.includes("Quota exceeded") ||
        error.message?.includes("free_tier_requests");

      // Check if error is about model not found (404)
      const isModelNotFound =
        error.message?.includes("404") ||
        error.message?.includes("not found") ||
        error.message?.includes("is not found for API version");

      // Try free tier models if quota exceeded
      if (isQuotaExceeded) {
        const freeTierResult = await this.tryFreeTierModels(
          prompt,
          maxTokens,
          timeoutMs,
          startTime,
          "Quota exceeded"
        );
        if (freeTierResult) {
          return freeTierResult;
        }
        // All free tier models failed
        throw new Error(
          `Quota exceeded for ${config.ai.gemini.model} and all free tier models failed.`
        );
      }

      if (isModelNotFound) {
        // Try fallback models (same as free tier models)
        const fallbackResult = await this.tryFreeTierModels(
          prompt,
          maxTokens,
          timeoutMs,
          startTime,
          "Model not found"
        );
        if (fallbackResult) {
          return fallbackResult;
        }
        // All fallbacks failed
        throw new Error(
          `No valid Gemini model found. Tried: ${config.ai.gemini.model} and free tier models.`
        );
      }

      if (error.message?.includes("timeout")) {
        logger.error(`Gemini API timeout: ${error.message}`);
        throw new Error(`Gemini API timeout after ${timeoutMs / 1000}s`);
      }

      // Check for quota exceeded in error response (429 status)
      if (error.response?.status === 429) {
        const errorMessage =
          error.message || JSON.stringify(error.response?.data || {});
        const isQuotaError =
          errorMessage.includes("quota") ||
          errorMessage.includes("exceeded") ||
          errorMessage.includes("free_tier_requests");

        if (isQuotaError) {
          const freeTierResult = await this.tryFreeTierModels(
            prompt,
            maxTokens,
            timeoutMs,
            startTime,
            "Quota exceeded (429)"
          );
          if (freeTierResult) {
            return freeTierResult;
          }
          // All free tier models failed
          throw new Error(
            `Quota exceeded for ${config.ai.gemini.model} (429) and all free tier models failed.`
          );
        }
      }

      if (error.response) {
        // Sanitize error response to avoid logging sensitive data
        const safeErrorData = error.response.data
          ? typeof error.response.data === "string"
            ? error.response.data.substring(0, 200)
            : typeof error.response.data === "object"
              ? JSON.stringify(error.response.data).substring(0, 200)
              : String(error.response.data).substring(0, 200)
          : "No error data";
        logger.error(
          `Gemini API error: ${error.response.status} - ${safeErrorData}`
        );
        throw new Error(`Gemini API error: ${error.response.status}`);
      }

      // Enhanced error logging for network/socket errors
      const errorType = error.code || error.name || "Unknown";
      const errorDetails = {
        message: error.message,
        code: error.code,
        cause: error.cause?.message,
        socket: error.cause?.socket,
      };

      logger.error(
        `Gemini request error [${errorType}]: ${JSON.stringify(errorDetails)}`
      );
      throw new Error(`Gemini request error: ${error.message}`);
    }
  }

  /**
   * Parse JSON response from Gemini with multiple fallback strategies
   */
  parseJSONResponse<T>(content: string): T {
    try {
      const trimmedContent = content.trim();

      // Strategy 1: Extract JSON from markdown code blocks (handles both complete and truncated)
      // First try to match complete code blocks with closing ```
      let jsonString: string | null = null;

      // Try to match ```json ... ``` (complete block)
      const completeJsonBlockMatch = content.match(
        /```\s*json\s*\n?([\s\S]*?)\n?\s*```/i
      );
      if (completeJsonBlockMatch && completeJsonBlockMatch[1]) {
        jsonString = completeJsonBlockMatch[1].trim();
      } else {
        // Try to match ```json ... (truncated, no closing ```)
        // Use greedy match to get everything after ```json
        const truncatedJsonBlockMatch = content.match(
          /```\s*json\s*\n?([\s\S]*)$/i
        );
        if (truncatedJsonBlockMatch && truncatedJsonBlockMatch[1]) {
          jsonString = truncatedJsonBlockMatch[1].trim();
        }
      }

      // If we found JSON in code block, try to parse it
      if (jsonString && jsonString.match(/^[\s]*[{\[]/)) {
        try {
          return JSON.parse(jsonString);
        } catch (e) {
          // If parsing fails, try to extract valid JSON from the content
          // This handles cases where JSON is incomplete/truncated
          logger.debug(
            "Failed to parse JSON from json code block, trying to extract valid JSON"
          );
        }
      }

      // Strategy 1b: Try generic code block without language tag
      let genericJsonString: string | null = null;
      const completeGenericBlockMatch = content.match(
        /```\s*\n?([\s\S]*?)\n?\s*```/
      );
      if (completeGenericBlockMatch && completeGenericBlockMatch[1]) {
        genericJsonString = completeGenericBlockMatch[1].trim();
      } else {
        const truncatedGenericBlockMatch = content.match(/```\s*\n?([\s\S]*)$/);
        if (truncatedGenericBlockMatch && truncatedGenericBlockMatch[1]) {
          genericJsonString = truncatedGenericBlockMatch[1].trim();
        }
      }

      if (genericJsonString && genericJsonString.match(/^[\s]*[{\[]/)) {
        try {
          return JSON.parse(genericJsonString);
        } catch (e) {
          // Continue to next strategy
        }
      }

      // Strategy 1c: Handle case where response starts with ```json but is truncated
      // Remove ```json from start if present and try to parse remaining content
      if (
        trimmedContent.startsWith("```json") ||
        trimmedContent.startsWith("```JSON")
      ) {
        const withoutPrefix = trimmedContent.replace(/^```\s*json\s*\n?/i, "");
        const withoutSuffix = withoutPrefix.replace(/\n?\s*```\s*$/, "");
        if (withoutSuffix.match(/^[\s]*[{\[]/)) {
          try {
            return JSON.parse(withoutSuffix);
          } catch (e) {
            // Continue to next strategy
          }
        }
      }

      // Strategy 2: Try to parse the entire content as-is (if no code blocks)
      if (
        !trimmedContent.includes("```") &&
        trimmedContent.match(/^[\s]*[{\[]/)
      ) {
        try {
          return JSON.parse(trimmedContent);
        } catch {
          // Continue to strategy 3
        }
      }

      // Strategy 3: Extract JSON object from text (find first { and try to find balanced structure)
      // This handles cases where JSON is embedded in text or code blocks
      // Also handles truncated JSON by finding the longest valid JSON substring
      const firstBrace = content.indexOf("{");
      if (firstBrace !== -1) {
        // Try to find balanced braces - this helps with truncated JSON
        let braceCount = 0;
        let validLastBrace = -1;
        let inString = false;
        let escapeNext = false;

        for (let i = firstBrace; i < content.length; i++) {
          const char = content[i];

          if (escapeNext) {
            escapeNext = false;
            continue;
          }

          if (char === "\\") {
            escapeNext = true;
            continue;
          }

          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }

          if (!inString) {
            if (char === "{") braceCount++;
            if (char === "}") {
              braceCount--;
              if (braceCount === 0) {
                validLastBrace = i;
                break;
              }
            }
          }
        }

        // If we found a balanced JSON structure, try parsing it
        if (validLastBrace !== -1 && validLastBrace > firstBrace) {
          const jsonString = content.substring(firstBrace, validLastBrace + 1);
          try {
            return JSON.parse(jsonString);
          } catch {
            // Continue to strategy 4
          }
        }

        // Fallback: try with last closing brace (might work for some cases)
        const lastBrace = content.lastIndexOf("}");
        if (lastBrace !== -1 && lastBrace > firstBrace) {
          const jsonString = content.substring(firstBrace, lastBrace + 1);
          try {
            return JSON.parse(jsonString);
          } catch {
            // Continue to strategy 4
          }
        }
      }

      // Strategy 4: Try to find JSON array [...]
      const firstBracket = content.indexOf("[");
      const lastBracket = content.lastIndexOf("]");
      if (
        firstBracket !== -1 &&
        lastBracket !== -1 &&
        lastBracket > firstBracket
      ) {
        const jsonString = content.substring(firstBracket, lastBracket + 1);
        try {
          return JSON.parse(jsonString);
        } catch {
          // All strategies failed
        }
      }

      // All strategies failed
      // Check if response appears to be truncated or incomplete
      const hasIncompleteJson =
        content.includes("{") &&
        (content.match(/"title":\s*$/m) ||
          content.match(/"title":\s*"$/m) ||
          content.match(/"title":\s*"[^"]*$/m) ||
          (content.includes('"title":') &&
            !content.match(/"title":\s*"[^"]*"/m) &&
            content.match(/"title":\s*"[^"]*$/m)));

      if (hasIncompleteJson) {
        logger.error("JSON response appears to be truncated/incomplete");
        logger.error(
          `Response content (first 500 chars): ${content.substring(0, 500)}`
        );
        throw new Error(
          "JSON response from Gemini is incomplete (possibly truncated). Consider increasing max_tokens."
        );
      }

      throw new Error("No valid JSON found in response");
    } catch (error: any) {
      // Re-throw if it's already our custom error
      if (
        error.message &&
        error.message.includes("JSON response from Gemini")
      ) {
        throw error;
      }

      logger.error("Failed to parse Gemini JSON response");
      logger.error(`Error: ${error.message}`);
      logger.error(
        `Response content (first 500 chars): ${content.substring(0, 500)}`
      );
      throw new Error("Invalid JSON response from Gemini");
    }
  }

  /**
   * Generate and parse JSON completion
   */
  async generateJSONCompletion<T>(
    prompt: string,
    maxTokens?: number,
    timeout?: number
  ): Promise<{
    data: T;
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
  }> {
    const { content, tokensUsed, inputTokens, outputTokens } =
      await this.generateCompletion(prompt, maxTokens, timeout);
    const data = this.parseJSONResponse<T>(content);
    return { data, tokensUsed, inputTokens, outputTokens };
  }
}

export default new GeminiService();
