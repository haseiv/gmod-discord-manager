import { Client, GatewayIntentBits, Partials, type Guild } from "discord.js";
import { startApi } from "./api.js";
import { env } from "./config.js";
import { registerInteractions } from "./interactions.js";
import { registerSecurity } from "./security.js";
import { JsonStore } from "./store.js";
import { registerVoiceSystem } from "./voice.js";
import { commands } from "./commands.js";
import { registerStaffUpdates } from "./staff.js";

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
registerStaffUpdates(client, store);
const registrations = new Set<string>();
async function registerGuildCommands(guild: Guild) {
  if (registrations.has(guild.id)) return;
  registrations.add(guild.id);
  try {
    const registered = await guild.commands.set(commands);
    console.log(`Slash-команды зарегистрированы на сервере ${guild.name}: ${registered.size}`);
  } catch (error) {
    registrations.delete(guild.id);
    console.error(`Не удалось зарегистрировать команды на сервере ${guild.id}:`, error);
  }
}
client.once("clientReady", async ready => {
  console.log(`Discord: ${ready.user.tag} (${ready.guilds.cache.size} серверов)`);
  for (const guild of ready.guilds.cache.values()) await registerGuildCommands(guild);
});
client.on("guildCreate", guild => void registerGuildCommands(guild));

const api = env.GMOD_API_SECRET ? startApi(store, env.HTTP_PORT, env.GMOD_API_SECRET) : undefined;
if (!api) console.warn("GMOD_API_SECRET не задан: API статистики Garry's Mod отключён.");
await client.login(env.DISCORD_TOKEN);

async function shutdown(signal: string) {
  console.log(`${signal}: завершение работы`);
  api?.close(); client.destroy(); process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
