const GALLERY_KEY_PATTERN = /^gallery\/(skill|award)\/[a-zA-Z0-9._-]+$/;

export async function onRequestGet(context) {
  return serveMedia(context, false);
}

export async function onRequestHead(context) {
  return serveMedia(context, true);
}

async function serveMedia({ request, env }, headOnly) {
  if (!env.GALLERY_BUCKET) {
    return new Response("媒体存储尚未配置。", { status: 503 });
  }

  const key = new URL(request.url).searchParams.get("key") || "";

  if (!GALLERY_KEY_PATTERN.test(key)) {
    return new Response("无效的资源键。", { status: 400 });
  }

  let object;

  try {
    object = await env.GALLERY_BUCKET.get(key);
  } catch {
    return new Response("媒体存储暂时不可用。", { status: 502 });
  }

  if (!object) {
    return new Response("文件不存在。", { status: 404 });
  }

  const etag = object.httpEtag || object.etag || "";

  if (etag && matchesEtag(request.headers.get("If-None-Match"), etag)) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);

  if (etag) {
    headers.set("ETag", etag);
  }

  if (Number.isFinite(object.size)) {
    headers.set("Content-Length", String(object.size));
  }

  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Content-Disposition", "inline");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(headOnly ? null : object.body, { headers });
}

function matchesEtag(headerValue, etag) {
  const expected = normalizeEtag(etag);

  return String(headerValue || "")
    .split(",")
    .some((candidate) => candidate.trim() === "*" || normalizeEtag(candidate) === expected);
}

function normalizeEtag(value) {
  return String(value || "")
    .trim()
    .replace(/^W\//i, "")
    .replace(/^"|"$/g, "");
}
