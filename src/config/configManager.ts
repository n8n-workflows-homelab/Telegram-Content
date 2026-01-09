import fs from "fs";
import path from "path";
import { AppConfig } from "../types";

// Simple logger to avoid circular dependency during initialization
const log = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
};

// Lazy load logger to avoid circular dependency
let _logger: any = null;
function getLogger() {
  if (!_logger) {
    try {
      _logger = require("../utils/logger").default;
    } catch {
      _logger = log; // Fallback to simple logger
    }
  }
  return _logger;
}

const CONFIG_FILE_PATH = path.join(process.cwd(), "config.json");

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: AppConfig = {
  nodeEnv: "development",
  port: 3000,
  webhookUrl: "",
  n8nTrackingUrl: "",
  telegram: {
    botToken: "",
    botMode: "polling",
    secretToken: undefined,
  },
  ai: {
    defaultProvider: "gemini",
    backupAI: false,
    gemini: {
      apiKey: "",
      model: "gemini-1.5-pro",
      titleMaxTokens: 2000,
      outlineMaxTokens: 8000,
      articleMaxTokens: 25000,
    },
    temperature: 0.7,
  },
  rateLimit: {
    enabled: true,
    maxRequestsPerMinute: 10,
    aiRequestTimeout: 600000,
    aiTitleTimeout: 180000,
    aiOutlineTimeout: 360000,
    aiArticleTimeout: 600000,
  },
  features: {},
  logging: {
    level: "info",
  },
};

/**
 * ConfigManager - Manages runtime configuration with persistence
 */
class ConfigManager {
  private currentConfig: AppConfig;
  private configuredKeys: Set<string> = new Set();

  constructor() {
    this.currentConfig = this.loadConfig();
    this.markConfiguredKeys();
  }

  /**
   * Load config from file or create default
   */
  private loadConfig(): AppConfig {
    try {
      if (fs.existsSync(CONFIG_FILE_PATH)) {
        const fileContent = fs.readFileSync(CONFIG_FILE_PATH, "utf-8");
        const savedConfig = JSON.parse(fileContent);

        // Merge with defaults to ensure all fields exist
        const config = this.deepMerge(DEFAULT_CONFIG, savedConfig);

        log.info("Configuration loaded from config.json");
        return config;
      } else {
        log.info("No config.json found, creating default configuration");
        this.saveConfigToFile(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG };
      }
    } catch (error: any) {
      log.error(`Failed to load config.json: ${error.message}`);
      log.info("Using default configuration");
      return { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Validate and sanitize secret token for Telegram webhook
   * Telegram only allows: alphanumeric characters, hyphens, and underscores
   */
  private validateSecretToken(token: string | undefined): string | undefined {
    if (!token) return undefined;
    
    // Trim whitespace
    const trimmed = token.trim();
    
    // If empty after trimming, return undefined
    if (trimmed.length === 0) return undefined;
    
    // Validate: only alphanumeric, hyphens, and underscores allowed
    // Length: 1-256 characters (Telegram requirement)
    if (trimmed.length > 256) {
      log.warn("Secret token exceeds 256 characters, truncating");
      return trimmed.substring(0, 256);
    }
    
    // Check for invalid characters
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validPattern.test(trimmed)) {
      log.warn(`Secret token contains invalid characters. Only alphanumeric, hyphens, and underscores are allowed.`);
      // Remove invalid characters
      const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, '');
      if (sanitized.length === 0) {
        log.warn("Secret token became empty after sanitization, ignoring");
        return undefined;
      }
      return sanitized;
    }
    
    return trimmed;
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    const output = { ...target };

    for (const key in source) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key])
      ) {
        output[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        output[key] = source[key];
      }
    }

    // Validate secret token after merge
    if (output.telegram?.secretToken !== undefined) {
      output.telegram.secretToken = this.validateSecretToken(output.telegram.secretToken);
    }

    return output;
  }

  /**
   * Mark which keys have been configured (non-empty)
   */
  private markConfiguredKeys(): void {
    if (this.currentConfig.telegram.botToken)
      this.configuredKeys.add("telegram.botToken");
    if (this.currentConfig.ai.gemini.apiKey)
      this.configuredKeys.add("gemini.apiKey");
    if (this.currentConfig.webhookUrl) this.configuredKeys.add("webhookUrl");
    if (this.currentConfig.n8nTrackingUrl)
      this.configuredKeys.add("n8nTrackingUrl");
  }

  /**
   * Save config to file
   */
  private saveConfigToFile(config: AppConfig): void {
    try {
      const jsonContent = JSON.stringify(config, null, 2);
      fs.writeFileSync(CONFIG_FILE_PATH, jsonContent, "utf-8");
      log.info("Configuration saved to config.json");
    } catch (error: any) {
      log.error(`Failed to save config.json: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get current config
   */
  getConfig(): AppConfig {
    return { ...this.currentConfig };
  }

  /**
   * Get config for UI (with sensitive data masked if configured)
   */
  getConfigForUI(): any {
    const config = this.getConfig();

    return {
      webhookUrl: config.webhookUrl,
      n8nTrackingUrl: config.n8nTrackingUrl || "",
      telegram: {
        botToken: this.configuredKeys.has("telegram.botToken")
          ? this.maskSensitive(config.telegram.botToken)
          : "",
        botMode: config.telegram.botMode,
        secretToken: config.telegram.secretToken
          ? this.maskSensitive(config.telegram.secretToken)
          : "",
      },
      ai: {
        defaultProvider: config.ai.defaultProvider,
        backupAI: config.ai.backupAI,
        temperature: config.ai.temperature,
        gemini: {
          apiKey: this.configuredKeys.has("gemini.apiKey")
            ? this.maskSensitive(config.ai.gemini.apiKey)
            : "",
          model: config.ai.gemini.model,
          titleMaxTokens: config.ai.gemini.titleMaxTokens,
          outlineMaxTokens: config.ai.gemini.outlineMaxTokens,
          articleMaxTokens: config.ai.gemini.articleMaxTokens,
        },
      },
      rateLimit: {
        enabled: config.rateLimit.enabled,
        maxRequestsPerMinute: config.rateLimit.maxRequestsPerMinute,
        aiRequestTimeout: config.rateLimit.aiRequestTimeout,
        aiTitleTimeout: config.rateLimit.aiTitleTimeout,
        aiOutlineTimeout: config.rateLimit.aiOutlineTimeout,
        aiArticleTimeout: config.rateLimit.aiArticleTimeout,
      },
      logging: {
        level: config.logging.level,
      },
      // Include info about which keys are configured
      _configured: Array.from(this.configuredKeys),
    };
  }

  /**
   * Mask sensitive data for display
   */
  private maskSensitive(value: string): string {
    if (!value || value.length < 8) return "***";
    return value.substring(0, 8) + "***" + value.substring(value.length - 4);
  }

  /**
   * Update config at runtime and save to file
   */
  async updateConfig(
    updates: Partial<any>
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      getLogger().info("Updating configuration...");

      // Webhook URL
      if (
        updates.webhookUrl !== undefined &&
        updates.webhookUrl !== this.currentConfig.webhookUrl
      ) {
        try {
          new URL(updates.webhookUrl);
          this.currentConfig.webhookUrl = updates.webhookUrl;
          this.configuredKeys.add("webhookUrl");
          getLogger().info("Webhook URL updated");
        } catch (e) {
          errors.push("Invalid webhook URL");
        }
      }

      // N8N Tracking URL
      if (
        updates.n8nTrackingUrl !== undefined &&
        updates.n8nTrackingUrl !== this.currentConfig.n8nTrackingUrl
      ) {
        if (updates.n8nTrackingUrl === "" || updates.n8nTrackingUrl === null) {
          // Allow empty string to disable tracking
          this.currentConfig.n8nTrackingUrl = "";
          this.configuredKeys.delete("n8nTrackingUrl");
          getLogger().info("N8N Tracking URL cleared");
        } else {
          try {
            new URL(updates.n8nTrackingUrl);
            this.currentConfig.n8nTrackingUrl = updates.n8nTrackingUrl;
            this.configuredKeys.add("n8nTrackingUrl");
            getLogger().info("N8N Tracking URL updated");
          } catch (e) {
            errors.push("Invalid N8N Tracking URL");
          }
        }
      }

      // Telegram settings
      if (updates.telegram) {
        if (
          updates.telegram.botToken &&
          updates.telegram.botToken !==
            this.maskSensitive(this.currentConfig.telegram.botToken)
        ) {
          this.currentConfig.telegram.botToken = updates.telegram.botToken;
          this.configuredKeys.add("telegram.botToken");
          getLogger().info("Telegram bot token updated");
        }

        if (updates.telegram.secretToken !== undefined) {
          const validatedToken = this.validateSecretToken(updates.telegram.secretToken);
          if (validatedToken !== updates.telegram.secretToken) {
            getLogger().warn("Secret token was sanitized/validated during update");
          }
          this.currentConfig.telegram.secretToken = validatedToken;
          getLogger().info("Telegram secret token updated");
        }
      }

      // AI settings
      if (updates.ai) {
        // Default provider
        if (
          updates.ai.defaultProvider &&
          updates.ai.defaultProvider === "gemini"
        ) {
          this.currentConfig.ai.defaultProvider = updates.ai.defaultProvider;
          getLogger().info(
            `Default AI provider set to: ${updates.ai.defaultProvider}`
          );
        }

        // Backup AI
        if (updates.ai.backupAI !== undefined) {
          this.currentConfig.ai.backupAI = updates.ai.backupAI;
          getLogger().info(
            `Backup AI ${updates.ai.backupAI ? "enabled" : "disabled"}`
          );
        }

        // Temperature
        if (updates.ai.temperature !== undefined) {
          const temp = parseFloat(updates.ai.temperature);
          if (!isNaN(temp) && temp >= 0 && temp <= 2) {
            this.currentConfig.ai.temperature = temp;
            getLogger().info(`Temperature set to: ${temp}`);
          } else {
            errors.push("Temperature must be between 0 and 2");
          }
        }

        // Gemini settings
        if (updates.ai.gemini) {
          const gemini = updates.ai.gemini;

          if (
            gemini.apiKey &&
            gemini.apiKey !==
              this.maskSensitive(this.currentConfig.ai.gemini.apiKey)
          ) {
            // Validate API key format (basic check)
            if (gemini.apiKey.length > 0) {
              this.currentConfig.ai.gemini.apiKey = gemini.apiKey;
              this.configuredKeys.add("gemini.apiKey");

              // Reinitialize Gemini service with new key
              try {
                const geminiService = (
                  await import("../services/ai/geminiService")
                ).default;
                const { GoogleGenerativeAI } = require("@google/generative-ai");
                (geminiService as any).client = new GoogleGenerativeAI(
                  gemini.apiKey
                );
                getLogger().info(
                  "Gemini API key updated and service reinitialized"
                );
              } catch (e: any) {
                getLogger().warn(
                  `Failed to reinitialize Gemini service: ${e.message}`
                );
                // Don't add to errors, just log warning - service will be null
                try {
                  const geminiService = (
                    await import("../services/ai/geminiService")
                  ).default;
                  (geminiService as any).client = null;
                } catch {
                  // Ignore if service import fails
                }
              }
            } else {
              errors.push("Invalid Gemini API key");
            }
          }

          if (gemini.model) {
            this.currentConfig.ai.gemini.model = gemini.model;
            getLogger().info(`Gemini model set to: ${gemini.model}`);
          }

          if (gemini.titleMaxTokens !== undefined) {
            const tokens = parseInt(gemini.titleMaxTokens);
            if (!isNaN(tokens) && tokens >= 100 && tokens <= 100000) {
              this.currentConfig.ai.gemini.titleMaxTokens = tokens;
            } else {
              errors.push("Title max tokens must be between 100 and 100000");
            }
          }

          if (gemini.outlineMaxTokens !== undefined) {
            const tokens = parseInt(gemini.outlineMaxTokens);
            if (!isNaN(tokens) && tokens >= 100 && tokens <= 100000) {
              this.currentConfig.ai.gemini.outlineMaxTokens = tokens;
            } else {
              errors.push("Outline max tokens must be between 100 and 100000");
            }
          }

          if (gemini.articleMaxTokens !== undefined) {
            const tokens = parseInt(gemini.articleMaxTokens);
            if (!isNaN(tokens) && tokens >= 100 && tokens <= 100000) {
              this.currentConfig.ai.gemini.articleMaxTokens = tokens;
            } else {
              errors.push("Article max tokens must be between 100 and 100000");
            }
          }
        }
      }

      // Rate limit settings
      if (updates.rateLimit) {
        if (updates.rateLimit.enabled !== undefined) {
          this.currentConfig.rateLimit.enabled = updates.rateLimit.enabled;
          getLogger().info(
            `Rate limiting ${updates.rateLimit.enabled ? "enabled" : "disabled"}`
          );
        }

        if (updates.rateLimit.maxRequestsPerMinute !== undefined) {
          const max = parseInt(updates.rateLimit.maxRequestsPerMinute);
          if (!isNaN(max) && max >= 1 && max <= 1000) {
            this.currentConfig.rateLimit.maxRequestsPerMinute = max;
            getLogger().info(`Max requests per minute set to: ${max}`);
          } else {
            errors.push("Max requests per minute must be between 1 and 1000");
          }
        }

        if (updates.rateLimit.aiRequestTimeout !== undefined) {
          const timeout = parseInt(updates.rateLimit.aiRequestTimeout);
          if (!isNaN(timeout) && timeout >= 1000 && timeout <= 3600000) {
            this.currentConfig.rateLimit.aiRequestTimeout = timeout;
          } else {
            errors.push("AI request timeout must be between 1000 and 3600000");
          }
        }

        if (updates.rateLimit.aiTitleTimeout !== undefined) {
          const timeout = parseInt(updates.rateLimit.aiTitleTimeout);
          if (!isNaN(timeout) && timeout >= 1000 && timeout <= 3600000) {
            this.currentConfig.rateLimit.aiTitleTimeout = timeout;
          }
        }

        if (updates.rateLimit.aiOutlineTimeout !== undefined) {
          const timeout = parseInt(updates.rateLimit.aiOutlineTimeout);
          if (!isNaN(timeout) && timeout >= 1000 && timeout <= 3600000) {
            this.currentConfig.rateLimit.aiOutlineTimeout = timeout;
          }
        }

        if (updates.rateLimit.aiArticleTimeout !== undefined) {
          const timeout = parseInt(updates.rateLimit.aiArticleTimeout);
          if (!isNaN(timeout) && timeout >= 1000 && timeout <= 3600000) {
            this.currentConfig.rateLimit.aiArticleTimeout = timeout;
          }
        }
      }

      // Logging settings
      if (updates.logging?.level) {
        const validLevels = ["info", "warn", "error", "debug"];
        if (validLevels.includes(updates.logging.level)) {
          this.currentConfig.logging.level = updates.logging.level;
          getLogger().info(`Log level set to: ${updates.logging.level}`);
        } else {
          errors.push("Invalid log level");
        }
      }

      // Save to file
      if (errors.length === 0) {
        this.saveConfigToFile(this.currentConfig);
        getLogger().info(
          "Configuration updated successfully and saved to file"
        );
        return { success: true, errors: [] };
      } else {
        getLogger().warn(
          `Configuration updated with errors: ${errors.join(", ")}`
        );
        return { success: false, errors };
      }
    } catch (error: any) {
      getLogger().error(`Failed to update configuration: ${error.message}`);
      errors.push(error.message);
      return { success: false, errors };
    }
  }

  /**
   * Check if a key is configured
   */
  isConfigured(key: string): boolean {
    return this.configuredKeys.has(key);
  }
}

// Export singleton
export default new ConfigManager();
