import { REST, Routes } from "discord.js";
import { env } from "./config.js";
import { commands } from "./commands.js";

const rest = new REST().setToken(env.DISCORD_TOKEN);
if (env.DISCORD_GUILD_ID) {
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), { body: commands });
  console.log(`Команды зарегистрированы на сервере ${env.DISCORD_GUILD_ID}.`);
} else {
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: commands });
  console.log("Глобальные команды зарегистрированы (обновление может занять до часа). ");
}
