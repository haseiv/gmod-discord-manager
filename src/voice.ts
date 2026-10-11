import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, GuildMember,
  MessageFlags, ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle,
  UserSelectMenuBuilder, type ButtonInteraction, type ModalSubmitInteraction,
  type UserSelectMenuInteraction, type VoiceChannel
} from "discord.js";
import type { JsonStore } from "./store.js";

const ephemeral = { flags: MessageFlags.Ephemeral } as const;

export function registerVoiceSystem(client: Client, store: JsonStore) {
  client.on("voiceStateUpdate", async (oldState, newState) => {
    try {
      if (oldState.channelId && oldState.channelId !== newState.channelId) {
        await cleanupOrTransfer(oldState.channelId, oldState.member?.id, store, oldState.guild);
      }

      const member = newState.member;
      if (!member || member.user.bot || !newState.channelId) return;
      const cfg = store.guild(newState.guild.id);
      if (newState.channelId !== cfg.voiceLobbyChannelId) return;

      const db = store.snapshot();
      const owned = Object.entries(db.tempVoices).find(([, room]) => room.guildId === newState.guild.id && room.ownerId === member.id);
      if (owned) {
        const existing = newState.guild.channels.cache.get(owned[0]);
        if (existing?.isVoiceBased()) {
          await member.voice.setChannel(existing, "Возврат в личный голосовой канал");
          return;
        }
        await store.mutate(data => { delete data.tempVoices[owned[0]]; });
      }

      const lobby = newState.channel;
      const categoryId = cfg.voiceCategoryId ?? lobby?.parentId ?? undefined;
      const channel = await newState.guild.channels.create({
        name: `🔊 ${member.displayName}`.slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites: [{
          id: member.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream]
        }],
        reason: `Временный войс для ${member.user.tag}`
      });
      await store.mutate(data => {
        data.tempVoices[channel.id] = {
          guildId: newState.guild.id, ownerId: member.id, createdAt: new Date().toISOString(), locked: false, hidden: false
        };
      });
      await member.voice.setChannel(channel, "Создан личный голосовой канал");
    } catch (error) {
      console.error("Voice state error", error);
    }
  });

  client.on("interactionCreate", async interaction => {
    if (!interaction.inCachedGuild()) return;
    const isVoiceInteraction =
      (interaction.isChatInputCommand() && interaction.commandName === "voice") ||
      ((interaction.isButton() || interaction.isModalSubmit() || interaction.isUserSelectMenu()) && interaction.customId.startsWith("voice:"));
    if (!isVoiceInteraction) return;
    try {
      if (interaction.isChatInputCommand()) {
        const cfg = store.guild(interaction.guildId);
        const lobby = interaction.options.getChannel("lobby", true);
        cfg.voiceLobbyChannelId = lobby.id;
        cfg.voiceCategoryId = interaction.options.getChannel("category")?.id ?? lobby.parentId ?? undefined;
        await store.mutate(db => { db.guilds[interaction.guildId] = cfg; });
        await interaction.reply({ content: `Канал создания: ${lobby}. Категория временных войсов: ${cfg.voiceCategoryId ? `<#${cfg.voiceCategoryId}>` : "без категории"}.`, ...ephemeral });
      } else if (interaction.isButton()) await voiceButton(interaction, store);
      else if (interaction.isModalSubmit()) await voiceModal(interaction, store);
      else if (interaction.isUserSelectMenu()) await voiceKick(interaction, store);
    } catch (error) {
      console.error("Voice interaction error", error);
      const content = `Ошибка: ${error instanceof Error ? error.message : "неизвестная ошибка"}`;
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content, ...ephemeral }).catch(() => undefined);
      else await interaction.reply({ content, ...ephemeral }).catch(() => undefined);
    }
  });
}

export function voicePanel() {
  return {
    embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("Управление личным войсом")
      .setDescription("Зайдите в канал создания, чтобы получить личный войс. Управлять можно только каналом, в котором вы сейчас находитесь.")
      .addFields(
        { name: "Настройки", value: "✏️ название · 👥 лимит · 🔒 вход · 👁️ видимость" },
        { name: "Участники", value: "Выберите пользователя в меню, чтобы отключить его от вашего войса." }
      )],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("voice:rename").setLabel("Название").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("voice:limit").setLabel("Лимит").setEmoji("👥").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("voice:lock").setLabel("Закрыть/открыть").setEmoji("🔒").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("voice:hide").setLabel("Скрыть/показать").setEmoji("👁️").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("voice:delete").setLabel("Удалить").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
      ),
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder().setCustomId("voice:kick").setPlaceholder("Отключить участника от войса").setMinValues(1).setMaxValues(1)
      )
    ]
  };
}

function ownedVoice(interaction: ButtonInteraction<"cached"> | ModalSubmitInteraction<"cached"> | UserSelectMenuInteraction<"cached">, store: JsonStore) {
  const member = interaction.member as GuildMember;
  const channelId = member.voice.channelId;
  if (!channelId) throw new Error("Сначала зайдите в свой временный войс.");
  const room = store.snapshot().tempVoices[channelId];
  if (!room) throw new Error("Текущий канал не является временным войсом.");
  if (room.ownerId !== member.id) throw new Error("Управлять каналом может только его владелец.");
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel?.isVoiceBased()) throw new Error("Голосовой канал не найден.");
  return { member, channel: channel as VoiceChannel, room };
}

async function voiceButton(interaction: ButtonInteraction<"cached">, store: JsonStore) {
  const { channel, room } = ownedVoice(interaction, store);
  if (interaction.customId === "voice:rename" || interaction.customId === "voice:limit") {
    const rename = interaction.customId === "voice:rename";
    const field = new TextInputBuilder().setCustomId("value")
      .setLabel(rename ? "Новое название" : "Лимит участников (0–99)")
      .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(rename ? 100 : 2)
      .setValue(rename ? channel.name : String(channel.userLimit));
    await interaction.showModal(new ModalBuilder().setCustomId(rename ? "voice:rename-modal" : "voice:limit-modal")
      .setTitle(rename ? "Переименовать войс" : "Изменить лимит").addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field)));
    return;
  }
  if (interaction.customId === "voice:delete") {
    await interaction.reply({ content: "Личный войс удалён.", ...ephemeral });
    await store.mutate(db => { delete db.tempVoices[channel.id]; });
    await channel.delete(`Удалён владельцем ${interaction.user.tag}`);
    return;
  }
  if (interaction.customId === "voice:lock") {
    const locked = !room.locked;
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: locked ? false : null }, { reason: `Voice lock by ${interaction.user.tag}` });
    await store.mutate(db => { if (db.tempVoices[channel.id]) db.tempVoices[channel.id]!.locked = locked; });
    await interaction.reply({ content: locked ? "🔒 Войс закрыт для новых участников." : "🔓 Войс снова открыт.", ...ephemeral });
    return;
  }
  if (interaction.customId === "voice:hide") {
    const hidden = !room.hidden;
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: hidden ? false : null }, { reason: `Voice visibility by ${interaction.user.tag}` });
    await store.mutate(db => { if (db.tempVoices[channel.id]) db.tempVoices[channel.id]!.hidden = hidden; });
    await interaction.reply({ content: hidden ? "🙈 Войс скрыт из списка каналов." : "👁️ Войс снова виден.", ...ephemeral });
  }
}

async function voiceModal(interaction: ModalSubmitInteraction<"cached">, store: JsonStore) {
  const { channel } = ownedVoice(interaction, store);
  const value = interaction.fields.getTextInputValue("value").trim();
  if (interaction.customId === "voice:rename-modal") {
    if (!value) throw new Error("Название не может быть пустым.");
    await channel.setName(value.slice(0, 100), `Voice rename by ${interaction.user.tag}`);
    await interaction.reply({ content: `Название изменено на «${value.slice(0, 100)}».`, ...ephemeral });
  } else {
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 0 || limit > 99) throw new Error("Введите целое число от 0 до 99.");
    await channel.setUserLimit(limit, `Voice limit by ${interaction.user.tag}`);
    await interaction.reply({ content: limit === 0 ? "Лимит участников снят." : `Лимит установлен: ${limit}.`, ...ephemeral });
  }
}

async function voiceKick(interaction: UserSelectMenuInteraction<"cached">, store: JsonStore) {
  const { channel, member } = ownedVoice(interaction, store);
  const targetId = interaction.values[0];
  if (!targetId) throw new Error("Участник не выбран.");
  if (targetId === member.id) throw new Error("Нельзя отключить самого себя.");
  const target = await interaction.guild.members.fetch(targetId);
  if (target.voice.channelId !== channel.id) throw new Error("Этот участник не находится в вашем войсе.");
  if (!target.voice.disconnect) throw new Error("Не удалось отключить участника.");
  await target.voice.disconnect(`Отключён владельцем войса ${interaction.user.tag}`);
  await interaction.reply({ content: `${target.user.tag} отключён от войса.`, ...ephemeral });
}

async function cleanupOrTransfer(channelId: string, leavingId: string | undefined, store: JsonStore, guild: GuildMember["guild"]) {
  const room = store.snapshot().tempVoices[channelId];
  if (!room) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isVoiceBased()) {
    await store.mutate(db => { delete db.tempVoices[channelId]; });
    return;
  }
  const humans = [...channel.members.values()].filter(member => !member.user.bot);
  if (!humans.length) {
    await store.mutate(db => { delete db.tempVoices[channelId]; });
    await channel.delete("Временный войс опустел").catch(console.error);
    return;
  }
  if (leavingId === room.ownerId) {
    const next = humans[0]!;
    await channel.permissionOverwrites.delete(room.ownerId, "Передача владельца временного войса").catch(() => undefined);
    await channel.permissionOverwrites.edit(next.id, {
      ViewChannel: true, Connect: true, Speak: true, Stream: true
    }, { reason: "Передача владельца временного войса" });
    await store.mutate(db => { if (db.tempVoices[channelId]) db.tempVoices[channelId]!.ownerId = next.id; });
  }
}
