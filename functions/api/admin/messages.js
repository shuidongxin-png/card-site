import { requireAdmin } from "../../_lib/admin.js";
import { json } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(env, request);

  if (auth.response) {
    return auth.response;
  }

  const result = await env.DB.prepare(
    `SELECT messages.id, messages.user_id, messages.name, messages.message, messages.created_at,
            users.nickname, users.email
     FROM messages
     LEFT JOIN users ON users.id = messages.user_id
     ORDER BY messages.created_at DESC
     LIMIT 100`
  ).all();

  return json({
    messages: result.results.map((item) => ({
      id: item.id,
      userId: item.user_id,
      name: item.name || item.nickname || maskEmail(item.email) || "访客",
      email: item.email || "",
      message: item.message,
      time: formatTime(item.created_at),
    })),
  });
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireAdmin(env, request);

  if (auth.response) {
    return auth.response;
  }

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));

  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: "留言不存在。" }, 400);
  }

  const result = await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(id).run();

  if (!result.meta.changes) {
    return json({ error: "留言不存在。" }, 404);
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
