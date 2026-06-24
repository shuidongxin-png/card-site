import { requireAdmin } from "../../_lib/admin.js";
import { json } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(env, request);

  if (auth.response) {
    return auth.response;
  }

  const [users, messages, sessions, latestMessage] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM users").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM messages").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM sessions WHERE expires_at > ?")
      .bind(new Date().toISOString())
      .first(),
    env.DB.prepare(
      `SELECT messages.created_at, messages.message, users.nickname
       FROM messages
       LEFT JOIN users ON users.id = messages.user_id
       ORDER BY messages.created_at DESC
       LIMIT 1`
    ).first(),
  ]);

  return json({
    admin: {
      nickname: auth.user.nickname,
      email: auth.user.email,
    },
    totals: {
      users: users?.count || 0,
      messages: messages?.count || 0,
      sessions: sessions?.count || 0,
    },
    latestMessage: latestMessage
      ? {
          name: latestMessage.nickname || "访客",
          message: latestMessage.message,
          time: formatTime(latestMessage.created_at),
        }
      : null,
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
