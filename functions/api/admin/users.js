import { requireAdmin } from "../../_lib/admin.js";
import { json } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(env, request);

  if (auth.response) {
    return auth.response;
  }

  const result = await env.DB.prepare(
    `SELECT id, nickname, email, created_at
     FROM users
     ORDER BY created_at DESC
     LIMIT 100`
  ).all();

  return json({
    users: result.results.map((user) => ({
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      time: formatTime(user.created_at),
    })),
  });
}

function formatTime(value) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
