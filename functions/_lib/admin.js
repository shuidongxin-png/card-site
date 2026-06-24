import { getCurrentUser, json } from "./auth.js";

export async function requireAdmin(env, request) {
  const user = await getCurrentUser(env, request);

  if (!user) {
    return { response: json({ error: "请先登录。" }, 401) };
  }

  const adminEmails = getAdminEmails(env);

  if (!adminEmails.length) {
    return { response: json({ error: "管理员邮箱还没有配置。" }, 403) };
  }

  if (!adminEmails.includes(String(user.email || "").toLowerCase())) {
    return { response: json({ error: "没有管理员权限。" }, 403) };
  }

  return { user };
}

function getAdminEmails(env) {
  return String(env.ADMIN_EMAILS || env.ADMIN_EMAIL || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}
