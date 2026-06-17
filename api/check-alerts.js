const https = require("https");
const http = require("http");

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;

const FEEDS = [
  { name: "Shortlist",       url: "https://www.google.com/alerts/feeds/05794880774342406386/3778807884745421878" },
  { name: "Jaipal Singh",    url: "https://www.google.com/alerts/feeds/05794880774342406386/224840658207423743" },
  { name: "David Jani",      url: "https://www.google.com/alerts/feeds/05794880774342406386/16907128923538642082" },
  { name: "ines Bahr",       url: "https://www.google.com/alerts/feeds/05794880774342406386/16185658615866520749" },
  { name: "andrew blair",    url: "https://www.google.com/alerts/feeds/05794880774342406386/16907128923538644034" },
  { name: "GetApp",          url: "https://www.google.com/alerts/feeds/05794880774342406386/9766896802491772037" },
  { name: "Software Advice", url: "https://www.google.com/alerts/feeds/05794880774342406386/542332304367136774" },
  { name: "Capterra",        url: "https://www.google.com/alerts/feeds/05794880774342406386/542332304367138522" },
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

function parseEntries(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
    const id      = (block.match(/<id>([^<]+)<\/id>/) || [])[1] || "";
    const title   = (block.match(/<title[^>]*>([^<]+)<\/title>/) || [])[1] || "No title";
    const href    = (block.match(/href="([^"]+)"/) || [])[1] || "";
    const pub     = (block.match(/<published>([^<]+)<\/published>/) || [])[1] || "";
    const content = (block.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [])[1] || "";
    const cleanTitle = title.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    const cleanContent = content.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim().slice(0, 200);
    entries.push({ id, title: cleanTitle, href, pub, content: cleanContent });
  }
  return entries;
}

function postToSlack(feed, entry) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🔔 *Google Alert: ${feed.name}*\n*<${entry.href}|${entry.title}>*`,
          },
        },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: entry.content || "_No preview available_" },
          ],
        },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: `📅 ${new Date(entry.pub).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` },
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

async function postSummaryHeader(totalNew) {
  return new Promise((resolve, reject) => {
    const now = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
    const payload = JSON.stringify({
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "📡 G2DM Daily Brand Alert Summary" },
        },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: `🗓 ${now} • ${totalNew} new result${totalNew !== 1 ? "s" : ""} found across all keywords` },
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

module.exports = async (req, res) => {
  // Secure the endpoint so only Vercel cron can call it
  const authHeader = req.headers["authorization"];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!SLACK_WEBHOOK) {
    return res.status(500).json({ error: "SLACK_WEBHOOK_URL not set" });
  }

  const results = [];
  let totalNew = 0;

  for (const feed of FEEDS) {
    try {
      const xml = await fetchUrl(feed.url);
      const entries = parseEntries(xml);
      results.push({ feed: feed.name, count: entries.length });
      totalNew += entries.length;

      for (const entry of entries) {
        await postToSlack(feed, entry);
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      results.push({ feed: feed.name, error: err.message });
    }
  }

  if (totalNew > 0) {
    await postSummaryHeader(totalNew);
  }

  return res.status(200).json({ success: true, checked: results, totalNew });
};

