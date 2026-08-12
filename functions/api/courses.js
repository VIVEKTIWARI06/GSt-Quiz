import { json } from "../_utils.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const org = url.searchParams.get("org");

  const query = org
    ? `SELECT id, name, question_count, pass_percent, time_limit_min
       FROM courses WHERE active = 1 AND organization_id = ? ORDER BY name`
    : `SELECT id, name, question_count, pass_percent, time_limit_min
       FROM courses WHERE active = 1 AND organization_id IS NULL ORDER BY name`;

  const stmt = org ? env.DB.prepare(query).bind(org) : env.DB.prepare(query);
  const { results } = await stmt.all();
  return json({ courses: results });
}
