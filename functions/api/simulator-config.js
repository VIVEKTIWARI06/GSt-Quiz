import { json } from "../_utils.js";

export async function onRequestGet({ env }) {
  const row = await env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'simulator_gate'"
  ).first();
  const config = row?.value ? JSON.parse(row.value) : { login_required: false, free_seconds: 120 };
  return json(config);
}
