import {
  AuditLogEvent, Client, EmbedBuilder, GuildMember, PermissionFlagsBits, type GuildAuditLogsEntry, type TextBasedChannel
} from "discord.js";
import type { JsonStore } from "./store.js";

const joins = new Map<string, number[]>();
const actions = new Map<string, number[]>();
const messages = new Map<string, number[]>();
const dangerousAuditActions = new Set<AuditLogEvent>([
  AuditLogEvent.ChannelDelete, AuditLogEvent.RoleDelete, AuditLogEvent.MemberBanAdd,
  AuditLogEvent.MemberKick, AuditLogEvent.WebhookCreate, AuditLogEvent.BotAdd
]);
const dangerousPermissions = [
  PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ManageWebhooks
];

export function registerSecurity(client: Client, store: JsonStore) {
  client.on("guildMemberAdd", async member => {
    if (member.user.bot) return;
    const cfg = store.guild(member.guild.id);
    if (!cfg.securityEnabled) return;
    const now = Date.now(); const cutoff = now - cfg.raidWindowSeconds * 1000;
    const list = (joins.get(member.guild.id) ?? []).filter(t => t > cutoff); list.push(now); joins.set(member.guild.id, list);
    if (list.length < cfg.raidJoinLimit) return;
    const ageHours = (now - member.user.createdTimestamp) / 3_600_000;
    await securityLog(member.guild.channels.cache.get(cfg.securityLogChannelId ?? "") as TextBasedChannel | undefined,
      "Обнаружен возможный рейд", `За ${cfg.raidWindowSeconds} сек. вошло участников: **${list.length}**.\nНовый участник: ${member.user.tag}, аккаунту ${ageHours.toFixed(1)} ч.`, 0xed4245);
    if (ageHours < cfg.minAccountAgeHours && member.kickable) await member.kick(`Anti-raid: account age ${ageHours.toFixed(1)}h`).catch(console.error);
  });

  client.on("guildAuditLogEntryCreate", async (entry, guild) => {
    const cfg = store.guild(guild.id);
    if (!cfg.securityEnabled || !dangerousAuditActions.has(entry.action) || !entry.executorId) return;
    if (entry.executorId === guild.ownerId || entry.executorId === client.user?.id) return;
    const now = Date.now(); const key = `${guild.id}:${entry.executorId}`; const cutoff = now - cfg.nukeWindowSeconds * 1000;
    const list = (actions.get(key) ?? []).filter(t => t > cutoff); list.push(now); actions.set(key, list);
    if (list.length < cfg.nukeActionLimit) return;
    const member = await guild.members.fetch(entry.executorId).catch(() => null);
    const removed: string[] = [];
    if (member) {
      for (const role of member.roles.cache.values()) {
        if (role.id === guild.id || !role.editable || !dangerousPermissions.some(p => role.permissions.has(p))) continue;
        await member.roles.remove(role, "Anti-nuke threshold reached").then(() => removed.push(role.name)).catch(() => undefined);
      }
    }
    await securityLog(guild.channels.cache.get(cfg.securityLogChannelId ?? "") as TextBasedChannel | undefined,
      "Антинюк сработал", `Исполнитель: <@${entry.executorId}>\nОпасных действий: **${list.length}** за ${cfg.nukeWindowSeconds} сек.\nПоследнее действие: **${AuditLogEvent[entry.action]}**\nСняты роли: ${removed.length ? removed.join(", ") : "не удалось или не было"}`, 0xed4245);
    actions.set(key, []);
  });

  client.on("messageCreate", async message => {
    if (!message.inGuild() || message.author.bot) return;
    const cfg = store.guild(message.guildId);
    if (!cfg.securityEnabled) return;
    const now = Date.now(); const key = `${message.guildId}:${message.author.id}`;
    const list = (messages.get(key) ?? []).filter(t => t > now - 5_000); list.push(now); messages.set(key, list);
    const mentions = message.mentions.users.size + message.mentions.roles.size;
    if (list.length < 7 && mentions < 6) return;
    await message.delete().catch(() => undefined);
    const member = message.member;
    if (member?.moderatable) await member.timeout(10 * 60_000, "Anti-spam / mass mentions").catch(console.error);
    await securityLog(message.guild.channels.cache.get(cfg.securityLogChannelId ?? "") as TextBasedChannel | undefined,
      "Спам заблокирован", `Пользователь: ${message.author}\nСообщений за 5 сек.: **${list.length}**\nУпоминаний: **${mentions}**`, 0xfee75c);
    messages.set(key, []);
  });
}

async function securityLog(channel: TextBasedChannel | undefined, title: string, description: string, color: number) {
  if (!channel?.isSendable()) return;
  await channel.send({ embeds: [new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp()] }).catch(console.error);
}
