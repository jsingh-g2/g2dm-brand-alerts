const https = require("https");
const http = require("http");

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;

const FEEDS = [
  { name: "Shortlist",       emoji: "📋", url: "https://www.google.com/alerts/feeds/05794880774342406386/3778807884745421878" },
  { name: "Jaipal Singh",    emoji: "👤", url: "https://www.google.com/alerts/feeds/05794880774342406386/224840658207423743" },
  { name: "David Jani",      emoji: "👤", url: "https://www.google.com/alerts/feeds/05794880774342406386/16907128923538642082" },
  { name: "ines Bahr",       emoji: "👤", url: "https://www.google.com/alerts/feeds/05794880774342406386/16185658615866520749" },
  { name: "andrew blair",    emoji: "👤", url: "https://www.google.com/alerts/feeds/05794880774342406386/16907128923538644034" },
  { name: "GetApp",          emoji: "🏆", url: "https://www.google.com/alerts/feeds/05794880774342406386/9766896802491772037" },
  { name: "Software Advice", emoji: "🏆", url: "https://www.google.com/alerts/feeds/05794880774342406386/542332304367136774" },
  { name: "Capterra",        emoji: "🏆", url: "https://www.google.com/alerts/feeds/05794880774342406386/542332304367138522" },
];

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

// Extract the real URL from Google's redirect wrapper
function extractRealUrl(href) {
  try {
    const match = href.match(/[?&]url=([^&]+)/);
    if (match) return decodeURIComponent(match[1]);
    return href;
  } catch {
    return href;
  }
}

// Extract domain from URL for source display
function extractDomain(url) {
  try {
    const domain = new URL(url).hostname.replace("www.", "");
    return domain;
  } catch {
    return "unknown source";
  }
}

// Clean HTML tags and entities from text
function cleanText(text) {
  return text
    .replace(/<b>/gi, "*").replace(/<\/b>/gi, "*")  // bold → Slack bold
    .replace(/<[^>]+>/g, "")                          // remove other HTML tags
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&middot;/g, "·")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEntries(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
    const id      = (block.match(/<id>([^<]+)<\/id>/) || [])[1] || "";
    const rawTitle = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || "No title";
    const href    = (block.match(/href="([^"]+)"/) || [])[1] || "";
    const pub     = (block.match(/<published>([^<]+)<\/published>/) || [])[1] || "";
    const rawContent = (block.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || "";

    const title = cleanText(rawTitle);
    const content = cleanText(rawContent).slice(0, 180);
    const realUrl = extractRealUrl(href);
    const source = extractDomain(realUrl);

    entries.push({ id, title, href: realUrl, pub, content, source });
  }
  return entries;
}

function formatDate(pubStr) {
  try {
    return new Date(pubStr).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZoneName: "short"
    });
  } catch {
    return pubStr;
  }
}

function postToSlack(feed, entry) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${feed.emoji} *<${entry.href}|${entry.title}>*`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: entry.content ? `_${entry.content}_` : "_No preview available_",
          },
        },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: `🔍 *${feed.name}*` },
            { type: "mrkdwn", text: `🌐 ${entry.source}` },
            { type: "mrkdwn", text: `📅 ${formatDate(entry.pub)}` },
          ],
        },
        { type: "divider" },
      ],
    });

    const url = new URL(SLACK_WEBHOOK);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function postDailySummary(results) {
  return new Promise((resolve, reject) => {
    const now = new Date().toLocaleString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric"
    });
    const totalNew = results.reduce((sum, r) => sum + (r.count || 0), 0);

    const feedLines = results.map(r =>
      r.error
        ? `• ${r.emoji} ${r.feed}: ⚠️ error`
        : `• ${r.emoji} *${r.feed}*: ${r.count} result${r.count !== 1 ? "s" : ""}`
    ).join("\n");

    const payload = JSON.stringify({
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "📡 G2DM Daily Brand Alert Report" },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${now}*\n${totalNew} new mention${totalNew !== 1 ? "s" : ""} found across all keywords`,
          },
        },
        { type: "divider" },
        {
          type: "section",
          text: { type: "mrkdwn", text: feedLines },
        },
        { type: "divider" },
      ],
    });

    const url = new URL(SLACK_WEBHOOK);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  if (!SLACK_WEBHOOK) {
    console.error("❌ SLACK_WEBHOOK_URL environment variable not set");
    process.exit(1);
  }

  console.log(`\n🚀 G2DM Brand Alert Check — ${new Date().toLocaleString()}`);
  console.log("=".repeat(50));

  const results = [];

  // Post summary header first
  for (const feed of FEEDS) {
    try {
      const xml = await fetchUrl(feed.url);
      const entries = parseEntries(xml);
      console.log(`[${feed.name}] ${entries.length} entries found`);
      results.push({ feed: feed.name, emoji: feed.emoji, count: entries.length });

      for (const entry of entries) {
        await postToSlack(feed, entry);
        console.log(`  ✓ Sent: ${entry.title.slice(0, 60)}`);
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      console.error(`[${feed.name}] ❌ Error: ${err.message}`);
      results.push({ feed: feed.name, emoji: feed.emoji, error: err.message });
    }
  }

  // Post daily summary at the end
  await postDailySummary(results);

  const total = results.reduce((sum, r) => sum + (r.count || 0), 0);
  console.log(`\n✅ Done! ${total} alerts sent to Slack.`);
}

main();
