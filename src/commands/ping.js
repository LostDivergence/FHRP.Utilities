const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { getApiPing } = require("../services/erlc");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Check bot, Discord, and ER:LC API latency."),

    async execute({ client, message, interaction }) {
        const startedAt = Date.now();

        let responseMessage = null;
        if (interaction) {
            await interaction.deferReply();
        } else {
            responseMessage = await message.reply("Pinging...");
        }

        const botLatency = interaction
            ? Date.now() - interaction.createdTimestamp
            : responseMessage.createdTimestamp - message.createdTimestamp;

        const discordLatency = Math.round(client.ws.ping);

        let erlcLatency = "Unavailable";
        try {
            erlcLatency = `${await getApiPing()}ms`;
        } catch (error) {
            console.error("ER:LC API ping failed:", error.message);
        }

        const utcTime = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

        const embed = new EmbedBuilder()
            .setTitle("Pong!")
            .setColor(0x5865F2)
            .addFields(
                { name: "Bot Latency", value: `${botLatency}ms`, inline: true },
                { name: "Discord API", value: `${discordLatency}ms`, inline: true },
                { name: "ER:LC API", value: erlcLatency, inline: true }
            )
            .setFooter({ text: `FHRP Utilities • ${utcTime}` });

        if (interaction) {
            await interaction.editReply({ embeds: [embed] });
        } else {
            await responseMessage.edit({ content: "", embeds: [embed] });
        }
    }
};
