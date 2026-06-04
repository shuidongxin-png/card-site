const SESSION_COOKIE = "card_site_session";
const SESSION_DAYS = 7;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function normalizeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function makeSessionCookie(request, sessionId, expiresAt) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly${secure}; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function getSessionId(request) {
  const cookie = request.headers.get("Cookie") || "";
  const pairs = cookie.split(";").map((part) => part.trim());
  const found = pairs.find((part) => part.startsWith(`${SESSION_COOKIE}=`));

  return found ? found.slice(SESSION_COOKIE.length + 1) : "";
}

export function makeSessionId() {
  return randomBase64Url(32);
}

export function makeSalt() {
  return randomBase64Url(16);
}

export function getSessionExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);
  return expiresAt;
}

export async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      iterations: 120000,
    },
    key,
    256
  );

  return bytesToBase64Url(new Uint8Array(bits));
}

export async function getCurrentUser(env, request) {
  const sessionId = getSessionId(request);

  if (!sessionId) {
    return null;
  }

  return env.DB.prepare(
    `SELECT users.id, users.nickname, users.email
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ? AND sessions.expires_at > ?`
  )
    .bind(sessionId, new Date().toISOString())
    .first();
}

function randomBase64Url(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
