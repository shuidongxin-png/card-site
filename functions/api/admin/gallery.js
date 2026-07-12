import { requireAdmin } from "../../_lib/admin.js";
import { json, normalizeText } from "../../_lib/auth.js";

const MAX_BYTES = Math.floor(4.5 * 1024 * 1024);
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(env, request);

  if (auth.response) {
    return auth.response;
  }

  try {
    const result = await env.DB.prepare(
      `SELECT id, kind, title, tag, description, image_key, image_url, sort_order, created_at
       FROM gallery_items
       ORDER BY created_at DESC
       LIMIT 100`
    ).all();

    return json({
      items: (result.results || []).map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        tag: item.tag || "",
        description: item.description || "",
        imageKey: item.image_key,
        imageUrl: item.image_url,
        sortOrder: item.sort_order,
        createdAt: item.created_at,
      })),
    });
  } catch {
    return json({ items: [], error: "请先执行 migrations/0002_gallery.sql" });
  }
}

export async function onRequestPost({ request, env }) {
  const auth = await requireAdmin(env, request);

  if (auth.response) {
    return auth.response;
  }

  if (!env.GALLERY_BUCKET) {
    return json(
      {
        error:
          "尚未绑定 R2（GALLERY_BUCKET）。请在 wrangler.toml 配置 R2 后重新部署。",
      },
      503
    );
  }

  if (!env.DB) {
    return json({ error: "D1 数据库尚未绑定。" }, 503);
  }

  let form;

  try {
    form = await request.formData();
  } catch {
    return json({ error: "请求格式不正确。" }, 400);
  }

  const kind = String(form.get("kind") || "").trim();
  const title = normalizeText(form.get("title"), 80);
  const tag = normalizeText(form.get("tag"), 32) || (kind === "skill" ? "作品" : "证书");
  const description = normalizeText(form.get("description"), 200);
  const file = form.get("file");

  if (kind !== "skill" && kind !== "award") {
    return json({ error: "类型必须是 skill 或 award。" }, 400);
  }

  if (!title) {
    return json({ error: "请填写标题。" }, 400);
  }

  if (!file || typeof file === "string" || !file.stream) {
    return json({ error: "请选择图片文件。" }, 400);
  }

  if (!file.size) {
    return json({ error: "图片文件不能为空。" }, 400);
  }

  const contentType = String(file.type || "application/octet-stream");

  if (!ALLOWED_TYPES.has(contentType)) {
    return json({ error: "仅支持 JPG / PNG / WebP / GIF。" }, 400);
  }

  if (file.size > MAX_BYTES) {
    return json({ error: "图片请小于 4.5MB。" }, 400);
  }

  const ext = extensionForType(contentType);
  const imageKey = `gallery/${kind}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  try {
    await env.GALLERY_BUCKET.put(imageKey, file.stream(), {
      httpMetadata: {
        contentType,
        contentDisposition: "inline",
        cacheControl: "public, max-age=31536000, immutable",
      },
      customMetadata: {
        kind,
        title,
        uploadedBy: String(auth.user.email || "").slice(0, 120),
      },
    });
  } catch {
    return json({ error: "图片写入 R2 失败，请稍后重试。" }, 502);
  }

  const publicBase = String(env.GALLERY_PUBLIC_BASE || "").replace(/\/$/, "");
  const imageUrl = publicBase
    ? `${publicBase}/${imageKey}`
    : `/api/media?key=${encodeURIComponent(imageKey)}`;

  try {
    const inserted = await env.DB.prepare(
      `INSERT INTO gallery_items (kind, title, tag, description, image_key, image_url, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id, kind, title, tag, description, image_key, image_url, sort_order, created_at`
    )
      .bind(kind, title, tag, description, imageKey, imageUrl, Date.now())
      .first();

    return json(
      {
        ok: true,
        item: {
          id: inserted.id,
          kind: inserted.kind,
          title: inserted.title,
          tag: inserted.tag || "",
          description: inserted.description || "",
          imageKey: inserted.image_key,
          imageUrl: inserted.image_url,
          sortOrder: inserted.sort_order,
          createdAt: inserted.created_at,
        },
      },
      201
    );
  } catch {
    // Cleanup orphan object if DB insert fails
    try {
      await env.GALLERY_BUCKET.delete(imageKey);
    } catch {
      /* ignore */
    }

    return json(
      {
        error: "写入数据库失败。请确认已执行 migrations/0002_gallery.sql。",
      },
      500
    );
  }
}

export async function onRequestDelete({ request, env }) {
  const auth = await requireAdmin(env, request);

  if (auth.response) {
    return auth.response;
  }

  const id = Number(new URL(request.url).searchParams.get("id"));

  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: "项目不存在。" }, 400);
  }

  let row;

  try {
    row = await env.DB.prepare(
      "SELECT id, image_key FROM gallery_items WHERE id = ?"
    )
      .bind(id)
      .first();
  } catch {
    return json({ error: "数据库未就绪。" }, 500);
  }

  if (!row) {
    return json({ error: "项目不存在。" }, 404);
  }

  await env.DB.prepare("DELETE FROM gallery_items WHERE id = ?").bind(id).run();

  if (env.GALLERY_BUCKET && row.image_key) {
    try {
      await env.GALLERY_BUCKET.delete(row.image_key);
    } catch {
      /* ignore storage cleanup errors */
    }
  }

  return json({ ok: true });
}

function extensionForType(type) {
  switch (type) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}
