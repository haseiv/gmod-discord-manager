import {
  ChannelType, PermissionFlagsBits, SlashCommandBuilder
} from "discord.js";

const managerOnly = PermissionFlagsBits.ManageGuild;

export const commands = [
  new SlashCommandBuilder()
    .setName("tickets").setDescription("Управление тикетами")
    .addSubcommand(s => s.setName("type").setDescription("Настроить тип тикета")
      .addStringOption(o => o.setName("key").setDescription("Тип").setRequired(true).addChoices(
        { name: "Амнистия", value: "amnesty" }, { name: "Жалоба", value: "complaint" }, { name: "Заявка на хелпера", value: "helper" }))
      .addStringOption(o => o.setName("label").setDescription("Название").setMaxLength(80))
      .addStringOption(o => o.setName("description").setDescription("Описание").setMaxLength(100))
      .addStringOption(o => o.setName("emoji").setDescription("Emoji"))
      .addChannelOption(o => o.setName("category").setDescription("Категория новых тикетов").addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption(o => o.setName("support_role").setDescription("Роль, которая видит тикеты"))
      .addBooleanOption(o => o.setName("enabled").setDescription("Показывать тип в панели")))
    .addSubcommand(s => s.setName("logs").setDescription("Указать канал журнала тикетов")
      .addChannelOption(o => o.setName("channel").setDescription("Канал").addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s => s.setName("close").setDescription("Закрыть текущий тикет")
      .addStringOption(o => o.setName("reason").setDescription("Причина").setMaxLength(300)))
    .setDefaultMemberPermissions(managerOnly),

  new SlashCommandBuilder()
    .setName("voice").setDescription("Временные пользовательские войсы")
    .addSubcommand(s => s.setName("setup").setDescription("Настроить канал создания войсов")
      .addChannelOption(o => o.setName("lobby").setDescription("Войс, вход в который создаёт личный канал").addChannelTypes(ChannelType.GuildVoice).setRequired(true))
      .addChannelOption(o => o.setName("category").setDescription("Категория временных войсов").addChannelTypes(ChannelType.GuildCategory)))
    .setDefaultMemberPermissions(managerOnly),

  new SlashCommandBuilder()
    .setName("panel").setDescription("Публикация панелей бота")
    .addSubcommand(s => s.setName("deploy").setDescription("Выбрать и опубликовать панель")
      .addStringOption(o => o.setName("panel").setDescription("Нужная панель").setRequired(true).addChoices(
        { name: "Тикеты", value: "tickets" },
        { name: "Кастомные войсы", value: "voice" }
      ))
      .addChannelOption(o => o.setName("channel").setDescription("Канал публикации").addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .setDefaultMemberPermissions(managerOnly),

  new SlashCommandBuilder()
    .setName("reports").setDescription("Отчёты администрации")
    .addSubcommand(s => s.setName("setup").setDescription("Настроить канал отчётов")
      .addChannelOption(o => o.setName("channel").setDescription("Канал отчётов").addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addRoleOption(o => o.setName("reviewer_role").setDescription("Роль проверяющих").setRequired(true)))
    .addSubcommand(s => s.setName("submit").setDescription("Подать отчёт для закрытия нормы")),

  new SlashCommandBuilder()
    .setName("say").setDescription("Отправить сообщение от имени бота")
    .addSubcommand(s => s.setName("text").setDescription("Обычное сообщение")
      .addChannelOption(o => o.setName("channel").setDescription("Канал").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
      .addStringOption(o => o.setName("text").setDescription("Текст сообщения").setRequired(true).setMaxLength(2000)))
    .addSubcommand(s => s.setName("embed").setDescription("Эмбед с произвольным текстом")
      .addChannelOption(o => o.setName("channel").setDescription("Канал").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
      .addStringOption(o => o.setName("title").setDescription("Заголовок").setRequired(true).setMaxLength(256))
      .addStringOption(o => o.setName("description").setDescription("Текст эмбеда").setRequired(true).setMaxLength(4000))
      .addStringOption(o => o.setName("color").setDescription("Цвет HEX, например #5865F2")))
    .addSubcommand(s => s.setName("staff").setDescription("Автоматически обновляемый состав по ролям")
      .addChannelOption(o => o.setName("channel").setDescription("Канал").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
      .addRoleOption(o => o.setName("role1").setDescription("Первая роль, например Специальный админ").setRequired(true))
      .addRoleOption(o => o.setName("role2").setDescription("Вторая роль"))
      .addRoleOption(o => o.setName("role3").setDescription("Третья роль"))
      .addRoleOption(o => o.setName("role4").setDescription("Четвёртая роль"))
      .addRoleOption(o => o.setName("role5").setDescription("Пятая роль"))
      .addStringOption(o => o.setName("title").setDescription("Заголовок эмбеда").setMaxLength(256)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("stats").setDescription("Статистика Garry's Mod")
    .addSubcommand(s => s.setName("player").setDescription("Статистика игрока")
      .addStringOption(o => o.setName("steamid64").setDescription("SteamID64").setRequired(true)))
    .addSubcommand(s => s.setName("server").setDescription("Онлайн серверов")),

  new SlashCommandBuilder()
    .setName("security").setDescription("Защита Discord-сервера")
    .addSubcommand(s => s.setName("setup").setDescription("Настроить защиту")
      .addChannelOption(o => o.setName("log_channel").setDescription("Канал тревог").addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addBooleanOption(o => o.setName("enabled").setDescription("Включить защиту").setRequired(true))
      .addIntegerOption(o => o.setName("raid_limit").setDescription("Входов за окно до тревоги").setMinValue(3).setMaxValue(50))
      .addIntegerOption(o => o.setName("min_age_hours").setDescription("Минимальный возраст аккаунта").setMinValue(0).setMaxValue(8760))
      .addIntegerOption(o => o.setName("nuke_limit").setDescription("Опасных действий до блокировки").setMinValue(2).setMaxValue(10)))
    .addSubcommand(s => s.setName("status").setDescription("Показать настройки защиты"))
    .setDefaultMemberPermissions(managerOnly)
].map(command => command.toJSON());
