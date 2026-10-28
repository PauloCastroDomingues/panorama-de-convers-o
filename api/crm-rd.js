const Rd = require("../assets/crm-rd.js");

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "private, no-store");
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  const endpoint = process.env.RD_SHEETS_API_URL;
  const token = process.env.RD_SHEETS_READ_TOKEN;
  const accountId = process.env.RD_ACCOUNT_ID;
  if (!endpoint || !token || !accountId) return response.status(503).json({ ok: false, error: "rd_bridge_not_configured" });
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.hostname !== "script.google.com" || !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname) || url.username || url.password || url.port) throw new Error("invalid_endpoint");
    url.search = "";
    url.searchParams.set("token", token);
    const upstream = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!upstream.ok) throw new Error("rd_upstream_unavailable");
    const length = Number(upstream.headers.get("content-length"));
    if (length > 3000000) throw new Error("rd_response_too_large");
    const reader = upstream.body.getReader();
    const parts = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 3000000) throw new Error("rd_response_too_large");
        parts.push(Buffer.from(part.value));
      }
    } finally { await reader.cancel(); }
    const snapshot = Rd.sanitizeSnapshot(JSON.parse(Buffer.concat(parts).toString("utf8")));
    if (snapshot.source.accountId !== accountId) throw new Error("rd_account_mismatch");
    return response.status(200).json(snapshot);
  } catch (error) {
    return response.status(502).json({ ok: false, error: "rd_sheet_read_failed" });
  }
};
