const fetch = require("node-fetch");
const fs = require("fs");
require("dotenv").config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const filePath = "api/enhanced_domains.json";
const sentFile = "sent_domains.json";

function getDomains() {
  const data = fs.readFileSync(filePath, "utf8");
  return JSON.parse(data);
}

function getSentDomains() {
  if (!fs.existsSync(sentFile)) return [];
  const content = fs.readFileSync(sentFile, "utf8");
  try {
    return JSON.parse(content);
  } catch {
    return [];
  }
}

function saveSentDomains(domains) {
  fs.writeFileSync(sentFile, JSON.stringify(domains, null, 2));
}

function formatMessage(domain, stars) {
  return `🌟 *${stars}-Sterne Domain gefunden!*\n\n` +
         `🌐 *Domain:* ${domain.domain}\n` +
         `💸 *Preis:* $${domain.price}\n` +
         `📅 *Alter:* ${domain.age}\n` +
         `🔗 *Backlinks:* ${domain.backlinks}\n` +
         `💡 *Wiederverkaufswert:* ${domain.resale_value}\n` +
         `[👉 Jetzt kaufen](${domain.link})`;
}

async function sendMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: "Markdown"
    })
  });

  const json = await res.json();
  if (!json.ok) {
    console.error("❌ Fehler beim Senden:", json);
  } else {
    console.log("✅ Nachricht erfolgreich gesendet!");
  }
}

(async () => {
  const allDomains = getDomains();
  const sent = getSentDomains();

  for (const [category, domains] of Object.entries(allDomains)) {
    const stars = category.replace("feed-", "").replace("star", "");
    
    for (const domain of domains) {
      if (sent.includes(domain.domain)) continue;

      const message = formatMessage(domain, stars);
      await sendMessage(message);
      
      sent.push(domain.domain);
      saveSentDomains(sent);
    }
  }
})();

