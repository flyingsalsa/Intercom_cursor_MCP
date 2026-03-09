import http from "http";
import crypto from "crypto";
import { sendReply } from "./tools/intercom/send-reply.js";

const TTL_MS = 15 * 60 * 1000; // 15 minutes Time to live

export interface ReviewSession {
  conversation_id: string;
  conversation: unknown;
  contact: unknown | null;
  body: string;
  createdAt: number;
}

const store = new Map<string, ReviewSession>();

function pruneExpired() {
  const now = Date.now();
  for (const [token, session] of store.entries()) {
    if (now - session.createdAt > TTL_MS) store.delete(token);
  }
}

export function createReviewSession(data: Omit<ReviewSession, "createdAt">): string {
  pruneExpired();
  const token = crypto.randomBytes(16).toString("hex");
  store.set(token, { ...data, createdAt: Date.now() });
  return token;
}

export function getReviewSession(token: string): ReviewSession | null {
  const session = store.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > TTL_MS) {
    store.delete(token);
    return null;
  }
  return session;
}

export function deleteReviewSession(token: string): void {
  store.delete(token);
}

const REVIEW_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Review reply</title>
  <style>
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; }
    body { font-family: system-ui, sans-serif; padding: 1.5rem; background: #f5f5f5; max-width: none; }
    .container { max-width: min(1600px, 98vw); margin: 0 auto; height: calc(100vh - 3rem); display: flex; flex-direction: column; }
    h1 { font-size: 1.25rem; margin: 0 0 1rem 0; }
    .thread { background: #fff; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; flex: 1; min-height: 200px; overflow-y: auto; }
    .msg { margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid #eee; }
    .msg:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
    .msg .author { font-weight: 600; font-size: 0.875rem; color: #333; }
    .msg .date { font-size: 0.75rem; color: #666; }
    .msg .body { margin-top: 0.25rem; font-size: 0.9rem; line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
    .msg .body :first-child { margin-top: 0; }
    .msg .body img { max-width: 100%; height: auto; display: block; }
    label { display: block; font-weight: 600; margin-bottom: 0.5rem; font-size: 0.9rem; }
    textarea { width: 100%; min-height: 140px; padding: 0.75rem; border: 1px solid #ccc; border-radius: 6px; font: inherit; resize: vertical; }
    .actions { margin-top: 1rem; display: flex; gap: 0.75rem; align-items: center; }
    button { padding: 0.5rem 1rem; border-radius: 6px; font: inherit; cursor: pointer; border: none; }
    button.primary { background: #0066cc; color: #fff; }
    button.primary:hover { background: #0052a3; }
    button.primary:disabled { background: #999; cursor: not-allowed; }
    .error { color: #c00; font-size: 0.9rem; margin-top: 0.5rem; }
    .success { color: #080; font-size: 0.9rem; margin-top: 0.5rem; }
    .contact-panel h3 { font-size: 0.9rem; margin: 0 0 0.5rem 0; color: #333; }
    .contact-panel .row { font-size: 0.8rem; margin-bottom: 0.35rem; word-break: break-all; }
    .contact-panel .label { color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Review reply <span id="conversationId" style="font-weight:normal;color:#666;font-size:0.9em"></span></h1>
    <div id="loading">Loading conversation…</div>
    <div id="content" style="display:none;flex:1;min-height:0;flex-direction:column;overflow:hidden">
    <div style="display:flex;gap:1rem;flex:1;min-height:0;overflow:hidden">
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;overflow:hidden">
        <div class="thread" id="thread"></div>
        <form id="form">
      <label for="draft">Your reply (customer will see this)</label>
      <textarea id="draft" name="body"></textarea>
      <div id="message"></div>
      <div class="actions">
        <button type="submit" class="primary" id="sendBtn">Send to customer</button>
      </div>
    </form>
      </div>
      <div id="contactPanel" class="contact-panel" style="display:none;flex:0 0 320px;background:#fff;border-radius:8px;padding:1rem;overflow-y:auto;align-self:stretch"></div>
    </div>
  </div>
  <div id="sent" style="display:none">
    <p class="success">Reply sent. You can close this tab.</p>
  </div>
  </div>
  <script>
    const token = new URLSearchParams(location.search).get('token');
    if (!token) {
      document.getElementById('loading').textContent = 'Missing token.';
      throw new Error('no token');
    }
    fetch('/api/review/' + token)
      .then(r => { if (!r.ok) throw new Error(r.status === 404 ? 'Session expired or invalid' : r.statusText); return r.json(); })
      .then(data => {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'flex';
        const convId = document.getElementById('conversationId');
        if (convId && data.conversation_id) convId.textContent = '(#' + data.conversation_id + ')';
        const thread = document.getElementById('thread');
        (data.conversation.messages || []).forEach(m => {
          const div = document.createElement('div');
          div.className = 'msg';
          const headerHtml =
            '<div class="author">' + escapeHtml(m.author || m.author_type || '') + '</div>' +
            '<div class="date">' + escapeHtml(m.created_at || '') + '</div>';
          const bodyDiv = document.createElement('div');
          bodyDiv.className = 'body';
          if (m.body) {
            if (/<[a-z][\\s\\S]*>/i.test(m.body)) {
              bodyDiv.innerHTML = m.body;
            } else {
              bodyDiv.innerHTML = escapeHtml(m.body).replace(/\\n/g, '<br>');
            }
          }
          div.innerHTML = headerHtml;
          div.appendChild(bodyDiv);
          thread.appendChild(div);
        });
        document.getElementById('draft').value = data.draftBody || '';
        const contact = data.contact;
        const panel = document.getElementById('contactPanel');
        if (contact && panel) {
          panel.style.display = 'block';
          const s = contact.summary || {};
          const u = contact.utm || {};
          const rows = [
            ['Email', s.email],
            ['Name', s.name],
            ['User ID', s.user_id],
            ['Wallet', s.wallet_address],
            ['Safe address', s.safe_address],
            ['App version', s.app_version],
            ['Device', s.device],
            ['Referrer', contact.referrer || s.referrer],
            ['UTM source', u.source || s.utm_source],
            ['UTM medium', u.medium || s.utm_medium],
            ['UTM campaign', u.campaign || s.utm_campaign],
          ].filter(function(r) { return r[1]; });
          panel.innerHTML = '<h3>Contact details</h3>' + rows.map(function(r) {
            return '<div class="row"><span class="label">' + escapeHtml(r[0]) + ':</span> ' + escapeHtml(String(r[1])) + '</div>';
          }).join('');
        }
        document.getElementById('form').onsubmit = function(e) {
          e.preventDefault();
          var btn = document.getElementById('sendBtn');
          var msg = document.getElementById('message');
          btn.disabled = true;
          msg.textContent = '';
          msg.className = '';
          fetch('/api/send/' + token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: document.getElementById('draft').value })
          })
            .then(r => r.json().then(j => ({ ok: r.ok, j })))
            .then(({ ok, j }) => {
              if (ok && j.success) {
                document.getElementById('content').style.display = 'none';
                document.getElementById('sent').style.display = 'block';
                try {
                  // Give the user a moment to see success, then close the tab.
                  setTimeout(() => window.close(), 1500);
                } catch (e) {
                  // Ignore if the browser disallows programmatic close.
                }
              } else {
                msg.className = 'error';
                msg.textContent = j.message || j.error || 'Send failed.';
                btn.disabled = false;
              }
            })
            .catch(err => {
              msg.className = 'error';
              msg.textContent = err.message || 'Request failed.';
              btn.disabled = false;
            });
        };
      })
      .catch(err => {
        document.getElementById('loading').textContent = err.message || 'Failed to load.';
      });
    function escapeHtml(s) {
      if (s == null) return '';
      var div = document.createElement('div');
      div.textContent = s;
      return div.innerHTML;
    }
  </script>
</body>
</html>
`;

export interface ReviewServerOptions {
  port: number;
  apiKey: string;
  adminId: string;
}

export function createReviewServer(options: ReviewServerOptions): http.Server {
  const { port, apiKey, adminId } = options;

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    const pathMatch = url.match(/^(\/?[^?]*)/);
    const path = pathMatch ? pathMatch[1].replace(/^\//, "") : "";

    const sendJson = (status: number, data: object) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    if (path === "review" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(REVIEW_HTML);
      return;
    }

    const apiReviewMatch = path.match(/^api\/review\/([a-f0-9]+)$/);
    if (apiReviewMatch && req.method === "GET") {
      const token = apiReviewMatch[1];
      const session = getReviewSession(token);
      if (!session) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Session expired or invalid" }));
        return;
      }
      sendJson(200, {
        conversation_id: session.conversation_id,
        conversation: session.conversation,
        contact: session.contact,
        draftBody: session.body,
      });
      return;
    }

    const apiSendMatch = path.match(/^api\/send\/([a-f0-9]+)$/);
    if (apiSendMatch && req.method === "POST") {
      const token = apiSendMatch[1];
      const session = getReviewSession(token);
      if (!session) {
        sendJson(404, { error: "Session expired or invalid" });
        return;
      }
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        let parsed: { body?: string };
        try {
          parsed = JSON.parse(body || "{}");
        } catch {
          sendJson(400, { error: "Invalid JSON" });
          return;
        }
        const replyBody = typeof parsed.body === "string" ? parsed.body : "";
        sendReply(
          { conversation_id: session.conversation_id, body: replyBody },
          apiKey,
          adminId,
        )
          .then((result) => {
            deleteReviewSession(token);
            sendJson(200, { success: true, conversation_id: result.conversation_id });
          })
          .catch((err: Error) => {
            sendJson(500, {
              error: err.message || "Failed to send reply",
              message: err.message,
            });
          });
      });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  return server;
}

export function startReviewServer(options: ReviewServerOptions): Promise<http.Server> {
  const server = createReviewServer(options);
  return new Promise((resolve, reject) => {
    server.listen(options.port, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}
