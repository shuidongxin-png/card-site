import { clearSessionCookie, getSessionId, json } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const sessionId = getSessionId(request);

  if (sessionId) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  }

  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}
