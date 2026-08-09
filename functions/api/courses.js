import { json } from "../_utils.js";

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, question_count, pass_percent, time_limit_min
     FROM courses WHERE active = 1 ORDER BY name`
  ).all();
  return json({ courses: results });
}
