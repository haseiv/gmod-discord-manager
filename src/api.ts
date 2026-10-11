import { timingSafeEqual } from "node:crypto";
import express from "express";
import { z } from "zod";
import type { JsonStore } from "./store.js";

const playerSchema = z.object({
  steamId64: z.string().regex(/^7656119\d{10}$/),
  name: z.string().min(1).max(100),
  money: z.number().finite(),
  playtimeMinutes: z.number().finite().nonnegative(),
  kills: z.number().int().nonnegative()
});

const updateSchema = z.object({
  serverId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  serverName: z.string().min(1).max(100),
  online: z.number().int().nonnegative(),
  maxPlayers: z.number().int().positive(),
  players: z.array(playerSchema).max(256)
});

function validSecret(header: string | undefined, secret: string) {
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(supplied); const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function startApi(store: JsonStore, port: number, secret: string) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "512kb" }));
  app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.post("/api/v1/stats", async (req, res) => {
    if (!validSecret(req.header("authorization"), secret)) return void res.status(401).json({ error: "unauthorized" });
    const result = updateSchema.safeParse(req.body);
    if (!result.success) return void res.status(400).json({ error: "invalid_payload", details: z.flattenError(result.error) });
    const now = new Date().toISOString(); const body = result.data;
    await store.mutate(db => {
      const previous = db.servers[body.serverId];
      const players = { ...(previous?.players ?? {}) };
      for (const p of body.players) players[p.steamId64] = { ...p, updatedAt: now };
      db.servers[body.serverId] = { serverId: body.serverId, serverName: body.serverName, online: body.online, maxPlayers: body.maxPlayers, updatedAt: now, players };
    });
    res.json({ ok: true });
  });
  return app.listen(port, "0.0.0.0", () => console.log(`GMod API слушает порт ${port}`));
}
