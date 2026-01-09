import axios, { AxiosResponse } from "axios";
import logger from "./logger";
import { withRetry } from "./retry";
import telegramService from "../services/telegram/telegramService";

interface WebhookPayload {
  type:
    | "outline"
    | "article"
    | "titles"
    | "titles_error"
    | "outline_error"
    | "article_error";
  data: any;
  userId: string;
  chatId: number;
}

/**
 * Validate webhook payload before sending
 */
function validateWebhookPayload(payload: WebhookPayload): void {
  if (!payload) {
    throw new Error("Webhook payload is null or undefined");
  }

  const validTypes = [
    "outline",
    "article",
    "titles",
    "titles_error",
    "outline_error",
    "article_error",
  ];
  if (!payload.type || !validTypes.includes(payload.type)) {
    throw new Error(
      `Invalid payload type. Must be one of: ${validTypes.join(", ")}`
    );
  }

  if (!payload.data) {
    throw new Error("Payload data is null or undefined");
  }

  if (!payload.userId || typeof payload.userId !== "string") {
    throw new Error("Invalid userId in payload");
  }

  if (!payload.chatId || typeof payload.chatId !== "number") {
    throw new Error("Invalid chatId in payload");
  }

  // Type-specific validation
  if (payload.type === "outline") {
    if (!payload.data.outline || typeof payload.data.outline !== "object") {
      throw new Error("Invalid outline data structure");
    }
  } else if (payload.type === "article") {
    if (!payload.data.article || typeof payload.data.article !== "object") {
      throw new Error("Invalid article data structure");
    }
  } else if (payload.type === "titles") {
    // Titles payload validation (optional, for future use)
    if (!payload.data.titles || !Array.isArray(payload.data.titles)) {
      throw new Error("Invalid titles data structure");
    }
  } else if (payload.type.endsWith("_error")) {
    // Error payloads - just need error object
    if (!payload.data.error || typeof payload.data.error !== "object") {
      throw new Error("Invalid error data structure");
    }
  }
}

/**
 * Gửi webhook với cơ chế retry và thông báo Telegram khi thất bại.
 * @param url URL của webhook
 * @param payload Dữ liệu gửi đi
 * @param taskName Tên tác vụ (dàn ý/bài viết)
 * @param chatId ID chat Telegram để thông báo
 */
export async function sendWebhookWithRetry(
  url: string,
  payload: WebhookPayload,
  taskName: string,
  chatId: number
): Promise<void> {
  const maxRetries = 3;
  const delayMs = 3000; // 3 giây

  logger.info(`Starting webhook send for ${taskName} to ${url}`);
  logger.debug(
    `Webhook payload type: ${payload.type}, userId: ${payload.userId}, chatId: ${payload.chatId}`
  );

  // Validate payload before sending
  try {
    validateWebhookPayload(payload);
    logger.info("Webhook payload validation passed");
  } catch (validationError: any) {
    logger.error(
      `Webhook payload validation failed: ${validationError.message}`
    );
    logger.error(`Validation error stack: ${validationError.stack}`);

    // Notify user about validation error
    try {
      await telegramService.sendMessage(
        chatId,
        `❌ *Lỗi nội bộ*\n\nDữ liệu ${taskName} không hợp lệ. Vui lòng liên hệ admin.\n\nChi tiết: ${validationError.message}`,
        { parse_mode: "Markdown" }
      );
    } catch (notifyError: any) {
      logger.error(
        `Failed to notify user about validation error: ${notifyError.message}`
      );
    }

    throw new Error(`Invalid webhook payload: ${validationError.message}`);
  }

  try {
    await withRetry(
      async () => {
        logger.info(`Attempting webhook send for ${taskName}...`);

        try {
          const response: AxiosResponse = await axios.post(url, payload.data, {
            timeout: 10000, // 10 giây timeout
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "Telegram-SEO-Bot/1.0",
            },
          });

          if (response.status !== 200) {
            // Nếu không phải 200, coi là thất bại và retry
            logger.warn(
              `Webhook for ${taskName} failed with status ${response.status}. Will retry.`
            );
            logger.debug(
              `Response data: ${JSON.stringify(response.data).substring(0, 200)}`
            );
            throw new Error(
              `Webhook failed with status code ${response.status}`
            );
          }

          logger.info(
            `✅ Webhook for ${taskName} sent successfully (Status 200)`
          );
          logger.debug(
            `Response: ${JSON.stringify(response.data).substring(0, 100)}`
          );
          return response;
        } catch (axiosError: any) {
          // Log detailed request information
          const requestDetails = {
            method: "POST",
            url: url,
            payload: payload.data,
            payloadType: payload.type,
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "Telegram-SEO-Bot/1.0",
            },
          };

          // Enhanced error logging for different error types
          if (axiosError.code === "ECONNREFUSED") {
            logger.error(`Connection refused to webhook URL: ${url}`);
            logger.error(`Request details: ${JSON.stringify(requestDetails, null, 2)}`);
            throw new Error("Webhook server connection refused");
          } else if (
            axiosError.code === "ETIMEDOUT" ||
            axiosError.code === "ECONNABORTED"
          ) {
            logger.error(`Webhook request timeout for ${taskName}`);
            logger.error(`Request details: ${JSON.stringify(requestDetails, null, 2)}`);
            throw new Error("Webhook request timeout");
          } else if (axiosError.response) {
            logger.error(
              `Webhook server returned error: ${axiosError.response.status}`
            );
            logger.error(`Request details: ${JSON.stringify(requestDetails, null, 2)}`);
            logger.error(
              `Error response: ${JSON.stringify(axiosError.response.data).substring(0, 200)}`
            );
            // Store request details in error for later use
            (axiosError as any).requestDetails = requestDetails;
            throw axiosError;
          } else {
            logger.error(`Webhook request error: ${axiosError.message}`);
            logger.error(`Request details: ${JSON.stringify(requestDetails, null, 2)}`);
            // Store request details in error for later use
            (axiosError as any).requestDetails = requestDetails;
            throw axiosError;
          }
        }
      },
      {
        maxRetries: maxRetries,
        baseDelay: delayMs,
        maxDelay: delayMs, // Không dùng exponential backoff, giữ nguyên 3s
        taskName: `Gửi webhook ${taskName}`,
      }
    );

    logger.info(`✅ Webhook send completed successfully for ${taskName}`);
  } catch (error: any) {
    // Prepare detailed request information
    const requestDetails = (error.requestDetails || {
      method: "POST",
      url: url,
      payload: payload.data,
      payloadType: payload.type,
    }) as {
      method: string;
      url: string;
      payload: any;
      payloadType: string;
    };

    // Sanitize payload for logging (limit size)
    const sanitizedPayload = JSON.stringify(requestDetails.payload);
    const payloadPreview = sanitizedPayload.length > 500 
      ? sanitizedPayload.substring(0, 500) + "... (truncated)" 
      : sanitizedPayload;

    // Log detailed error information
    logger.error(`=`.repeat(50));
    logger.error(
      `WEBHOOK SEND FAILED for ${taskName} after ${maxRetries} retries`
    );
    logger.error(`Request Method: ${requestDetails.method}`);
    logger.error(`Request URL: ${requestDetails.url}`);
    logger.error(`Payload Type: ${requestDetails.payloadType}`);
    logger.error(`Payload (preview): ${payloadPreview}`);
    logger.error(`Error: ${error.message}`);
    if (error.response) {
      logger.error(`Response Status: ${error.response.status}`);
      logger.error(`Response Data: ${JSON.stringify(error.response.data).substring(0, 300)}`);
    }
    if (error.code) {
      logger.error(`Error Code: ${error.code}`);
    }
    logger.error(`Error stack: ${error.stack}`);
    logger.error(`=`.repeat(50));

    // Prepare detailed error message for user
    let errorDetails = `❌ *Lỗi gửi kết quả*\n\n`;
    errorDetails += `Hệ thống đã tạo xong ${taskName} nhưng không thể gửi kết quả đến máy chủ của bạn sau ${maxRetries} lần thử.\n\n`;
    errorDetails += `*Chi tiết request:*\n`;
    errorDetails += `• Method: \`${requestDetails.method}\`\n`;
    errorDetails += `• URL: \`${requestDetails.url}\`\n`;
    errorDetails += `• Payload Type: \`${requestDetails.payloadType}\`\n\n`;
    errorDetails += `*Lỗi:*\n`;
    errorDetails += `\`${error.message}\`\n\n`;
    
    if (error.response) {
      errorDetails += `*Response từ server:*\n`;
      errorDetails += `• Status: \`${error.response.status}\`\n`;
      if (error.response.data) {
        const responsePreview = JSON.stringify(error.response.data).substring(0, 200);
        errorDetails += `• Data: \`${responsePreview}${responsePreview.length >= 200 ? '...' : ''}\`\n`;
      }
      errorDetails += `\n`;
    }
    
    errorDetails += `*Payload (preview):*\n`;
    errorDetails += `\`\`\`json\n${payloadPreview.substring(0, 300)}${payloadPreview.length >= 300 ? '...' : ''}\n\`\`\`\n\n`;
    errorDetails += `Vui lòng kiểm tra lại URL webhook và đảm bảo máy chủ của bạn trả về HTTP 200 OK.`;

    // Gửi thông báo thất bại về Telegram cho người dùng đang tương tác
    try {
      await telegramService.sendMessage(
        chatId,
        errorDetails,
        { parse_mode: "Markdown" }
      );
    } catch (notifyError: any) {
      logger.error(
        `Failed to notify user about webhook error: ${notifyError.message}`
      );
      logger.error(`Notify error stack: ${notifyError.stack}`);
    }

    // Don't throw - we've already logged and notified user
    // This prevents the error from bubbling up and potentially crashing the bot
  }
}
