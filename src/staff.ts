import { Client, EmbedBuilder, type Guild } from "discord.js";
import type { JsonStore } from "./store.js";

export function staffEmbed(guild: Guild, roleIds: string[], title: string) {
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(title).setTimestamp();
  for (const roleId of roleIds) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    const members = [...role.members.values()].filter(member => !member.user.bot)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"));
    const mentions = members.map(member => `<@${member.id}>`);
    let value = mentions.join("\n") || "Пока никого нет";
    if (value.length > 1024) value = `${mentions.slice(0, 40).join("\n")}\n…ещё ${Math.max(0, mentions.length - 40)}`;
    embed.addFields({ name: role.name, value: value.slice(0, 1024) });
  }
  return embed;
}

export async function refreshStaffPanels(guild: Guild, store: JsonStore) {
  const panels = Object.entries(store.snapshot().staffPanels).filter(([, panel]) => panel.guildId === guild.id);
  if (!panels.length) return;
  await guild.members.fetch();
  for (const [messageId, panel] of panels) {
    const channel = await guild.channels.fetch(panel.channelId).catch(() => null);
    if (!channel?.isTextBased() || !('messages' in channel)) continue;
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) continue;
    await message.edit({ embeds: [staffEmbed(guild, panel.roleIds, panel.title)] }).catch(console.error);
  }
}

export function registerStaffUpdates(client: Client, store: JsonStore) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const schedule = (guild: Guild) => {
    const old = timers.get(guild.id);
    if (old) clearTimeout(old);
    timers.set(guild.id, setTimeout(() => {
      timers.delete(guild.id);
      void refreshStaffPanels(guild, store).catch(console.error);
    }, 1500));
  };
  client.on("guildMemberUpdate", (before, after) => {
    if (!before.roles.cache.equals(after.roles.cache)) schedule(after.guild);
  });
  client.on("guildMemberAdd", member => schedule(member.guild));
  client.on("guildMemberRemove", member => schedule(member.guild));
  client.on("clientReady", ready => {
    for (const guild of ready.guilds.cache.values()) schedule(guild);
  });
}
