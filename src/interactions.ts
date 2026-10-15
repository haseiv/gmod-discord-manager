import {
  ActionRowBuilder, AttachmentBuilder, ButtonInteraction, ChannelType, ChatInputCommandInteraction,
  EmbedBuilder, GuildMember, MessageFlags, ModalBuilder, ModalSubmitInteraction, PermissionFlagsBits,
  StringSelectMenuInteraction, TextInputBuilder, TextInputStyle, type Client, type TextChannel
} from "discord.js";
import { JsonStore, isTicketKey } from "./store.js";
import { reportControls, ticketControls, ticketPanel } from "./ui.js";
import { voicePanel } from "./voice.js";
import { staffEmbed } from "./staff.js";
import { setupGmodServer } from "./serverSetup.js";

const privateReply = { flags: MessageFlags.Ephemeral } as const;

export function registerInteractions(client: Client, store: JsonStore) {
  client.on("interactionCreate", async interaction => {
    try {
      if (!interaction.inCachedGuild()) return;
      if (interaction.isChatInputCommand() && interaction.commandName !== "voice") await chatCommand(interaction, store);
      else if (interaction.isStringSelectMenu() && interaction.customId === "ticket:create") await createTicket(interaction, store);
      else if (interaction.isButton() && !interaction.customId.startsWith("voice:")) await button(interaction, store);
      else if (interaction.isModalSubmit() && !interaction.customId.startsWith("voice:")) await modal(interaction, store);
    } catch (error) {
      console.error("Interaction error", error);
      const message = `Ошибка: ${error instanceof Error ? error.message : "неизвестная ошибка"}`;
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) await interaction.followUp({ content: message, ...privateReply }).catch(() => undefined);
        else await interaction.reply({ content: message, ...privateReply }).catch(() => undefined);
      }
    }
  });
}

async function chatCommand(i: ChatInputCommandInteraction<"cached">, store: JsonStore) {
  const sub = i.options.getSubcommand(false);
  const cfg = store.guild(i.guildId);
  if (i.commandName === "server" && sub === "setup") {
    if (!i.memberPermissions?.has(PermissionFlagsBits.Administrator)) throw new Error("Нужны права администратора.");
    await i.deferReply(privateReply);
    const summary = await setupGmodServer(i.guild, store);
    await i.editReply(summary);
    return;
  }
  if (i.commandName === "panel") {
    const panel = i.options.getString("panel", true);
    const channel = i.options.getChannel("channel", true);
    if (!channel.isTextBased() || channel.isDMBased()) throw new Error("Нужен текстовый канал сервера.");
    if (panel === "tickets") await channel.send(ticketPanel(cfg));
    else if (panel === "voice") await channel.send(voicePanel());
    else throw new Error("Неизвестный тип панели.");
    await i.reply({ content: `Панель «${panel === "tickets" ? "Тикеты" : "Кастомные войсы"}» опубликована в ${channel}.`, ...privateReply });
    return;
  }
  if (i.commandName === "tickets") {
    if (sub === "logs") {
      const channel = i.options.getChannel("channel", true);
      await store.mutate(db => { db.guilds[i.guildId] = cfg; cfg.ticketLogChannelId = channel.id; });
      await i.reply({ content: `Журнал тикетов: ${channel}.`, ...privateReply });
    } else if (sub === "type") {
      const key = i.options.getString("key", true);
      if (!isTicketKey(key)) throw new Error("Неизвестный тип тикета.");
      const t = cfg.ticketTypes[key];
      t.label = i.options.getString("label") ?? t.label;
      t.description = i.options.getString("description") ?? t.description;
      t.emoji = i.options.getString("emoji") ?? t.emoji;
      t.categoryId = i.options.getChannel("category")?.id ?? t.categoryId;
      t.supportRoleId = i.options.getRole("support_role")?.id ?? t.supportRoleId;
      t.enabled = i.options.getBoolean("enabled") ?? t.enabled;
      await store.mutate(db => { db.guilds[i.guildId] = cfg; });
      await i.reply({ content: `Тип «${t.label}» обновлён. Повторно выполните /panel deploy, чтобы обновить панель.`, ...privateReply });
    } else if (sub === "close") {
      await closeTicket(i.channelId, i.user.id, i.options.getString("reason") ?? "Без причины", store, i);
    }
    return;
  }

  if (i.commandName === "reports") {
    if (sub === "setup") {
      if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new Error("Нужно право «Управлять сервером». ");
      const channel = i.options.getChannel("channel", true);
      const role = i.options.getRole("reviewer_role", true);
      cfg.reportChannelId = channel.id; cfg.reportReviewerRoleId = role.id;
      await store.mutate(db => { db.guilds[i.guildId] = cfg; });
      await i.reply({ content: `Отчёты будут поступать в ${channel}, проверяющие: ${role}.`, ...privateReply });
    } else {
      if (!cfg.reportChannelId) throw new Error("Администратор ещё не настроил канал отчётов.");
      const modal = new ModalBuilder().setCustomId("report:submit").setTitle("Отчёт о выполнении нормы");
      modal.addComponents(
        input("period", "Период отчёта", "Например: 1–7 октября", TextInputStyle.Short),
        input("hours", "Отработано часов", "Например: 14.5", TextInputStyle.Short),
        input("work", "Что было сделано", "Опишите работу за период", TextInputStyle.Paragraph),
        input("proof", "Ссылки на доказательства", "Ссылки или «нет»", TextInputStyle.Paragraph, false)
      );
      await i.showModal(modal);
    }
    return;
  }

  if (i.commandName === "say") {
    const channel = i.options.getChannel("channel", true);
    if (!channel.isTextBased() || channel.isDMBased()) throw new Error("Нужен текстовый канал.");
    if (sub === "text") {
      await channel.send({ content: i.options.getString("text", true), allowedMentions: { parse: [] } });
    } else if (sub === "embed") {
      const rawColor = i.options.getString("color") ?? "#5865F2";
      if (!/^#[0-9a-fA-F]{6}$/.test(rawColor)) throw new Error("Цвет должен быть в формате #RRGGBB.");
      await channel.send({ embeds: [new EmbedBuilder().setColor(parseInt(rawColor.slice(1), 16))
        .setTitle(i.options.getString("title", true)).setDescription(i.options.getString("description", true))], allowedMentions: { parse: [] } });
    } else if (sub === "staff") {
      await i.deferReply(privateReply);
      const roleIds = [1, 2, 3, 4, 5].map(n => i.options.getRole(`role${n}`)?.id).filter((id): id is string => Boolean(id));
      await i.guild.members.fetch();
      const title = i.options.getString("title") ?? "Состав администрации";
      const message = await channel.send({ embeds: [staffEmbed(i.guild, roleIds, title)], allowedMentions: { parse: [] } });
      await store.mutate(db => { db.staffPanels[message.id] = { guildId: i.guildId, channelId: channel.id, roleIds, title }; });
      await i.editReply(`Эмбед состава опубликован в ${channel} и будет обновляться при изменении ролей.`);
      return;
    }
    await i.reply({ content: `Сообщение отправлено в ${channel}.`, ...privateReply });
    return;
  }

  if (i.commandName === "stats") {
    const db = store.snapshot();
    if (sub === "server") {
      const servers = Object.values(db.servers);
      const embed = new EmbedBuilder().setColor(0x57f287).setTitle("Онлайн Garry's Mod");
      embed.setDescription(servers.length ? servers.map(s => `**${s.serverName}** — ${s.online}/${s.maxPlayers}\nОбновлено: <t:${Math.floor(new Date(s.updatedAt).getTime() / 1000)}:R>`).join("\n\n") : "Данные ещё не поступали.");
      await i.reply({ embeds: [embed] });
    } else {
      const steamId = i.options.getString("steamid64", true);
      const rows = Object.values(db.servers).flatMap(s => s.players[steamId] ? [{ server: s.serverName, stat: s.players[steamId]! }] : []);
      if (!rows.length) return void await i.reply({ content: "Игрок не найден в собранной статистике.", ...privateReply });
      const embed = new EmbedBuilder().setColor(0x3498db).setTitle(rows[0]!.stat.name).setDescription(`SteamID64: \`${steamId}\``);
      for (const row of rows) embed.addFields({ name: row.server, value: `Деньги: **${row.stat.money.toLocaleString("ru-RU")}**\nВремя: **${(row.stat.playtimeMinutes / 60).toFixed(1)} ч**\nУбийства: **${row.stat.kills}**` });
      await i.reply({ embeds: [embed] });
    }
    return;
  }

  if (i.commandName === "security") {
    if (sub === "setup") {
      cfg.securityLogChannelId = i.options.getChannel("log_channel", true).id;
      cfg.securityEnabled = i.options.getBoolean("enabled", true);
      cfg.raidJoinLimit = i.options.getInteger("raid_limit") ?? cfg.raidJoinLimit;
      cfg.minAccountAgeHours = i.options.getInteger("min_age_hours") ?? cfg.minAccountAgeHours;
      cfg.nukeActionLimit = i.options.getInteger("nuke_limit") ?? cfg.nukeActionLimit;
      await store.mutate(db => { db.guilds[i.guildId] = cfg; });
      await i.reply({ content: "Настройки защиты сохранены.", ...privateReply });
    } else {
      await i.reply({ embeds: [new EmbedBuilder().setColor(cfg.securityEnabled ? 0x57f287 : 0xed4245).setTitle("Защита сервера")
        .addFields(
          { name: "Состояние", value: cfg.securityEnabled ? "Включена" : "Выключена", inline: true },
          { name: "Антирейд", value: `${cfg.raidJoinLimit} входов / ${cfg.raidWindowSeconds} сек.`, inline: true },
          { name: "Возраст аккаунта", value: `${cfg.minAccountAgeHours} ч`, inline: true },
          { name: "Антинюк", value: `${cfg.nukeActionLimit} действий / ${cfg.nukeWindowSeconds} сек.`, inline: true },
          { name: "Журнал", value: cfg.securityLogChannelId ? `<#${cfg.securityLogChannelId}>` : "Не настроен" }
        )], ...privateReply });
    }
  }
}

function input(id: string, label: string, placeholder: string, style: TextInputStyle, required = true) {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(placeholder).setStyle(style).setRequired(required));
}

async function createTicket(i: StringSelectMenuInteraction<"cached">, store: JsonStore) {
  const key = i.values[0];
  if (!key || !isTicketKey(key)) throw new Error("Неизвестный тип тикета.");
  const cfg = store.guild(i.guildId); const type = cfg.ticketTypes[key];
  await i.update(ticketPanel(cfg));
  const existing = Object.entries(store.snapshot().openTickets).find(([, t]) => t.ownerId === i.user.id && t.type === key);
  if (existing) return void await i.followUp({ content: `У вас уже открыт такой тикет: <#${existing[0]}>.`, ...privateReply });
  const safeName = i.user.username.toLowerCase().replace(/[^a-z0-9а-яё-]/gi, "-").slice(0, 40);
  const overwrites = [
    { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }
  ];
  if (type.supportRoleId) overwrites.push({ id: type.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] });
  const channel = await i.guild.channels.create({
    name: `${key}-${safeName || i.user.id}`.slice(0, 90), type: ChannelType.GuildText,
    parent: type.categoryId, permissionOverwrites: overwrites,
    topic: `ticket owner=${i.user.id} type=${key}`
  });
  await store.mutate(db => { db.openTickets[channel.id] = { ownerId: i.user.id, type: key, createdAt: new Date().toISOString() }; });
  await channel.send({ content: `${i.user}${type.supportRoleId ? ` <@&${type.supportRoleId}>` : ""}`, allowedMentions: { users: [i.user.id], roles: type.supportRoleId ? [type.supportRoleId] : [] }, embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(type.label).setDescription("Опишите ситуацию подробно и приложите доказательства. Сотрудник ответит здесь.")], components: [ticketControls()] });
  await i.followUp({ content: `Тикет создан: ${channel}.`, ...privateReply });
}

async function button(i: ButtonInteraction<"cached">, store: JsonStore) {
  if (i.customId === "ticket:close") return closeTicket(i.channelId, i.user.id, "Закрыт кнопкой", store, i);
  if (i.customId === "ticket:claim") {
    const ticket = store.snapshot().openTickets[i.channelId];
    if (!ticket) throw new Error("Это не зарегистрированный тикет.");
    const role = store.guild(i.guildId).ticketTypes[ticket.type].supportRoleId;
    if (role && !(i.member as GuildMember).roles.cache.has(role) && !i.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) throw new Error("Вы не состоите в группе поддержки.");
    await i.reply({ content: `🙋 ${i.user} взял(а) обращение в работу.` });
    return;
  }
  if (i.customId.startsWith("report:")) {
    const role = store.guild(i.guildId).reportReviewerRoleId;
    if (!role || !(i.member as GuildMember).roles.cache.has(role)) throw new Error("У вас нет роли проверяющего.");
    const approved = i.customId === "report:approve";
    const embeds = i.message.embeds.map(e => EmbedBuilder.from(e).setColor(approved ? 0x57f287 : 0xed4245).addFields({ name: "Решение", value: `${approved ? "✅ Принято" : "❌ Отклонено"} — ${i.user}` }));
    await i.update({ embeds, components: [] });
  }
}

async function modal(i: ModalSubmitInteraction<"cached">, store: JsonStore) {
  if (i.customId !== "report:submit") return;
  const cfg = store.guild(i.guildId);
  const channel = cfg.reportChannelId ? i.guild.channels.cache.get(cfg.reportChannelId) : undefined;
  if (!channel?.isTextBased()) throw new Error("Канал отчётов удалён или недоступен.");
  const embed = new EmbedBuilder().setColor(0xfee75c).setTitle("Отчёт на закрытие нормы")
    .setAuthor({ name: i.user.tag, iconURL: i.user.displayAvatarURL() })
    .addFields(
      { name: "Период", value: i.fields.getTextInputValue("period") },
      { name: "Отработано", value: `${i.fields.getTextInputValue("hours")} ч.` },
      { name: "Выполненная работа", value: i.fields.getTextInputValue("work") },
      { name: "Доказательства", value: i.fields.getTextInputValue("proof") || "Не указаны" }
    ).setFooter({ text: `reporter:${i.user.id}` }).setTimestamp();
  await channel.send({ content: cfg.reportReviewerRoleId ? `<@&${cfg.reportReviewerRoleId}>` : undefined, allowedMentions: { roles: cfg.reportReviewerRoleId ? [cfg.reportReviewerRoleId] : [] }, embeds: [embed], components: [reportControls()] });
  await i.reply({ content: "Отчёт отправлен на проверку.", ...privateReply });
}

async function closeTicket(channelId: string, actorId: string, reason: string, store: JsonStore, interaction: ChatInputCommandInteraction<"cached"> | ButtonInteraction<"cached">) {
  const ticket = store.snapshot().openTickets[channelId];
  if (!ticket) throw new Error("Этот канал не является открытым тикетом.");
  const cfg = store.guild(interaction.guildId);
  const supportRole = cfg.ticketTypes[ticket.type].supportRoleId;
  const member = interaction.member as GuildMember;
  if (actorId !== ticket.ownerId && !(supportRole && member.roles.cache.has(supportRole)) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) throw new Error("Закрыть тикет может автор или сотрудник поддержки.");
  await interaction.reply({ content: "Тикет закрывается, журнал сохраняется…", ...privateReply });
  const channel = interaction.channel as TextChannel;
  const messages = await channel.messages.fetch({ limit: 100 });
  const transcript = messages.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.cleanContent}${m.attachments.size ? ` [${m.attachments.map(a => a.url).join(", ")}]` : ""}`).join("\n");
  const logChannel = cfg.ticketLogChannelId ? interaction.guild.channels.cache.get(cfg.ticketLogChannelId) : undefined;
  if (logChannel?.isTextBased()) await logChannel.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle(`Закрыт тикет #${channel.name}`).addFields({ name: "Автор", value: `<@${ticket.ownerId}>`, inline: true }, { name: "Закрыл", value: `<@${actorId}>`, inline: true }, { name: "Причина", value: reason }).setTimestamp()], files: [new AttachmentBuilder(Buffer.from(transcript || "Нет сообщений", "utf8"), { name: `${channel.name}.txt` })] });
  await store.mutate(db => { delete db.openTickets[channelId]; });
  setTimeout(() => channel.delete(`Ticket closed by ${actorId}: ${reason}`).catch(console.error), 1500);
}
