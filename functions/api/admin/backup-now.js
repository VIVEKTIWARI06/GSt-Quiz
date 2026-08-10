import { json, unauthorized } from "../../_utils.js";
import { runBackup } from "../../_backup.js";

function checkAdmin(request, env) {
  const provided = request.headers.get("x-admin-password") || "";
  return env.ADMIN_PASSWORD && provided === env.ADMIN_PASSWORD;
}

export async function onRequestPost({ request, env }) {
  if (!checkAdmin(request, env)) return unauthorized("Invalid admin password");
  const result = await runBackup(env);
  return json(result);
}
