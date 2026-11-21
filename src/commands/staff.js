const fs = require("node:fs");
const path = require("node:path");
const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  EmbedBuilder, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle
} = require("discord.js");

const DATA = path.resolve(__dirname, "../../data");
const INFRACTION_TYPES = ["Warning", "Strike", "Final Warning", "Demotion", "Suspension", "Termination"];
const TICKET_TYPES = ["General Support", "Staff Report", "Ban Appeal", "Infraction Appeal", "Other"];

function load(file, fallback) {
  fs.mkdirSync(DATA, { recursive: true });
  const target = path.join(DATA, file);
  if (!fs.existsSync(target)) fs.writeFileSync(target, JSON.stringify(fallback, null, 2));
  try { return JSON.parse(fs.readFileSync(target, "utf8")); }
  catch (error) { console.error("Could not read " + file, error); return fallback; }
}
function save(file, value) {
  fs.mkdirSync(DATA, { recursive: true });
  const target = path.join(DATA, file);
  const temp = target + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, target);
}
const getConfig = () => load("config.json", {});
const getInfractions = () => load("infractions.json", []);
const getTickets = () => load("tickets.json", []);
function updateConfig(guildId, next) {
  const all = getConfig();
  all[guildId] = Object.assign({ roles: {}, channels: {}, ranks: [] }, all[guildId] || {}, next);
  save("config.json", all);
  return all[guildId];
}
function makeId(items, prefix) {
  const max = items.reduce((n, x) => Math.max(n, Number(String(x.id || "").replace(/\D/g, "")) || 0), 0);
  return prefix + String(max + 1).padStart(5, "0");
}
function isAdmin(member) { return Boolean(member && member.permissions && member.permissions.has(PermissionFlagsBits.Administrator)); }
function hasRole(member, id) { return Boolean(id && member && member.roles && member.roles.cache.has(id)); }
function canManage(member, cfg) { return isAdmin(member) || hasRole(member, cfg.roles && cfg.roles.administrator) || hasRole(member, cfg.roles && cfg.roles.hr); }
function canStaff(member, cfg) { return canManage(member, cfg) || hasRole(member, cfg.roles && cfg.roles.staff) || hasRole(member, cfg.roles && cfg.roles.supportStaff); }
function reply(ctx, payload) { return ctx.interaction ? ctx.interaction.reply(payload) : ctx.message.reply(payload); }
async function fetchUserMember(guild, token) {
  const match = (token || "").match(/^<@!?(\d+)>$/);
  const id = match ? match[1] : (/^\d{17,20}$/.test(token || "") ? token : null);
  return id ? guild.members.fetch(id).catch(() => null) : null;
}
async function fetchRole(guild, token) {
  const match = (token || "").match(/^<@&(\d+)>$/);
  const id = match ? match[1] : (/^\d{17,20}$/.test(token || "") ? token : null);
  return id ? guild.roles.fetch(id).catch(() => null) : null;
}
async function sendChannel(guild, id, payload) {
  if (!id) return null;
  const channel = await guild.channels.fetch(id).catch(() => null);
  return channel && channel.isTextBased() ? channel.send(payload).catch(() => null) : null;
}
function infractionEmbed(item) {
  return new EmbedBuilder().setColor(item.revoked ? 0x747F8D : 0xED4245)
    .setTitle("Infraction " + item.id)
    .setDescription("Unfortunately, <@" + item.userId + ">, you've been **" + item.type + "**.")
    .addFields(
      { name: "Reason", value: item.reason },
      { name: "Appeal Status", value: item.appealable ? "Appealable" : "Un-Appealable", inline: true },
      { name: "Issued By", value: "<@" + item.issuerId + ">", inline: true },
      { name: "Status", value: item.revoked ? "Revoked" : "Active", inline: true },
      { name: "Proofs", value: item.proofsUrl ? "[Open evidence thread](" + item.proofsUrl + ")" : "No evidence thread" }
    ).setFooter({ text: "Infraction ID: " + item.id }).setTimestamp(new Date(item.createdAt));
}
async function createInfraction(ctx, target, type, reason, appealable) {
  const guild = ctx.guild, cfg = getConfig()[guild.id] || {};
  const all = getInfractions();
  const item = {
    id: makeId(all, "INF-"), guildId: guild.id, userId: target.id, userTag: target.user.tag,
    type: type, reason: reason, appealable: appealable, issuerId: ctx.issuer.id,
    createdAt: new Date().toISOString(), revoked: false, proofsUrl: null, proofsThreadId: null
  };
  if (type === "Demotion" || type === "Termination") {
    const rankRoles = (cfg.ranks || []).filter(r => target.roles.cache.has(r.roleId));
    if (type === "Demotion" && rankRoles.length) {
      const current = rankRoles[rankRoles.length - 1];
      const ordered = cfg.ranks || [];
      const index = ordered.findIndex(r => r.roleId === current.roleId);
      await target.roles.remove(current.roleId);
      if (index > 0) await target.roles.add(ordered[index - 1].roleId).catch(() => null);
    }
    if (type === "Termination") {
      const ids = (cfg.ranks || []).map(r => r.roleId).filter(id => target.roles.cache.has(id));
      if (ids.length) await target.roles.remove(ids).catch(() => null);
      if (cfg.roles && cfg.roles.blacklist) await target.roles.add(cfg.roles.blacklist).catch(() => null);
    }
  }
  all.push(item); save("infractions.json", all);
  const log = await sendChannel(guild, cfg.channels && cfg.channels.infractions, { embeds: [infractionEmbed(item)] });
  if (log) {
    try {
      const thread = await log.startThread({ name: item.id.toLowerCase() + "-proofs", autoArchiveDuration: 1440 });
      item.proofsThreadId = thread.id; item.proofsUrl = thread.url; save("infractions.json", all);
      await thread.send("Evidence thread for **" + item.id + "**. Staff can attach evidence here.");
    } catch (error) { console.error("Evidence thread creation failed:", error); }
  }
  const embed = infractionEmbed(item);
  embed.addFields({ name: "Appeal", value: appealable ? "You may appeal through the Support ticket panel." : "This infraction cannot be appealed." });
  await ctx.respond({ embeds: [embed] });
  await target.send({ embeds: [embed] }).catch(() => null);
}
async function revoke(ctx, id, reason) {
  const all = getInfractions(), item = all.find(x => x.id === id && x.guildId === ctx.guild.id);
  if (!item) return ctx.respond({ content: "Infraction not found.", ephemeral: true });
  if (item.revoked) return ctx.respond({ content: "This infraction is already revoked.", ephemeral: true });
  item.revoked = true; item.revokeReason = reason; item.revokedBy = ctx.issuer.id; item.revokedAt = new Date().toISOString();
  save("infractions.json", all);
  const cfg = getConfig()[ctx.guild.id] || {};
  await sendChannel(ctx.guild, cfg.channels && cfg.channels.auditLogs, {
    embeds: [new EmbedBuilder().setColor(0x57F287).setTitle("Infraction " + id + " Revoked").setDescription(reason).setTimestamp()]
  });
  return ctx.respond({ content: "Infraction " + id + " has been revoked." });
}

const setup = {
  data: new SlashCommandBuilder().setName("setup").setDescription("Configure FHRP Utilities.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName("role").setDescription("Set a role.")
      .addStringOption(o => o.setName("key").setDescription("Role setting").setRequired(true).addChoices(
        { name: "Staff", value: "staff" }, { name: "HR", value: "hr" }, { name: "Administrator", value: "administrator" },
        { name: "Blacklist", value: "blacklist" }, { name: "Support Staff", value: "supportStaff" }))
      .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true)))
    .addSubcommand(s => s.setName("channel").setDescription("Set a channel/category.")
      .addStringOption(o => o.setName("key").setDescription("Channel setting").setRequired(true).addChoices(
        { name: "Infraction Logs", value: "infractions" }, { name: "Support Category", value: "supportCategory" },
        { name: "Support Panel", value: "supportPanel" }, { name: "Ticket Logs", value: "ticketLogs" },
        { name: "Audit Logs", value: "auditLogs" }))
      .addChannelOption(o => o.setName("channel").setDescription("Channel/category").setRequired(true)))
    .addSubcommand(s => s.setName("rank").setDescription("Add/update a rank (order added = low to high).")
      .addStringOption(o => o.setName("name").setDescription("Rank name").setRequired(true))
      .addRoleOption(o => o.setName("role").setDescription("Rank role").setRequired(true)))
    .addSubcommand(s => s.setName("view").setDescription("View configuration."))
    .addSubcommand(s => s.setName("reset").setDescription("Reset configuration.")),
  async execute({ message, interaction, args }) {
    const guild = interaction ? interaction.guild : message.guild;
    const member = interaction ? await guild.members.fetch(interaction.user.id) : message.member;
    if (!guild) return reply({ message, interaction }, { content: "Use this command in a server." });
    if (!isAdmin(member)) return reply({ message, interaction }, { content: "Only server administrators can configure the bot.", ephemeral: true });
    const cfg = getConfig()[guild.id] || { roles: {}, channels: {}, ranks: [] };
    if (interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === "role") {
        const key = interaction.options.getString("key"), role = interaction.options.getRole("role");
        updateConfig(guild.id, { roles: Object.assign({}, cfg.roles, { [key]: role.id }) });
        return interaction.reply({ content: "Saved " + key + " role: " + role, ephemeral: true });
      }
      if (sub === "channel") {
        const key = interaction.options.getString("key"), channel = interaction.options.getChannel("channel");
        if (key === "supportCategory" && channel.type !== ChannelType.GuildCategory)
          return interaction.reply({ content: "Support Category must be a category channel.", ephemeral: true });
        if (key !== "supportCategory" && !channel.isTextBased())
          return interaction.reply({ content: "Select a text channel.", ephemeral: true });
        updateConfig(guild.id, { channels: Object.assign({}, cfg.channels, { [key]: channel.id }) });
        return interaction.reply({ content: "Saved " + key + ": " + channel, ephemeral: true });
      }
      if (sub === "rank") {
        const name = interaction.options.getString("name").trim(), role = interaction.options.getRole("role");
        const list = [...(cfg.ranks || [])], index = list.findIndex(r => r.name.toLowerCase() === name.toLowerCase());
        const entry = { name, roleId: role.id };
        if (index >= 0) list[index] = entry; else list.push(entry);
        updateConfig(guild.id, { ranks: list });
        return interaction.reply({ content: "Saved rank " + name + ". Rank order follows the order added.", ephemeral: true });
      }
      if (sub === "reset") {
        const all = getConfig(); delete all[guild.id]; save("config.json", all);
        return interaction.reply({ content: "Server configuration reset.", ephemeral: true });
      }
      const roleLines = Object.entries(cfg.roles || {}).map(([k,v]) => "• " + k + ": <@&" + v + ">");
      const channelLines = Object.entries(cfg.channels || {}).map(([k,v]) => "• " + k + ": <#" + v + ">");
      const rankLines = (cfg.ranks || []).map((r,i) => (i + 1) + ". " + r.name + ": <@&" + r.roleId + ">");
      const embed = new EmbedBuilder().setTitle("FHRP Utilities Setup").setColor(0x5865F2)
        .addFields({ name: "Roles", value: roleLines.join("\n") || "Not configured" },
          { name: "Channels", value: channelLines.join("\n") || "Not configured" },
          { name: "Ranks (low to high)", value: rankLines.join("\n") || "Not configured" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    const sub = args[0], key = args[1], value = args[2];
    if (sub === "reset") { const all = getConfig(); delete all[guild.id]; save("config.json", all); return message.reply("Server configuration reset."); }
    if (sub === "role" && key && value) {
      const role = await fetchRole(guild, value);
      if (!role) return message.reply("Usage: -setup role <staff|hr|administrator|blacklist|supportStaff> @role");
      updateConfig(guild.id, { roles: Object.assign({}, cfg.roles, { [key]: role.id }) });
      return message.reply("Saved " + key + " role: " + role.name);
    }
    if (sub === "channel" && key && value) {
      const id = value.match(/^<#(\d+)>$/)?.[1] || value, channel = await guild.channels.fetch(id).catch(() => null);
      if (!channel) return message.reply("Channel not found.");
      updateConfig(guild.id, { channels: Object.assign({}, cfg.channels, { [key]: channel.id }) });
      return message.reply("Saved " + key + " channel: " + channel.name);
    }
    if (sub === "rank" && key && value) {
      const role = await fetchRole(guild, value);
      if (!role) return message.reply("Usage: -setup rank <name> @role");
      const list = [...(cfg.ranks || [])], index = list.findIndex(r => r.name.toLowerCase() === key.toLowerCase());
      const entry = { name: key, roleId: role.id }; if (index >= 0) list[index] = entry; else list.push(entry);
      updateConfig(guild.id, { ranks: list }); return message.reply("Saved rank " + key + ".");
    }
    return message.reply("Use -setup view | -setup role <key> @role | -setup channel <key> #channel | -setup rank <name> @role | -setup reset");
  }
};

const promote = {
  data: new SlashCommandBuilder().setName("promote").setDescription("Assign a staff rank.")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addRoleOption(o => o.setName("rank").setDescription("Configured rank role").setRequired(true)),
  async execute({ message, interaction, args }) {
    const guild = interaction ? interaction.guild : message.guild, actor = interaction ? await guild.members.fetch(interaction.user.id) : message.member;
    const cfg = getConfig()[guild.id] || {};
    if (!canManage(actor, cfg)) return reply({ message, interaction }, { content: "You need the configured HR/Admin role.", ephemeral: true });
    const target = interaction ? await guild.members.fetch(interaction.options.getUser("user").id) : await fetchUserMember(guild, args[0]);
    const role = interaction ? interaction.options.getRole("rank") : await fetchRole(guild, args[1]);
    if (!target || !role) return reply({ message, interaction }, { content: "Usage: -promote @user @rank" });
    if (!(cfg.ranks || []).some(r => r.roleId === role.id))
      return reply({ message, interaction }, { content: "That role is not configured. Add it with /setup rank first.", ephemeral: true });
    if (role.position >= guild.members.me.roles.highest.position)
      return reply({ message, interaction }, { content: "Move the bot's highest role above the selected rank.", ephemeral: true });
    const rankIds = (cfg.ranks || []).map(r => r.roleId).filter(id => target.roles.cache.has(id));
    if (rankIds.length) await target.roles.remove(rankIds);
    await target.roles.add(role);
    const embed = new EmbedBuilder().setTitle("Staff Promotion").setColor(0x57F287)
      .setDescription(target.toString() + " has been assigned **" + role.name + "**.").setTimestamp();
    await sendChannel(guild, cfg.channels && cfg.channels.auditLogs, { embeds: [embed] });
    return reply({ message, interaction }, { embeds: [embed] });
  }
};

const infraction = {
  data: new SlashCommandBuilder().setName("infraction").setDescription("Issue or manage infractions.")
    .addSubcommand(s => s.setName("create").setDescription("Issue an infraction.")
      .addUserOption(o => o.setName("user").setDescription("Target").setRequired(true))
      .addStringOption(o => o.setName("type").setDescription("Type").setRequired(true)
        .addChoices(...INFRACTION_TYPES.map(x => ({ name: x, value: x }))))
      .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true))
      .addBooleanOption(o => o.setName("appealable").setDescription("Can be appealed?").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("List infractions.")
      .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)))
    .addSubcommand(s => s.setName("info").setDescription("View an infraction.")
      .addStringOption(o => o.setName("id").setDescription("Infraction ID").setRequired(true)))
    .addSubcommand(s => s.setName("revoke").setDescription("Revoke an infraction.")
      .addStringOption(o => o.setName("id").setDescription("Infraction ID").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Revocation reason").setRequired(true))),
  async execute({ message, interaction, args }) {
    const guild = interaction ? interaction.guild : message.guild, actor = interaction ? interaction.member : message.member;
    const cfg = getConfig()[guild.id] || {};
    if (interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === "create") {
        if (!canStaff(actor, cfg)) return interaction.reply({ content: "You are not authorized to issue infractions.", ephemeral: true });
        const user = interaction.options.getUser("user"), target = await guild.members.fetch(user.id);
        return createInfraction({ guild, issuer: interaction.user, respond: p => interaction.reply(p) }, target,
          interaction.options.getString("type"), interaction.options.getString("reason"), interaction.options.getBoolean("appealable"));
      }
      if (sub === "list") {
        const user = interaction.options.getUser("user");
        const found = getInfractions().filter(x => x.guildId === guild.id && x.userId === user.id);
        const lines = found.slice(-15).map(x => "**" + x.id + "** · " + x.type + " · " + (x.revoked ? "Revoked" : "Active") + " — " + x.reason);
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle("Infractions · " + user.tag).setDescription(lines.join("\n") || "No infractions found.").setColor(0x5865F2)], ephemeral: true });
      }
      if (sub === "info") {
        const item = getInfractions().find(x => x.guildId === guild.id && x.id === interaction.options.getString("id"));
        return interaction.reply(item ? { embeds: [infractionEmbed(item)] } : { content: "Infraction not found.", ephemeral: true });
      }
      if (sub === "revoke") {
        if (!canManage(actor, cfg)) return interaction.reply({ content: "You need the configured HR/Admin role.", ephemeral: true });
        return revoke({ guild, issuer: interaction.user, respond: p => interaction.reply(p) },
          interaction.options.getString("id"), interaction.options.getString("reason"));
      }
    }
    if (!canStaff(actor, cfg)) return message.reply("You are not authorized to issue infractions.");
    const target = await fetchUserMember(guild, args[0]);
    const typeKey = (args[1] || "").toLowerCase().replace(/-/g, " ");
    const type = INFRACTION_TYPES.find(x => x.toLowerCase() === typeKey);
    const bool = (args.at(-1) || "").toLowerCase();
    if (!target || !type || !["true", "false"].includes(bool) || args.length < 4)
      return message.reply("Usage: -infraction @user <warning|strike|final-warning|demotion|suspension|termination> <reason> <true|false>");
    const reason = args.slice(2, -1).join(" ").trim();
    if (!reason) return message.reply("Reason is required.");
    return createInfraction({ guild, issuer: message.author, respond: p => message.reply(p) }, target, type, reason, bool === "true");
  }
};

const infractions = {
  data: new SlashCommandBuilder().setName("infractions").setDescription("List a member's infractions.")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true)),
  async execute({ message, interaction, args }) {
    const guild = interaction ? interaction.guild : message.guild;
    const user = interaction ? interaction.options.getUser("user") : await fetchUserMember(guild, args[0]).then(m => m && m.user);
    if (!user) return reply({ message, interaction }, { content: "Usage: -infractions @user" });
    const found = getInfractions().filter(x => x.guildId === guild.id && x.userId === user.id);
    const lines = found.map(x => "**" + x.id + "** · " + x.type + " · " + (x.revoked ? "Revoked" : "Active") + " — " + x.reason);
    return reply({ message, interaction }, { embeds: [new EmbedBuilder().setTitle("Infractions · " + user.tag).setDescription(lines.join("\n") || "No infractions found.").setColor(0x5865F2)], ephemeral: Boolean(interaction) });
  }
};
const infractionInfo = {
  data: new SlashCommandBuilder().setName("infractioninfo").setDescription("View an infraction by ID.")
    .addStringOption(o => o.setName("id").setDescription("Infraction ID").setRequired(true)),
  async execute({ message, interaction, args }) {
    const guild = interaction ? interaction.guild : message.guild, id = interaction ? interaction.options.getString("id") : args[0];
    const item = getInfractions().find(x => x.guildId === guild.id && x.id === id);
    return reply({ message, interaction }, item ? { embeds: [infractionEmbed(item)] } : { content: "Infraction not found.", ephemeral: true });
  }
};
const infractionRevoke = {
  data: new SlashCommandBuilder().setName("infractionrevoke").setDescription("Revoke an infraction.")
    .addStringOption(o => o.setName("id").setDescription("Infraction ID").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)),
  async execute({ message, interaction, args }) {
    const guild = interaction ? interaction.guild : message.guild, actor = interaction ? interaction.member : message.member;
    const cfg = getConfig()[guild.id] || {};
    if (!canManage(actor, cfg)) return reply({ message, interaction }, { content: "You need the configured HR/Admin role.", ephemeral: true });
    const id = interaction ? interaction.options.getString("id") : args[0];
    const reason = interaction ? interaction.options.getString("reason") : args.slice(1).join(" ");
    if (!id || !reason) return reply({ message, interaction }, { content: "Usage: -infractionrevoke <InfractionID> <reason>" });
    return revoke({ guild, issuer: interaction ? interaction.user : message.author, respond: p => reply({ message, interaction }, p) }, id, reason);
  }
};

const ticketPanel = {
  data: new SlashCommandBuilder().setName("ticketpanel").setDescription("Post the Support ticket panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute({ message, interaction }) {
    const guild = interaction ? interaction.guild : message.guild, member = interaction ? await guild.members.fetch(interaction.user.id) : message.member;
    const cfg = getConfig()[guild.id] || {};
    if (!canManage(member, cfg)) return reply({ message, interaction }, { content: "Only HR/Admin can post the ticket panel.", ephemeral: true });
    const menu = new StringSelectMenuBuilder().setCustomId("fhrp:ticket-type").setPlaceholder("Select a support category")
      .addOptions(TICKET_TYPES.map((x, i) => ({ label: x, value: String(i) })));
    const embed = new EmbedBuilder().setTitle("FHRP Support").setColor(0x5865F2)
      .setDescription("Select a category below to open a private ticket. Please provide clear details.");
    return reply({ message, interaction }, { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
  }
};

async function handleComponents(interaction) {
  if (interaction.isStringSelectMenu() && interaction.customId === "fhrp:ticket-type") {
    const index = Number(interaction.values[0]), type = TICKET_TYPES[index];
    const modal = new ModalBuilder().setCustomId("fhrp:ticket-modal:" + index).setTitle(type + " Ticket");
    const subject = new TextInputBuilder().setCustomId("subject").setLabel("Subject").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true);
    const details = new TextInputBuilder().setCustomId("details").setLabel("Describe your issue").setStyle(TextInputStyle.Paragraph).setMaxLength(1500).setRequired(true);
    const infId = new TextInputBuilder().setCustomId("infractionId").setLabel("Infraction ID (if applicable)").setStyle(TextInputStyle.Short).setMaxLength(20).setRequired(false);
    modal.addComponents(new ActionRowBuilder().addComponents(subject), new ActionRowBuilder().addComponents(details), new ActionRowBuilder().addComponents(infId));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith("fhrp:ticket-modal:")) {
    const type = TICKET_TYPES[Number(interaction.customId.split(":").pop())], guild = interaction.guild;
    const cfg = getConfig()[guild.id] || {}, category = cfg.channels && cfg.channels.supportCategory;
    const staffRole = cfg.roles && (cfg.roles.supportStaff || cfg.roles.staff);
    if (!category) return interaction.reply({ content: "Support Category is not configured. Use /setup channel first.", ephemeral: true });
    const subject = interaction.fields.getTextInputValue("subject");
    const details = interaction.fields.getTextInputValue("details");
    const infractionId = interaction.fields.getTextInputValue("infractionId") || "Not provided";
    const channel = await guild.channels.create({
      name: "ticket-" + interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 18),
      type: ChannelType.GuildText, parent: category,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
        ...(staffRole ? [{ id: staffRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
        { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
      ]
    });
    const all = getTickets(), ticket = { id: makeId(all, "TKT-"), guildId: guild.id, channelId: channel.id,
      userId: interaction.user.id, type, subject, details, infractionId, status: "Open", claimedBy: null, createdAt: new Date().toISOString() };
    all.push(ticket); save("tickets.json", all);
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("fhrp:claim:" + ticket.id).setLabel("Claim").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("fhrp:close:" + ticket.id).setLabel("Close").setStyle(ButtonStyle.Danger)
    );
    const embed = new EmbedBuilder().setTitle(type + " · " + ticket.id).setColor(0x5865F2)
      .addFields({ name: "Opened by", value: interaction.user.toString(), inline: true },
        { name: "Subject", value: subject }, { name: "Details", value: details }, { name: "Infraction ID", value: infractionId })
      .setTimestamp();
    await channel.send({ content: interaction.user.toString() + (staffRole ? " <@&" + staffRole + ">" : ""), embeds: [embed], components: [buttons] });
    return interaction.reply({ content: "Your ticket has been created: " + channel, ephemeral: true });
  }
  if (interaction.isButton() && interaction.customId.startsWith("fhrp:")) {
    const parts = interaction.customId.split(":"), action = parts[1], id = parts[2];
    const all = getTickets(), ticket = all.find(x => x.id === id && x.guildId === interaction.guildId);
    if (!ticket) return interaction.reply({ content: "Ticket record not found.", ephemeral: true });
    const cfg = getConfig()[interaction.guildId] || {}, actor = await interaction.guild.members.fetch(interaction.user.id).catch(() => null), staff = canStaff(actor, cfg);
    if (action === "claim") {
      if (!staff) return interaction.reply({ content: "Only staff can claim tickets.", ephemeral: true });
      if (ticket.claimedBy) return interaction.reply({ content: "Already claimed by <@" + ticket.claimedBy + ">.", ephemeral: true });
      ticket.claimedBy = interaction.user.id; save("tickets.json", all);
      return interaction.reply({ content: "Ticket claimed by " + interaction.user + "." });
    }
    if (action === "close") {
      if (interaction.user.id !== ticket.userId && !staff) return interaction.reply({ content: "Only the opener or staff can close this ticket.", ephemeral: true });
      ticket.status = "Closed"; ticket.closedAt = new Date().toISOString(); save("tickets.json", all);
      const msgs = await interaction.channel.messages.fetch({ limit: 100 });
      const transcript = [...msgs.values()].reverse().map(m => "[" + m.createdAt.toISOString() + "] " + m.author.tag + ": " + m.cleanContent).join("\n");
      const file = new AttachmentBuilder(Buffer.from(transcript || "No messages", "utf8"), { name: ticket.id + "-transcript.txt" });
      await sendChannel(interaction.guild, cfg.channels && cfg.channels.ticketLogs, { content: "Transcript for " + ticket.id, files: [file] });
      await interaction.channel.permissionOverwrites.edit(ticket.userId, { SendMessages: false });
      await interaction.channel.setName("closed-" + ticket.id.toLowerCase()).catch(() => null);
      const reopenRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("fhrp:reopen:" + ticket.id).setLabel("Reopen").setStyle(ButtonStyle.Success)
      );
      await interaction.message.edit({ components: [reopenRow] }).catch(() => null);
      return interaction.reply({ content: "Ticket closed. Transcript sent to the configured log channel." });
    }
    if (action === "reopen") {
      if (!staff) return interaction.reply({ content: "Only staff can reopen tickets.", ephemeral: true });
      if (ticket.status !== "Closed") return interaction.reply({ content: "This ticket is already open.", ephemeral: true });
      ticket.status = "Open"; ticket.reopenedAt = new Date().toISOString(); save("tickets.json", all);
      await interaction.channel.permissionOverwrites.edit(ticket.userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      await interaction.channel.setName("ticket-" + ticket.id.toLowerCase()).catch(() => null);
      const openRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("fhrp:claim:" + ticket.id).setLabel("Claim").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("fhrp:close:" + ticket.id).setLabel("Close").setStyle(ButtonStyle.Danger)
      );
      await interaction.message.edit({ components: [openRow] }).catch(() => null);
      return interaction.reply({ content: "Ticket reopened by " + interaction.user + "." });
    }
  }
}

module.exports = {
  commands: [setup, promote, infraction, infractions, infractionInfo, infractionRevoke, ticketPanel],
  handleComponents
};
