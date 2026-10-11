import { Client, GatewayIntentBits, Partials } from "discord.js";
import { startApi } from "./api.js";
import { env } from "./config.js";
import { registerInteractions } from "./interactions.js";
import { registerSecurity } from "./security.js";
import { JsonStore } from "./store.js";
import { registerVoiceSystem } from "./voice.js";

const store = new JsonStore(env.DATA_DIR);
await store.init();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel, Partials.Message]
});

registerInteractions(client, store);
registerSecurity(client, store);
registerVoiceSystem(client, store);
client.once("ready", ready => console.log(`Discord: ${ready.user.tag} (${ready.guilds.cache.size} серверов)`));

const api = env.GMOD_API_SECRET ? startApi(store, env.HTTP_PORT, env.GMOD_API_SECRET) : undefined;
if (!api) console.warn("GMOD_API_SECRET не задан: API статистики Garry's Mod отключён.");
await client.login(env.DISCORD_TOKEN);

async function shutdown(signal: string) {
  console.log(`${signal}: завершение работы`);
  api?.close(); client.destroy(); process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
