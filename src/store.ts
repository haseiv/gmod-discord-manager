import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseShape, GuildConfig, TicketTypeKey } from "./types.js";

const defaults = (): DatabaseShape => ({ guilds: {}, servers: {}, openTickets: {}, tempVoices: {} });

export function defaultGuildConfig(): GuildConfig {
  return {
    securityEnabled: true,
    raidJoinLimit: 10,
    raidWindowSeconds: 15,
    minAccountAgeHours: 24,
    nukeActionLimit: 3,
    nukeWindowSeconds: 20,
    voiceLobbyChannelId: "1544411530148184209",
    ticketTypes: {
      amnesty: { key: "amnesty", label: "Амнистия", description: "Заявление на амнистию", emoji: "🕊️", enabled: true },
      complaint: { key: "complaint", label: "Жалоба", description: "Жалоба на игрока или администратора", emoji: "⚠️", enabled: true },
      helper: { key: "helper", label: "Заявка на хелпера", description: "Набор в команду проекта", emoji: "🛠️", enabled: true }
    }
  };
}

export class JsonStore {
  private data: DatabaseShape = defaults();
  private chain = Promise.resolve();
  private readonly file: string;

  constructor(dir: string) { this.file = path.resolve(dir, "database.json"); }

  async init() {
    await mkdir(path.dirname(this.file), { recursive: true });
    try {
      this.data = JSON.parse(await readFile(this.file, "utf8")) as DatabaseShape;
      this.data.guilds ??= {};
      this.data.servers ??= {};
      this.data.openTickets ??= {};
      this.data.tempVoices ??= {};
    }
    catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.persist();
    }
  }

  guild(id: string): GuildConfig {
    this.data.guilds[id] ??= defaultGuildConfig();
    this.data.guilds[id].voiceLobbyChannelId ??= "1544411530148184209";
    return this.data.guilds[id];
  }

  snapshot() { return structuredClone(this.data); }

  async mutate(fn: (db: DatabaseShape) => void | Promise<void>) {
    this.chain = this.chain.then(async () => { await fn(this.data); await this.persist(); });
    await this.chain;
  }

  private async persist() {
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2), "utf8");
    await rename(tmp, this.file);
  }
}

export function isTicketKey(value: string): value is TicketTypeKey {
  return ["amnesty", "complaint", "helper"].includes(value);
}
