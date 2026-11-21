const fs = require("node:fs");
const path = require("node:path");
const { SlashCommandBuilder } = require("discord.js");

const DATA_DIR = path.resolve(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "afk.json");

function loadAfk() {
    try {
        if (!fs.existsSync(DATA_FILE)) return {};
        return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch (error) {
        console.error("Could not read afk.json:", error);
        return {};
    }
}

function saveAfk(data) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const temporaryFile = DATA_FILE + ".tmp";
    fs.writeFileSync(temporaryFile, JSON.stringify(data, null, 2));
    fs.renameSync(temporaryFile, DATA_FILE);
}

function getKey(guildId, userId) {
    return guildId + ":" + userId;
}

function setAfk(guildId, userId, reason) {
    const data = loadAfk();
    data[getKey(guildId, userId)] = {
        reason: reason || "AFK",
        since: new Date().toISOString()
    };
    saveAfk(data);
}

function clearAfk(guildId, userId) {
    const data = loadAfk();
    const key = getKey(guildId, userId);
    if (!data[key]) return null;
    const entry = data[key];
    delete data[key];
    saveAfk(data);
    return entry;
}

const command = {
    data: new SlashCommandBuilder()
        .setName("afk")
        .setDescription("Set your AFK status.")
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Why you are away")
                .setMaxLength(200)
                .setRequired(false)
        ),

    async execute({ message, interaction, args }) {
        const reason = interaction
            ? (interaction.options.getString("reason") || "AFK").trim()
            : (args.join(" ").trim() || "AFK");

        setAfk(
            interaction ? interaction.guildId : message.guild.id,
            interaction ? interaction.user.id : message.author.id,
            reason
        );

        const response = "You are now marked as AFK. Reason: **" + reason + "**";
        if (interaction) return interaction.reply({ content: response });
        return message.reply(response);
    }
};

async function handleMessage(message) {
    const guildId = message.guild.id;
    const authorAfk = clearAfk(guildId, message.author.id);

    if (authorAfk) {
        await message.reply({
            content: "Welcome back, " + message.author.toString() + ". Your AFK status has been removed.",
            allowedMentions: { users: [] }
        });
    }

    const afkData = loadAfk();
    const notices = [];
    for (const user of message.mentions.users.values()) {
        if (user.bot || user.id === message.author.id) continue;
        const entry = afkData[getKey(guildId, user.id)];
        if (entry) notices.push("**" + user.tag + "** is currently AFK: " + entry.reason);
    }

    if (notices.length) {
        await message.reply({
            content: notices.join("\n"),
            allowedMentions: { parse: [] }
        });
    }
}

module.exports = { command, handleMessage };
