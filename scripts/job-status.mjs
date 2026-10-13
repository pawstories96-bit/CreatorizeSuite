import initSqlJs from "sql.js";
import fs from "node:fs";
import path from "node:path";
const SQL = await initSqlJs();
const db = new SQL.Database(
  fs.readFileSync(path.join(process.argv[2], "app.db")),
);
const rows = db.exec("SELECT data FROM records WHERE kind='jobs'");
for (const [data] of rows[0]?.values || []) {
  const j = JSON.parse(data);
  console.log(
    JSON.stringify({
      id: j.id,
      action: j.action,
      status: j.status,
      progress: j.progress,
      events: j.events.slice(-3),
      error: j.error,
    }),
  );
}
