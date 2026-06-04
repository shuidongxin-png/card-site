import {
  getSessionExpiry,
  hashPassword,
  isEmail,
  json,
  makeSalt,
  makeSessionCookie,
  makeSessionId,
  normalizeEmail,
  normalizeText,
  readJson,
} from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);

  if (!body) {
    return json({ error: "请求格式不正确。" }, 400);
  }

  const nickname = normalizeText(body.nickname, 32);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (!nickname || !isEmail(email) || password.length < 6) {
    return json({ error: "请填写昵称、有效邮箱，并设置至少 6 位密码。" }, 400);
  }

  const existed = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();

  if (existed) {
    return json({ error: "这个邮箱已经注册过了。" }, 409);
  }

  const salt = makeSalt();
  const passwordHash = await hashPassword(password, salt);
  const result = await env.DB.prepare(
    "INSERT INTO users (nickname, email, password_hash, password_salt) VALUES (?, ?, ?, ?)"
  )
    .bind(nickname, email, passwordHash, salt)
    .run();

  const sessionId = makeSessionId();
  const expiresAt = getSessionExpiry();

  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(sessionId, result.meta.last_row_id, expiresAt.toISOString())
    .run();

  return json(
    { user: { id: result.meta.last_row_id, nickname, email } },
    201,
    { "Set-Cookie": makeSessionCookie(request, sessionId, expiresAt) }
  );
}
