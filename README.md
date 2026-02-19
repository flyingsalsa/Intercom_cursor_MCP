# Intercom MCP Server

An [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) server that connects [Cursor](https://cursor.com/) to Intercom. Use it from Cursor to list conversations, read threads, draft and send replies, and pull in your support response templates.

## Tools

Each tool is exposed to Cursor (and any MCP client) when this server is running. Prefer **draft_reply** for AI-generated text so a human can review before the customer sees anything.

### Read-only tools

- **search_conversations** — Search and filter Intercom conversations by state (`open`, `closed`, `snoozed`), date range (`created_after`, `created_before`, `updated_after`, `updated_before`), and source type (email, chat, push, etc.). Returns a paginated list with conversation IDs, titles, previews, and metadata. Use this to find conversations that match criteria (e.g. “open conversations updated in the last 7 days”).

- **get_conversation** — Fetch one conversation by ID. Returns the full message thread (who said what, when), contact info, and conversation stats (e.g. time to first reply, reopen count). Use this to read the full context before drafting or sending a reply.

- **get_unreplied_conversations** — Returns open conversations where the **last message is from the customer** (i.e. no agent reply yet). Helps prioritize which conversations need a response. You can cap how many open conversations are fetched per page.

- **get_new_messages** — Poll for new or updated conversations since the last time you checked. Uses a high-water mark: the first call returns conversations from the last hour; later calls return only newer activity. Optional `reset` flag resets the mark to “now”. Useful for “what’s new since I last looked?” workflows.

- **get_templates** — Reads your support template document (e.g. `templates/responses.md`) and returns the full text: agent persona, vocabulary rules, and workflow templates. Use this so the AI can suggest or draft replies that match your tone and playbooks.

### Draft (internal note)

- **draft_reply** — Adds an **internal admin note** to a conversation. The **customer does not see it**. The note is signed with `- cursor MCP` at the end. Use this for AI-generated reply text: the agent reviews and edits in Intercom, then either sends manually from Intercom or uses **send_reply** with the final text. Safe to allow the model to call.

### Send reply (customer-visible)

- **send_reply** — Sends a **customer-visible reply** to a conversation. The message is posted immediately as an agent reply; the customer sees it in the conversation.

  **Do not add send_reply to the allowlist unless you are extremely sure the model is correct.**  
  If the model can call **send_reply** without human approval, it can send wrong, off-brand, or inappropriate messages directly to customers. Prefer keeping **send_reply** off the allowlist and having humans send the final reply from Intercom (or approve each use). Use **draft_reply** for AI output and only send after review.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- Intercom API access (API token and an admin/agent ID for sending replies)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Copy the example env file and set your Intercom credentials:

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Description |
|----------|-------------|
| `INTERCOM_API_KEY` | Your Intercom API token (required). |
| `INTERCOM_ADMIN_ID` | Intercom admin/agent ID used as the author of replies and notes (required). |
| `TEMPLATE_DOC_PATH` | Path to your response templates file (default: `./templates/responses.md`). |

### 3. Build

```bash
npm run build
```

### 4. Configure Cursor to use this MCP server

Copy the example MCP config and point Cursor at this project:

```bash
cp .cursor/mcp.example.json .cursor/mcp.json
```

Edit `.cursor/mcp.json` so the server runs from this repo (use an absolute path to `dist/index.js` if needed) and that `env` includes your real `INTERCOM_API_KEY` and `INTERCOM_ADMIN_ID`. Example:

```json
{
  "mcpServers": {
    "intercom": {
      "command": "node",
      "args": ["/path/to/Cursor MCP/dist/index.js"],
      "env": {
        "INTERCOM_API_KEY": "your_intercom_api_token_here",
        "INTERCOM_ADMIN_ID": "your_admin_id_here",
        "TEMPLATE_DOC_PATH": "./templates/responses.md"
      }
    }
  }
}
```

Restart Cursor (or reload the MCP server) so it picks up the config and the built server.

## Usage in Cursor

Once the MCP server is running in Cursor, you can ask the AI to:

- “Fetch all unreplied Intercom conversations and draft replies.”
- “Get conversation 123456 and suggest a reply using the templates.”
- “Search open conversations updated in the last 7 days.”
- “Draft a reply to conversation 123456 with: [your message].”

Drafts created with **draft_reply** appear in Intercom as internal notes and end with `- cursor MCP`. Review and edit them in Intercom, then send the final reply from Intercom (or via **send_reply** if you have it enabled). **Do not add send_reply to the allowlist unless you are extremely sure the model is correct** — use draft-first and human review to avoid sending wrong or off-brand messages to customers.

## Response templates

The **get_templates** tool reads `templates/responses.md` (or the path in `TEMPLATE_DOC_PATH`). Use it to store:

- Support agent persona and tone
- Vocabulary rules (e.g. trading vs gambling wording)
- Workflows for common cases (deposits, payouts, KYC, bugs, etc.)

The AI can use this when suggesting or drafting replies so they match your style and playbooks.

## Project structure

```
├── src/
│   ├── index.ts              # MCP server and tool registration
│   ├── lib/
│   │   └── intercom-client.ts # Intercom API client
│   └── tools/
│       ├── draft-reply.ts    # Internal note (draft)
│       ├── send-reply.ts     # Customer-visible reply
│       ├── get-conversation.ts
│       ├── get-unreplied-conversations.ts
│       ├── get-new-messages.ts
│       ├── get-templates.ts
│       └── search-conversations.ts
├── templates/
│   └── responses.md          # Support templates (persona, workflows)
├── .env.example
├── .cursor/
│   └── mcp.example.json      # Example Cursor MCP config
└── package.json
```

## Scripts

| Command | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm start` | Run the server (`node dist/index.js`). |
| `npm run dev` | Run `tsc --watch` for development. |

## License

Private / internal use. Adjust as needed for your setup.
