import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import path from "path";
import TelegramBot from "node-telegram-bot-api";
import { Server } from "http";
import { config } from "./config";
import logger from "./utils/logger";
import telegramService from "./services/telegram/telegramService";
import botManager from "./services/telegram/botManager";
import telegramController from "./controllers/telegramController";
import configController from "./controllers/configController";
import rateLimiter from "./utils/rateLimiter";

const app = express();

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable for local development
  })
);
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "../public")));

/**
 * Handle bot commands and messages (shared between webhook and polling modes)
 */
async function handleBotMessage(msg: TelegramBot.Message): Promise<void> {
  try {
    const userId = msg.from?.id || "unknown";
    const chatId = msg.chat.id;

    // Handle commands
    if (msg.text?.startsWith("/")) {
      const command = msg.text.split(" ")[0].toLowerCase();
      logger.info(
        `Processing command: ${command} from user ${userId} in chat ${chatId}`
      );

      switch (command) {
        case "/start":
          await telegramController.handleStart(msg);
          break;
        case "/help":
          await telegramController.handleHelp(msg);
          break;
        case "/generate":
          await telegramController.handleGenerate(msg);
          break;
        case "/cancel":
          await telegramController.handleCancel(msg);
          break;
        case "/stats":
          await telegramController.handleStats(msg);
          break;
        default:
          logger.warn(`Unknown command: ${command} from user ${userId}`);
          await telegramService.sendMessage(
            msg.chat.id,
            "❓ Lệnh không hợp lệ. Dùng /help để xem danh sách lệnh."
          );
      }
    } else {
      // Handle regular messages
      logger.debug(`Processing message from user ${userId} in chat ${chatId}`);
      await telegramController.handleMessage(msg);
    }
  } catch (error: any) {
    const userId = msg.from?.id || "unknown";
    logger.error(
      `Critical error in handleBotMessage for user ${userId}: ${error.message}`
    );
    logger.error(`Error stack: ${error.stack}`);

    // Try to notify user safely
    if (msg.chat && msg.chat.id) {
      try {
        await telegramService.sendMessage(
          msg.chat.id,
          "❌ Đã xảy ra lỗi không mong muốn. Vui lòng thử lại sau hoặc liên hệ admin."
        );
      } catch (notifyError: any) {
        logger.error(
          `Failed to notify user about error: ${notifyError.message}`
        );
      }
    }
  }
}

/**
 * Setup message handlers for polling mode
 * This will be called on initial start and on bot restart
 */
function setupPollingHandlers(bot: TelegramBot): void {
  logger.info("Setting up polling message handlers");

  bot.on("message", async (msg: TelegramBot.Message) => {
    try {
      // Validate message has a valid sender
      if (!msg.from || !msg.from.id) {
        logger.warn("Received message without valid sender information");
        return;
      }

      // [UPDATE] Thêm Rate Limit cho chế độ Polling
      const userId = msg.from.id.toString();
      const rateLimit = rateLimiter.checkLimit(userId);
      if (!rateLimit.allowed) {
        logger.info(`Rate limit exceeded (Polling) for user ${userId}`);
        if (msg.chat && msg.chat.id) {
          await bot.sendMessage(
            msg.chat.id,
            `⏳ *Giới hạn tốc độ*\n\nBạn thao tác quá nhanh. Vui lòng thử lại sau ${rateLimit.retryAfter} giây.`,
            { parse_mode: "Markdown" }
          );
        }
        return;
      }

      await handleBotMessage(msg);
    } catch (error: any) {
      logger.error(`Unexpected error in message handler: ${error.message}`);
      // Don't re-throw - keep bot running
    }
  });

  // Handle polling errors to prevent bot crash
  bot.on("polling_error", (error: any) => {
    if (
      error.code === "EFATAL" ||
      error.message?.includes("ECONNRESET") ||
      error.message?.includes("ETIMEDOUT") ||
      error.message?.includes("409 Conflict") // Handle conflict error explicitly
    ) {
      logger.warn(
        `Telegram polling connection issue: ${error.code || error.message} - will auto-retry`
      );
    } else {
      logger.error(`Polling error: ${error.message}`);
    }
  });

  bot.on("webhook_error", (error: Error) => {
    logger.error(`Webhook error in polling mode: ${error.message}`);
  });

  logger.info("Polling handlers setup completed");
}

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Config management API endpoints
app.get("/api/config", configController.getConfig.bind(configController));
app.post("/api/config", configController.updateConfig.bind(configController));
app.get(
  "/api/config/defaults",
  configController.getDefaults.bind(configController)
);

// Webhook endpoint for Telegram
app.post(
  `/webhook/${config.telegram.botToken}`,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Validate secret token if configured
      if (
        config.telegram.secretToken &&
        config.telegram.secretToken.length > 0
      ) {
        const receivedToken = req.headers["x-telegram-bot-api-secret-token"];
        if (receivedToken !== config.telegram.secretToken) {
          logger.warn(
            `Webhook request with invalid secret token from IP: ${req.ip}`
          );
          res.status(403).json({ error: "Forbidden" });
          return;
        }
      }

      // Always respond 200 to Telegram to prevent retries
      res.sendStatus(200);

      const update: TelegramBot.Update = req.body;

      // Log update info without sensitive data
      // ... (giữ nguyên logic log an toàn)

      // Handle callback queries
      if (update.callback_query) {
        // Có thể thêm xử lý callback ở đây
        logger.info("Callback query received");
        return;
      }

      // Handle messages
      if (update.message) {
        if (!update.message.from || !update.message.from.id) {
          return;
        }

        // Check rate limit for this user
        const userId = update.message.from.id.toString();
        const rateLimit = rateLimiter.checkLimit(userId);
        if (!rateLimit.allowed) {
          logger.info(`Rate limit exceeded for user ${userId}`);
          await telegramService.sendMessage(
            update.message.chat.id,
            `⏳ *Giới hạn tốc độ*\n\nBạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ${rateLimit.retryAfter} giây.`
          );
          return;
        }

        await handleBotMessage(update.message);
      }
    } catch (error: any) {
      logger.error(`Critical webhook error: ${error.message}`);
      logger.error(`Error stack: ${error.stack}`);
    }
  }
);

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ error: "Internal server error" });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

/**
 * Start server with error handling for port conflicts
 */
async function startServer(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      logger.info(`Server listening on port ${port}`);
      resolve(server);
    });

    server.on("error", (error: any) => {
      if (error.code === "EADDRINUSE") {
        logger.error(`❌ Port ${port} is already in use!`);
        reject(error);
      } else {
        reject(error);
      }
    });
  });
}

/**
 * Initialize and start the application
 */
async function start() {
  try {
    logger.info("Starting Telegram SEO Content Bot...");

    // Setup handlers for Polling Mode
    if (config.telegram.botMode === "polling") {
      botManager.setHandlerSetup(setupPollingHandlers);
    }

    // Initialize bot
    const bot = await botManager.startBot();

    // Mode: POLLING
    if (bot && config.telegram.botMode === "polling") {
      logger.info("🚀 POLLING MODE STARTUP");
      // ... giữ nguyên log

      await startServer(config.port);
      logger.info(
        `Web Configuration UI running at: http://localhost:${config.port}`
      );
    }
    // Mode: WEBHOOK
    else if (bot) {
      logger.info("🚀 WEBHOOK MODE STARTUP");

      // Set webhook
      // [QUAN TRỌNG] Đảm bảo URL này khớp với config Nginx
      const webhookUrl = `${config.webhookUrl}/webhook/${config.telegram.botToken}`;
      const webhookOptions: any = { url: webhookUrl };

      if (config.telegram.secretToken) {
        webhookOptions.secret_token = config.telegram.secretToken;
      }

      logger.info(`Setting webhook to: ${webhookUrl}`);

      // Xóa webhook cũ trước khi set mới để tránh lỗi Conflict
      await bot.deleteWebHook();
      await bot.setWebHook(webhookUrl, webhookOptions);

      logger.info("✅ Webhook configured successfully");

      await startServer(config.port);
      logger.info("✨ Bot is listening for webhooks on port " + config.port);
    }
    // Mode: CONFIG-ONLY
    else {
      logger.info("🌐 CONFIG-ONLY MODE STARTUP");
      await startServer(config.port);
    }

    // Graceful shutdown logic (giữ nguyên)
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down...`);
      try {
        await botManager.stopBot();
        const rateLimiter = (await import("./utils/rateLimiter")).default;
        rateLimiter.destroy();
        const conversationManager = (
          await import("./services/content/conversationManager")
        ).default;
        conversationManager.destroy();
      } catch (e: any) {
        logger.error(`Shutdown error: ${e.message}`);
      }
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error: any) {
    logger.error("FATAL ERROR - Application failed to start");
    logger.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

export default app;
