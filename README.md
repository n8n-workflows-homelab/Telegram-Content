# Telegram AI Content Bot

A Telegram bot that automatically generates high-quality content using Claude AI, with the ability to send results to webhooks for further processing in n8n or other systems.

## Author

**Stephen Sang**

## Project Goals

This project is built with the following main goals:

1. **Automated AI Content Generation**: Use Claude AI to generate high-quality content (titles, outlines, complete articles)
2. **Webhook Integration**: Automatically send generated content to webhook URLs
3. **n8n Integration**: Webhooks can connect to n8n for further processing, storage, or content distribution

### Workflow

```
[User on Telegram]
    ↓
[Bot receives request]
    ↓
[Claude AI generates content]
    ↓
[Send to Webhook]
    ↓
[n8n processes further]
```

## Key Features

- 🤖 **Claude AI Integration**: Uses Claude 3.5 Sonnet model for high-quality content generation
- 🔄 **Backup AI Provider**: Automatically switches to OpenRouter if Claude encounters issues
- 📝 **Diverse Content Generation**:
  - Generate 10 article title suggestions
  - Detailed outlines with target analysis
  - Complete articles with SEO metadata
- 🪝 **Webhook Integration**: Automatically sends results to webhooks (n8n/custom server)
- 💬 **Telegram Bot**: Simple interface, interact via messages
- ⚡ **Rate Limiting**: Protects API and prevents spam
- 🔄 **Retry Logic**: Automatically retries on network errors
- 📊 **Logging**: Detailed activity tracking
- 🎛️ **Web UI**: Visual configuration interface
- 🚀 **Dual Operation Modes**: Webhook or Polling
- 🔒 **Security**: No sensitive data in logs, masked API keys in UI

## Technology Stack

- **Backend**: Node.js + TypeScript
- **Framework**: Express.js
- **AI Provider**:
  - Anthropic Claude AI (primary)
  - OpenRouter AI (backup)
- **Bot Framework**: node-telegram-bot-api
- **Cache**: NodeCache / Redis
- **Logging**: Pino
- **Validation**: Zod
- **Security**: Helmet.js

## Installation

### System Requirements

- Node.js >= 18.0.0
- npm or yarn
- Telegram Bot Token
- Claude API Key or OpenRouter API Key

### Installation Steps

1. **Clone repository**

```bash
git clone <repository-url>
cd Telegram-Content
```

2. **Install dependencies**

```bash
npm install
```

3. **Build project**

```bash
npm run build
```

4. **Configuration**

Access the Web UI at `http://localhost:3000` after starting to configure:

- Telegram Bot Token
- Claude API Key or OpenRouter API Key
- Webhook URL (if needed)

Or manually create a `config.json` file (see structure below).

5. **Run the bot**

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

Or use PM2:

```bash
pm2 start ecosystem.config.js
```

## Configuration

### config.json Structure

```json
{
  "nodeEnv": "production",
  "port": 3000,
  "webhookUrl": "https://your-n8n-webhook-url.com/webhook",
  "telegram": {
    "botToken": "YOUR_TELEGRAM_BOT_TOKEN",
    "botMode": "polling",
    "secretToken": "optional-secret-token-for-webhook-mode"
  },
  "ai": {
    "defaultProvider": "claude",
    "backupAI": true,
    "claude": {
      "apiKey": "sk-ant-...",
      "model": "claude-sonnet-4-5-20250929",
      "titleMaxTokens": 2000,
      "outlineMaxTokens": 8000,
      "articleMaxTokens": 25000,
      "inputPrice": 3.0,
      "outputPrice": 15.0
    },
    "openRouter": {
      "apiKey": "sk-or-...",
      "model": "anthropic/claude-sonnet-4.5"
    },
    "temperature": 0.7
  },
  "rateLimit": {
    "enabled": true,
    "maxRequestsPerMinute": 10,
    "aiRequestTimeout": 600000,
    "aiTitleTimeout": 180000,
    "aiOutlineTimeout": 360000,
    "aiArticleTimeout": 600000
  },
  "logging": {
    "level": "info"
  }
}
```

## Usage

### Telegram Commands

- `/start` - Start using the bot
- `/help` - Show help instructions
- `/generate <topic>` - Start content generation
- `/cancel` - Cancel current process
- `/stats` - View usage statistics

### Content Generation Process

1. **Send `/generate` command followed by the topic**

   ```
   /generate how to make Vietnamese banh mi
   ```

2. **Bot generates 10 title suggestions**
   - Select a title by replying with a number from 1-10

3. **Bot generates detailed outline**

4. **Bot generates complete article**

5. **Complete article is sent to webhook**

### Webhook Payload

When sending to n8n, the payload has the following structure:

**Outline**:

```json
{
  "type": "outline",
  "data": {
    "outline": {
      "inference": {
        "targetKeyword": "target keyword",
        "targetAudience": "target audience",
        "contentPurpose": "content purpose",
        "estimatedWordCount": "2000-2500 words"
      },
      "outline": [
        {
          "heading": "Main heading",
          "subheadings": ["Subheading 1", "Subheading 2"],
          "notes": "Notes"
        }
      ]
    }
  },
  "userId": "123456789",
  "chatId": 123456789
}
```

**Article**:

```json
{
  "type": "article",
  "data": {
    "article": {
      "content": "Full article content...",
      "metaDescription": "SEO description",
      "wordCount": 2345,
      "suggestedTags": ["tag1", "tag2", "tag3"]
    }
  },
  "userId": "123456789",
  "chatId": 123456789
}
```

## Project Structure

```
Telegram-Content/
├── src/
│   ├── app.ts                      # Entry point
│   ├── config/                     # Configuration management
│   │   ├── configManager.ts
│   │   └── index.ts
│   ├── controllers/                # Controllers
│   │   ├── configController.ts
│   │   └── telegramController.ts
│   ├── services/
│   │   ├── ai/                     # AI services
│   │   │   ├── aiRouter.ts
│   │   │   ├── claudeService.ts
│   │   │   └── openRouterService.ts
│   │   ├── content/                # Content generation
│   │   │   ├── contentService.ts
│   │   │   └── conversationManager.ts
│   │   └── telegram/               # Telegram services
│   │       ├── botManager.ts
│   │       └── telegramService.ts
│   ├── prompts/                    # AI prompts
│   │   ├── titleGenerator.ts
│   │   ├── outlineGenerator.ts
│   │   └── articleGenerator.ts
│   ├── utils/                      # Utilities
│   │   ├── webhook.ts              # Webhook sender
│   │   ├── logger.ts
│   │   ├── rateLimiter.ts
│   │   ├── retry.ts
│   │   ├── timeout.ts
│   │   ├── validation.ts
│   │   └── pricing.ts
│   └── types/                      # TypeScript types
├── public/                         # Web UI
│   ├── index.html
│   └── config.js
├── dist/                           # Compiled code
├── config.json                     # Runtime config (do not commit)
├── ecosystem.config.js             # PM2 config
├── package.json
└── tsconfig.json
```

## Troubleshooting

### Bot Not Responding

1. Check Bot Token in `config.json` or Web UI
2. Check logs: `pm2 logs telegram-content-bot` or view console output
3. Try restart: `pm2 restart telegram-content-bot`
4. Verify bot mode (polling/webhook) is correct

### Webhook Send Failure

1. Verify webhook URL is correct
2. Check if n8n server is running
3. View detailed logs about webhook errors
4. Bot will automatically retry 3 times with 3s delay
5. Verify webhook server returns HTTP 200 OK

### AI Timeout

1. Increase `aiRequestTimeout` in config
2. Reduce `maxTokens` as appropriate
3. Check network connection to API
4. Verify API key is valid

### Rate Limit

1. Adjust `maxRequestsPerMinute` in config
2. Disable rate limit: `"enabled": false`
3. Check logs to see which user is rate limited

### API Errors

1. Verify API key format is correct (Claude: `sk-ant-...`, OpenRouter: `sk-or-...`)
2. Check API account balance/credit
3. Verify model name is correct
4. View detailed logs for specific errors

## Security

### Security Measures Implemented

- ✅ **Helmet.js** for security headers
- ✅ **Secret token for webhook** (optional, recommended for production)
- ✅ **Rate limiting** to protect API
- ✅ **Input validation** with Zod
- ✅ **Environment variables** for sensitive data (recommended)
- ✅ **Masked API keys** in Web UI
- ✅ **No sensitive data in logs** (tokens, API keys, full user messages)
- ✅ **Sanitized error logs** to prevent information leakage
- ⚠️ **Do not commit `config.json`** to git (already in .gitignore)

### Security Recommendations

1. **Use environment variables** instead of storing in `config.json`:
   - `TELEGRAM_BOT_TOKEN`
   - `CLAUDE_API_KEY`
   - `OPENROUTER_API_KEY`
   - `WEBHOOK_URL`

2. **Enable secret token** for webhook mode in production

3. **Restrict Web UI access** (can add authentication)

4. **Use HTTPS** for webhook URL in production

5. **Regular security audits** and dependency updates

## Performance

- ✅ Caching with NodeCache/Redis
- ✅ Retry logic with exponential backoff
- ✅ Timeout for API requests
- ✅ Graceful shutdown
- ✅ Error recovery
- ✅ Connection pooling
- ✅ Rate limiting to prevent overload

## Development

### Scripts

```bash
# Development mode with hot reload
npm run dev

# Build TypeScript
npm run build

# Start production
npm start

# Lint code
npm run lint

# Format code
npm run format
```

### Environment Variables

You can use environment variables instead of config.json:

```bash
export TELEGRAM_BOT_TOKEN="your-token"
export CLAUDE_API_KEY="your-key"
export OPENROUTER_API_KEY="your-key"
export WEBHOOK_URL="https://your-webhook.com"
```

## License

MIT License

## Contact & Support

**Author**: Stephen Sang

If you encounter issues or have questions, please create an issue on the GitHub repository.

---

**Note**: This project uses Claude AI - please comply with Anthropic's [Terms of Service](https://www.anthropic.com/legal/aup) when using.
