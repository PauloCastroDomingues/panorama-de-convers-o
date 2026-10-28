const Sendflow = require("../assets/crm-sendflow.js");

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "private, max-age=60");
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  const endpoint = process.env.SENDFLOW_SHEETS_API_URL;
  const token = process.env.SENDFLOW_SHEETS_READ_TOKEN;
  if (!endpoint || !token) return response.status(503).json({ ok: false, error: "bridge_not_configured" });
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.hostname !== "script.google.com" || !url.pathname.startsWith("/macros/s/")) throw new Error("invalid_endpoint");
    url.searchParams.set("token", token);
    const upstream = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!upstream.ok) throw new Error("upstream_unavailable");
    const data = Sendflow.validate(await upstream.json());
    const pick = (value, fields) => Object.fromEntries(fields.map((field) => [field, value[field] ?? null]));
    return response.status(200).json({ schemaVersion: 1,
      source: { ...pick(data.source, ["spreadsheetId", "name", "releaseId", "releaseName", "timeZone", "extractedAt", "scope", "mode", "includesPersonalData"]), coverage: pick(data.source.coverage, ["start", "end"]) },
      messages: data.messages.map((row) => pick(row, ["releaseId", "actionId", "messageKey", "messageIndex", "sentAt", "date", "type", "recipients", "delivered", "read", "played", "generatedAt"])),
      actions: data.actions.map((row) => pick(row, ["releaseId", "actionId", "sentAt", "date", "success", "groups", "messageCount", "recipients", "delivered", "read", "played", "generatedAt"])),
      movement: data.movement.map((row) => pick(row, ["releaseId", "date", "originalDateKey", "add", "remove", "clicks"])),
    });
  } catch (error) {
    return response.status(502).json({ ok: false, error: "sendflow_sheet_read_failed" });
  }
};
