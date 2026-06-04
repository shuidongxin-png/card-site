import { getCurrentUser, json } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await getCurrentUser(env, request);

  return json({ user });
}
