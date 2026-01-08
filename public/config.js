// Configuration Management UI
const API_BASE = "";

// State
let currentConfig = null;

// DOM Elements
const form = document.getElementById("config-form");
const btnSave = document.getElementById("btn-save");
const btnReset = document.getElementById("btn-reset");
const alertContainer = document.getElementById("alert-container");

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadConfig();

  form.addEventListener("submit", handleSubmit);
  btnReset.addEventListener("click", handleReset);
});

/**
 * Load current configuration
 */
async function loadConfig() {
  try {
    showLoading(true);

    const response = await fetch(`${API_BASE}/api/config`);
    const data = await response.json();

    if (data.success) {
      currentConfig = data.config;
      populateForm(currentConfig);
      showAlert("success", "Đã tải cấu hình thành công!");
    } else {
      showAlert("error", "Không thể tải cấu hình: " + data.error);
    }
  } catch (error) {
    console.error("Failed to load config:", error);
    showAlert("error", "Lỗi kết nối đến server. Vui lòng kiểm tra lại.");
  } finally {
    showLoading(false);
  }
}

/**
 * Populate form with config data
 */
function populateForm(config) {
  if (!config) {
    console.error("Config is undefined or null");
    return;
  }

  // Telegram
  setValue("telegram-botToken", config.telegram?.botToken || "");
  setValue("telegram-secretToken", config.telegram?.secretToken || "");

  // Webhook
  setValue("webhookUrl", config.webhookUrl || "");
  setValue("n8nTrackingUrl", config.n8nTrackingUrl || "");

  // AI
  setValue("ai-defaultProvider", config.ai?.defaultProvider || "");
  setValue("ai-backupAI", config.ai?.backupAI || false, "checkbox");
  setValue("ai-temperature", config.ai?.temperature || "");

  // Claude
  setValue("ai-claude-apiKey", config.ai.claude?.apiKey || "");
  setValue("ai-claude-model", config.ai.claude?.model || "");
  setValue("ai-claude-titleMaxTokens", config.ai.claude?.titleMaxTokens || "");
  setValue(
    "ai-claude-outlineMaxTokens",
    config.ai.claude?.outlineMaxTokens || ""
  );
  setValue(
    "ai-claude-articleMaxTokens",
    config.ai.claude?.articleMaxTokens || ""
  );
  setValue("ai-claude-inputPrice", config.ai.claude?.inputPrice || "");
  setValue("ai-claude-outputPrice", config.ai.claude?.outputPrice || "");

  // OpenRouter
  setValue("ai-openRouter-apiKey", config.ai.openRouter?.apiKey || "");
  setValue("ai-openRouter-model", config.ai.openRouter?.model || "");

  // Gemini
  setValue("ai-gemini-apiKey", config.ai.gemini?.apiKey || "");
  setValue("ai-gemini-model", config.ai.gemini?.model || "");
  setValue("ai-gemini-titleMaxTokens", config.ai.gemini?.titleMaxTokens || "");
  setValue(
    "ai-gemini-outlineMaxTokens",
    config.ai.gemini?.outlineMaxTokens || ""
  );
  setValue(
    "ai-gemini-articleMaxTokens",
    config.ai.gemini?.articleMaxTokens || ""
  );

  // Rate Limit
  setValue("rateLimit-enabled", config.rateLimit?.enabled || false, "checkbox");
  setValue(
    "rateLimit-maxRequestsPerMinute",
    config.rateLimit?.maxRequestsPerMinute || ""
  );
  setValue(
    "rateLimit-aiRequestTimeout",
    config.rateLimit?.aiRequestTimeout || ""
  );
  setValue("rateLimit-aiTitleTimeout", config.rateLimit?.aiTitleTimeout || "");
  setValue(
    "rateLimit-aiOutlineTimeout",
    config.rateLimit?.aiOutlineTimeout || ""
  );
  setValue(
    "rateLimit-aiArticleTimeout",
    config.rateLimit?.aiArticleTimeout || ""
  );

  // Logging
  setValue("logging-level", config.logging?.level || "");
}

/**
 * Set value to form element
 */
function setValue(id, value, type = "text") {
  const element = document.getElementById(id);
  if (!element) return;

  if (type === "checkbox") {
    element.checked = value;
  } else {
    element.value = value || "";
  }
}

/**
 * Get value from form element
 */
function getValue(id, type = "text") {
  const element = document.getElementById(id);
  if (!element) return null;

  if (type === "checkbox") {
    return element.checked;
  } else if (type === "number") {
    return element.value ? parseFloat(element.value) : null;
  } else {
    return element.value.trim();
  }
}

/**
 * Handle form submission
 */
async function handleSubmit(e) {
  e.preventDefault();

  try {
    showLoading(true);
    clearAlerts();

    // Collect form data
    const updates = {
      telegram: {
        botToken: getValue("telegram-botToken"),
        secretToken: getValue("telegram-secretToken"),
      },
      webhookUrl: getValue("webhookUrl"),
      n8nTrackingUrl: getValue("n8nTrackingUrl"),
      ai: {
        defaultProvider: getValue("ai-defaultProvider"),
        backupAI: getValue("ai-backupAI", "checkbox"),
        temperature: getValue("ai-temperature", "number"),
        claude: {
          apiKey: getValue("ai-claude-apiKey"),
          model: getValue("ai-claude-model"),
          titleMaxTokens: getValue("ai-claude-titleMaxTokens", "number"),
          outlineMaxTokens: getValue("ai-claude-outlineMaxTokens", "number"),
          articleMaxTokens: getValue("ai-claude-articleMaxTokens", "number"),
          inputPrice: getValue("ai-claude-inputPrice", "number"),
          outputPrice: getValue("ai-claude-outputPrice", "number"),
        },
        openRouter: {
          apiKey: getValue("ai-openRouter-apiKey"),
          model: getValue("ai-openRouter-model"),
        },
        gemini: {
          apiKey: getValue("ai-gemini-apiKey"),
          model: getValue("ai-gemini-model"),
          titleMaxTokens: getValue("ai-gemini-titleMaxTokens", "number"),
          outlineMaxTokens: getValue("ai-gemini-outlineMaxTokens", "number"),
          articleMaxTokens: getValue("ai-gemini-articleMaxTokens", "number"),
        },
      },
      rateLimit: {
        enabled: getValue("rateLimit-enabled", "checkbox"),
        maxRequestsPerMinute: getValue(
          "rateLimit-maxRequestsPerMinute",
          "number"
        ),
        aiRequestTimeout: getValue("rateLimit-aiRequestTimeout", "number"),
        aiTitleTimeout: getValue("rateLimit-aiTitleTimeout", "number"),
        aiOutlineTimeout: getValue("rateLimit-aiOutlineTimeout", "number"),
        aiArticleTimeout: getValue("rateLimit-aiArticleTimeout", "number"),
      },
      logging: {
        level: getValue("logging-level"),
      },
    };

    // Send update request
    const response = await fetch(`${API_BASE}/api/config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    });

    const data = await response.json();

    if (data.success) {
      currentConfig = data.config;
      populateForm(currentConfig);

      // Show different message if bot is restarting
      if (data.botRestarting) {
        showAlert(
          "success",
          "✅ Cấu hình đã được lưu và áp dụng thành công!\n🔄 Telegram bot đang tự động restart để áp dụng token mới.\n⏱️ Vui lòng đợi vài giây để bot khởi động hoàn tất."
        );
      } else {
        showAlert(
          "success",
          "✅ Cấu hình đã được áp dụng thành công! Không cần restart."
        );
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      let errorMsg = "Không thể cập nhật cấu hình";
      if (data.errors && data.errors.length > 0) {
        errorMsg += ":\n• " + data.errors.join("\n• ");
      }
      showAlert("error", errorMsg);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch (error) {
    console.error("Failed to update config:", error);
    showAlert("error", "Lỗi kết nối đến server. Vui lòng kiểm tra lại.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } finally {
    showLoading(false);
  }
}

/**
 * Handle reset button
 */
function handleReset() {
  if (currentConfig) {
    populateForm(currentConfig);
    showAlert("info", "Đã khôi phục giá trị từ cấu hình hiện tại.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    loadConfig();
  }
}

/**
 * Show alert message
 */
function showAlert(type, message) {
  clearAlerts();

  const alert = document.createElement("div");
  alert.className = `alert alert-${type}`;
  alert.textContent = message;

  alertContainer.appendChild(alert);

  // Auto dismiss after 5 seconds for success messages
  if (type === "success" || type === "info") {
    setTimeout(() => {
      alert.remove();
    }, 5000);
  }
}

/**
 * Clear all alerts
 */
function clearAlerts() {
  alertContainer.innerHTML = "";
}

/**
 * Show/hide loading state
 */
function showLoading(isLoading) {
  btnSave.disabled = isLoading;
  btnReset.disabled = isLoading;

  if (isLoading) {
    const originalText = btnSave.innerHTML;
    btnSave.innerHTML = '<span class="loading"></span> Đang xử lý...';
    btnSave.dataset.originalText = originalText;
  } else {
    if (btnSave.dataset.originalText) {
      btnSave.innerHTML = btnSave.dataset.originalText;
    }
  }
}

/**
 * Format masked value for display
 */
function isMaskedValue(value) {
  return value && value.includes("***");
}

/**
 * Validate API key format
 */
function validateApiKey(key, prefix) {
  return key && key.startsWith(prefix);
}
