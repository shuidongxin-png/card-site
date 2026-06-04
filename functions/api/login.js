import {
  getSessionExpiry,
  hashPassword,
  json,
  makeSessionCookie,
  makeSessionId,
  normalizeText,
  readJson,
} from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);

  if (!body) {
    return json({ error: "请求格式不正确。" }, 400);
  }

  const loginName = normalizeText(body.loginName, 80).toLowerCase();
  const password = String(body.password || "");

  if (!loginName || !password) {
    return json({ error: "请输入账号和密码。" }, 400);
  }

  const user = await env.DB.prepare(
    "SELECT id, nickname, email, password_hash, password_salt FROM users WHERE lower(email) = ? OR lower(nickname) = ?"
  )
    .bind(loginName, loginName)
    .first();

  if (!user) {
    return json({ error: "账号或密码不对。" }, 401);
  }

  const passwordHash = await hashPassword(password, user.password_salt);

  if (passwordHash !== user.password_hash) {
    return json({ error: "账号或密码不对。" }, 401);
  }

  const sessionId = makeSessionId();
  const expiresAt = getSessionExpiry();

  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(sessionId, user.id, expiresAt.toISOString())
    .run();

  return json(
    { user: { id: user.id, nickname: user.nickname, email: user.email } },
    200,
    { "Set-Cookie": makeSessionCookie(request, sessionId, expiresAt) }
  );
}
