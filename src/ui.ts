import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, type Guild
} from "discord.js";
import type { GuildConfig } from "./types.js";

export function ticketPanel(config: GuildConfig) {
  const options = Object.values(config.ticketTypes).filter(t => t.enabled).map(t => ({
    label: t.label, description: t.description, value: t.key, emoji: t.emoji
  }));
  if (!options.length) throw new Error("Включите хотя бы один тип тикета.");
  return {
    embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("Обращение в поддержку")
      .setDescription("Выберите тему обращения в меню ниже. Для вас будет создан приватный канал.")
      .setFooter({ text: "Не создавайте дублирующие обращения" })],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId("ticket:create").setPlaceholder("Выберите тип обращения").addOptions(options)
    )]
  };
}

export function ticketControls() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ticket:claim").setLabel("Взять тикет").setEmoji("🙋").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket:close").setLabel("Закрыть").setEmoji("🔒").setStyle(ButtonStyle.Danger)
  );
}

export function reportControls() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("report:approve").setLabel("Принять").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("report:reject").setLabel("Отклонить").setStyle(ButtonStyle.Danger)
  );
}

export function botCanManage(guild: Guild, roleId?: string) {
  if (!roleId) return false;
  const me = guild.members.me;
  const role = guild.roles.cache.get(roleId);
  return Boolean(me && role && me.roles.highest.comparePositionTo(role) > 0);
}
