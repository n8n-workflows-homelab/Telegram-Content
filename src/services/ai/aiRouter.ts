import geminiService from './geminiService';
import configManager from '../../config/configManager';
import logger from '../../utils/logger';
import { AIResponse } from '../../types';

class AIRouter {
  /**
   * Check if Gemini provider is available (has valid API key)
   */
  private isProviderAvailable(): boolean {
    return geminiService.client !== null;
  }

  /**
   * Get max tokens based on task type
   */
  private getMaxTokens(taskType: 'titles' | 'outline' | 'article'): number {
    const config = configManager.getConfig();
    
    if (taskType === 'titles') return config.ai.gemini.titleMaxTokens;
    if (taskType === 'outline') return config.ai.gemini.outlineMaxTokens;
    if (taskType === 'article') return config.ai.gemini.articleMaxTokens;
    return config.ai.gemini.articleMaxTokens;
  }

  /**
   * Get timeout based on task type
   */
  private getTimeout(taskType: 'titles' | 'outline' | 'article'): number {
    const config = configManager.getConfig();
    if (taskType === 'titles' && config.rateLimit.aiTitleTimeout) {
      return config.rateLimit.aiTitleTimeout;
    }
    if (taskType === 'outline' && config.rateLimit.aiOutlineTimeout) {
      return config.rateLimit.aiOutlineTimeout;
    }
    if (taskType === 'article' && config.rateLimit.aiArticleTimeout) {
      return config.rateLimit.aiArticleTimeout;
    }
    // Fallback to default AI request timeout
    return config.rateLimit.aiRequestTimeout;
  }

  /**
   * Try Gemini provider with exponential backoff retry (3 attempts)
   */
  private async tryProviderWithRetry<T>(
    prompt: string,
    maxTokens: number,
    timeout: number,
    maxRetries: number = 3
  ): Promise<{
    data: T;
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
  }> {
    let lastError: any;

    logger.info(`Starting Gemini with retry logic (max ${maxRetries} attempts)`);
    logger.debug(`Request config - maxTokens: ${maxTokens}, timeout: ${timeout / 1000}s`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const attemptStartTime = Date.now();

      try {
        logger.info(`[gemini] Attempt ${attempt}/${maxRetries} starting...`);

        const result = await geminiService.generateJSONCompletion<T>(prompt, maxTokens, timeout);

        const attemptDuration = Date.now() - attemptStartTime;
        logger.info(`✅ [gemini] Attempt ${attempt}/${maxRetries} succeeded in ${attemptDuration}ms`);
        logger.info(`Tokens used: ${result.tokensUsed} (input: ${result.inputTokens}, output: ${result.outputTokens})`);

        return result;
      } catch (error: any) {
        lastError = error;
        const attemptDuration = Date.now() - attemptStartTime;
        logger.error(`❌ [gemini] Attempt ${attempt}/${maxRetries} failed after ${attemptDuration}ms`);
        logger.error(`Error: ${error.message}`);

        // If not the last attempt, wait before retrying with exponential backoff
        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          logger.info(`⏳ Retrying gemini in ${delayMs / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          logger.error(`[gemini] All ${maxRetries} attempts exhausted`);
        }
      }
    }

    // All retries failed
    logger.error(`[gemini] Final error after ${maxRetries} attempts: ${lastError.message}`);
    throw lastError;
  }

  /**
   * Try Gemini provider with retry on transient errors (2 attempts)
   */
  private async tryPrimaryProvider<T>(
    prompt: string,
    maxTokens: number,
    timeout: number
  ): Promise<{
    data: T;
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
  } | null> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await geminiService.generateJSONCompletion<T>(prompt, maxTokens, timeout);
        return result;
      } catch (error: any) {
        const errorMsg = error.message?.toLowerCase() || '';

        // Identify transient errors that should be retried
        const isConnectionError = errorMsg.includes('connection');
        const isTerminatedError = errorMsg.includes('terminated') || errorMsg.includes('socket');
        const isRateLimitError = errorMsg.includes('rate limit') || errorMsg.includes('429');
        const isServerError = errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503');
        const isTransientError = isConnectionError || isTerminatedError || isRateLimitError || isServerError;

        // Retry on transient errors on first attempt
        if (attempt === 1 && isTransientError) {
          const delayMs = 2000; // 2 second delay before retry
          logger.warn(`gemini transient error on attempt ${attempt}/2: ${error.message}, retrying in ${delayMs / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }

        // Don't retry on timeout, parse errors, non-transient errors, or second attempt
        logger.error(`gemini attempt ${attempt}/2 failed: ${error.message}`);
        throw error;
      }
    }

    return null; // Should not reach here
  }

  /**
   * Generate JSON completion with Gemini
   */
  async generateJSON<T>(
    prompt: string,
    taskType: 'titles' | 'outline' | 'article'
  ): Promise<AIResponse<T>> {
    const startTime = Date.now();

    // Check if Gemini is available
    if (!this.isProviderAvailable()) {
      throw new Error('Gemini API key is not configured. Please set ai.gemini.apiKey in config.json');
    }

    logger.info('='.repeat(50));
    logger.info(`AI REQUEST - ${taskType.toUpperCase()}`);
    logger.info('='.repeat(50));
    logger.info(`Provider: gemini ✅`);

    // Get max tokens and timeout based on task type
    const maxTokens = this.getMaxTokens(taskType);
    const timeout = this.getTimeout(taskType);

    logger.info(`Task config - maxTokens: ${maxTokens}, timeout: ${timeout / 1000}s`);
    logger.debug(`Prompt length: ${prompt.length} characters`);

    // Try Gemini provider with retry on connection errors
    logger.info(`Starting request with Gemini provider`);
    try {
      const result = await this.tryPrimaryProvider<T>(prompt, maxTokens, timeout);

      if (result) {
        const processingTime = Date.now() - startTime;

        logger.info('='.repeat(50));
        logger.info(`✅ GEMINI SUCCESS`);
        logger.info(`Processing time: ${processingTime}ms`);
        logger.info(`Tokens: ${result.tokensUsed} (in: ${result.inputTokens}, out: ${result.outputTokens})`);
        logger.info('='.repeat(50));

        return {
          data: result.data,
          provider: 'gemini',
          tokensUsed: result.tokensUsed,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cached: false,
          processingTime,
        };
      }
    } catch (error: any) {
      logger.error('='.repeat(50));
      logger.error(`❌ GEMINI FAILED`);
      logger.error(`Error: ${error.message}`);
      logger.error(`Error stack: ${error.stack}`);
      logger.error('='.repeat(50));
      
      // Try with retry logic as fallback
      logger.warn('='.repeat(50));
      logger.warn(`⚠️  RETRYING WITH EXPONENTIAL BACKOFF`);
      logger.warn('='.repeat(50));

      try {
        const retryResult = await this.tryProviderWithRetry<T>(
          prompt,
          maxTokens,
          timeout,
          3 // 3 retry attempts
        );

        const processingTime = Date.now() - startTime;

        logger.info('='.repeat(50));
        logger.info(`✅ GEMINI SUCCESS AFTER RETRY`);
        logger.info(`Processing time: ${processingTime}ms`);
        logger.info(`Tokens: ${retryResult.tokensUsed} (in: ${retryResult.inputTokens}, out: ${retryResult.outputTokens})`);
        logger.info('='.repeat(50));

        return {
          data: retryResult.data,
          provider: 'gemini',
          tokensUsed: retryResult.tokensUsed,
          inputTokens: retryResult.inputTokens,
          outputTokens: retryResult.outputTokens,
          cached: false,
          processingTime,
        };
      } catch (retryError: any) {
        logger.error('='.repeat(50));
        logger.error(`❌ GEMINI FAILED AFTER ALL RETRIES`);
        logger.error(`Error: ${retryError.message}`);
        logger.error('='.repeat(50));
        throw retryError;
      }
    }

    throw new Error('Unexpected error in AI router');
  }
}

export default new AIRouter();
