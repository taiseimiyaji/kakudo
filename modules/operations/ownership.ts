import postgres from "postgres";

/** Dedicated session: the single application owner must hold this lock before recovery or writes. */
export async function acquireOwnership(url: string, onLost: () => void) {
  let owned = false; let closing = false;
  const client = postgres(url, { max: 1, connect_timeout: 5, idle_timeout: 0, max_lifetime: null,
    onclose: () => { if (owned && !closing) onLost(); } });
  try {
    const [row] = await client`select pg_try_advisory_lock(43171, 1) as acquired`;
    if (!row.acquired) throw new Error("Another Kakudo process owns this database. Stop it before starting a replacement.");
    owned = true;
  } catch (error) { closing = true; await client.end(); throw error; }
  const heartbeat = setInterval(() => { void client`select 1`.catch(() => { if (!closing) onLost(); }); }, 5000);
  heartbeat.unref();
  return async () => { closing = true; clearInterval(heartbeat); await client.end(); };
}
