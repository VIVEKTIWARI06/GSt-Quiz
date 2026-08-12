import { json, badRequest } from "../_utils.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("org");
  if (!slug) return badRequest("org query param is required");

  const org = await env.DB.prepare(
    "SELECT id, name, logo_url FROM organizations WHERE id = ? AND active = 1"
  ).bind(slug).first();

  if (!org) return json({ error: "Organization not found" }, 404);
  return json({ organization: org });
}
