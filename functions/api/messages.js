import { getCurrentUser, json, normalizeText, readJson } from "../_lib/auth.js";

export async function onRequestGet({ env }) {
  const result = await env.DB.prepare(
    `SELECT messages.id, messages.user_id, messages.name, messages.message, messages.created_at,
            users.nickname, users.email
     FROM messages
     LEFT JOIN users ON users.id = messages.user_id
     ORDER BY messages.created_at DESC
     LIMIT 20`
  ).all();

  return json({
    messages: result.results.map((item) => ({
      id: item.id,
      name: item.name || item.nickname || maskEmail(item.email) || "访客",
      message: item.message,
      time: formatTime(item.created_at),
      userId: item.user_id,
    })),
  });
}

export async function onRequestPost({ request, env }) {
  const user = await getCurrentUser(env, request);

  if (!user) {
    return json({ error: "请先登录后再留言。" }, 401);
  }

  const body = await readJson(request);

  if (!body) {
    return json({ error: "请求格式不正确。" }, 400);
  }

  const name = normalizeText(body.name || user.nickname, 32);
  const message = normalizeText(body.message, 500);

  if (!message) {
    return json({ error: "留言内容不能为空。" }, 400);
  }

  await env.DB.prepare("INSERT INTO messages (user_id, name, message) VALUES (?, ?, ?)")
    .bind(user.id, name, message)
    .run();

  return json({ ok: true }, 201);
}

export async function onRequestDelete({ request, env }) {
  const user = await getCurrentUser(env, request);

  if (!user) {
    return json({ error: "请先登录。" }, 401);
  }

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));

  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: "留言不存在。" }, 400);
  }

  const result = await env.DB.prepare("DELETE FROM messages WHERE id = ? AND user_id = ?")
    .bind(id, user.id)
    .run();

  if (!result.meta.changes) {
    return json({ error: "只能删除自己发布的留言。" }, 403);
  }

  return json({ ok: true });
}

function formatTime(value) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function maskEmail(value) {
  if (!value || !value.includes("@")) {
    return "";
  }

  const [name, domain] = value.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}
