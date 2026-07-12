import { json } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB) {
    return json({ items: [] });
  }

  const url = new URL(request.url);
  const kind = String(url.searchParams.get("kind") || "").trim();

  if (kind && kind !== "skill" && kind !== "award") {
    return json({ error: "kind 参数无效。" }, 400);
  }

  try {
    const result = kind
      ? await env.DB.prepare(
          `SELECT id, kind, title, tag, description, image_key, image_url, sort_order, created_at
           FROM gallery_items
           WHERE kind = ?
           ORDER BY sort_order DESC, created_at DESC
           LIMIT 50`
        )
          .bind(kind)
          .all()
      : await env.DB.prepare(
          `SELECT id, kind, title, tag, description, image_key, image_url, sort_order, created_at
           FROM gallery_items
           ORDER BY sort_order DESC, created_at DESC
           LIMIT 100`
        ).all();

    return json({
      items: (result.results || []).map(mapGalleryItem),
    });
  } catch {
    // Table may not exist yet before migration is applied
    return json({ items: [] });
  }
}

function mapGalleryItem(item) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    tag: item.tag || "",
    description: item.description || "",
    imageKey: item.image_key,
    imageUrl: item.image_url,
    sortOrder: item.sort_order,
    createdAt: item.created_at,
  };
}
