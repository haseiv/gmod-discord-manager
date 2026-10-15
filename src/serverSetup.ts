import { ChannelType, PermissionFlagsBits, type CategoryChannel, type Guild } from "discord.js";
import type { JsonStore } from "./store.js";

type ChannelSpec = { name: string; type?: ChannelType.GuildVoice; readOnly?: boolean };
type Section = { name: string; channels: ChannelSpec[]; staffOnly?: boolean };

const sections: Section[] = [
  { name: "Информация (DarkRP)", channels: [
    { name: "📖│информация-о-серверах", readOnly: true },
    { name: "📜│правила-discord", readOnly: true },
    { name: "📌│новости-darkrp", readOnly: true },
    { name: "📋│обновление-правил", readOnly: true },
    { name: "📣│ивенты", readOnly: true }
  ] },
  { name: "Общение (DarkRP)", channels: [
    { name: "💬│чат" }, { name: "🔨│баги-сервера" },
    { name: "🔊│общий голосовой #1", type: ChannelType.GuildVoice },
    { name: "🔊│общий голосовой #2", type: ChannelType.GuildVoice }
  ] },
  { name: "Форум (DarkRP)", channels: [
    { name: "📙│вопросы-и-предложения" }, { name: "📚│предложения-по-правилам" },
    { name: "📘│запрос-на-роль" }, { name: "🟥│жалобы-на-администрацию" },
    { name: "🟩│отзывы-на-администрацию" }
  ] },
  { name: "Приватное общение", channels: [
    { name: "🔧│настройка-комнаты", readOnly: true },
    { name: "🔊│Создать комнату", type: ChannelType.GuildVoice }
  ] },
  { name: "ТОРГОВАЯ ПЛОЩАДКА", channels: [
    { name: "💰│торговля_magic1" }, { name: "💰│торговля_magic2" }, { name: "💰│торговля_magic3" }
  ] },
  { name: "Набор (DarkRP)", channels: [
    { name: "🟨│набор-в-администрацию-no1" }, { name: "🟩│набор-в-ивентеры-no1" },
    { name: "🟨│набор-в-администрацию-no2" }, { name: "🟩│набор-в-ивентеры-no2" },
    { name: "🟨│набор-в-администрацию-no3" }, { name: "🟩│набор-в-ивентеры-no3" }
  ] },
  { name: "🔧│Admins│🔧", staffOnly: true, channels: [
    { name: "🟥│варны-админов" }, { name: "🟩│преды-админов" },
    { name: "🟨│запрос-на-бан" }, { name: "📊│отчёты-администрации" },
    { name: "🔊│админский голосовой", type: ChannelType.GuildVoice }
  ] }
];

const roleSpecs = [
  { name: "Владелец проекта", color: 0xed4245 },
  { name: "Куратор", color: 0xf47b67 },
  { name: "Главный администратор", color: 0xe67e22 },
  { name: "Специальный админ", color: 0x9b59b6 },
  { name: "Администратор", color: 0x5865f2 },
  { name: "Хелпер", color: 0x3498db },
  { name: "Ивентер", color: 0x2ecc71 },
  { name: "Игрок", color: 0x99aab5 }
];

export async function setupGmodServer(guild: Guild, store: JsonStore): Promise<string> {
  const me = await guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels) || !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error("Боту нужны права «Управлять каналами» и «Управлять ролями».");
  }
  await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
  let rolesCreated = 0, categoriesCreated = 0, channelsCreated = 0;
  const staffRoleIds: string[] = [];
  for (const spec of roleSpecs) {
    let role = guild.roles.cache.find(r => r.name === spec.name);
    if (!role) {
      role = await guild.roles.create({ name: spec.name, color: spec.color, mentionable: false, reason: "Шаблон Garry's Mod /server setup" });
      rolesCreated++;
    }
    if (spec.name !== "Игрок") staffRoleIds.push(role.id);
  }

  let lobbyId: string | undefined;
  let lobbyCategoryId: string | undefined;
  let reportsId: string | undefined;
  for (const section of sections) {
    let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === section.name) as CategoryChannel | undefined;
    if (!category) {
      category = await guild.channels.create({
        name: section.name, type: ChannelType.GuildCategory,
        permissionOverwrites: section.staffOnly ? [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          ...staffRoleIds.map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel] }))
        ] : undefined,
        reason: "Шаблон Garry's Mod /server setup"
      });
      categoriesCreated++;
    }
    for (const spec of section.channels) {
      let channel = guild.channels.cache.find(c => c.parentId === category.id && c.name === spec.name && c.type === (spec.type ?? ChannelType.GuildText));
      if (!channel) {
        channel = await guild.channels.create({
          name: spec.name, type: spec.type ?? ChannelType.GuildText, parent: category.id,
          permissionOverwrites: spec.readOnly ? [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] }] : undefined,
          reason: "Шаблон Garry's Mod /server setup"
        });
        channelsCreated++;
      }
      if (spec.name === "🔊│Создать комнату") { lobbyId = channel.id; lobbyCategoryId = category.id; }
      if (spec.name === "📊│отчёты-администрации") reportsId = channel.id;
    }
  }
  await store.mutate(db => {
    const config = db.guilds[guild.id] ?? store.guild(guild.id);
    if (lobbyId) { config.voiceLobbyChannelId = lobbyId; config.voiceCategoryId = lobbyCategoryId; }
    if (reportsId && !config.reportChannelId) config.reportChannelId = reportsId;
    db.guilds[guild.id] = config;
  });
  return `Готово: создано ролей — ${rolesCreated}, категорий — ${categoriesCreated}, каналов — ${channelsCreated}. Войс «Создать комнату» подключён к системе временных комнат. Повторный запуск добавит только отсутствующие элементы. Панели тикетов и войсов публикуются отдельно через /panel deploy.`;
}
