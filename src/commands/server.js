const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { getServerInfo } = require("../services/erlc");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("server")
        .setDescription("View the current ER:LC server information."),

    async execute({ message, interaction }) {
        if (interaction) {
            await interaction.deferReply();
        }

        try {
            const server = await getServerInfo();

            const embed = new EmbedBuilder()
                .setTitle(server.Name || "ER:LC Server")
                .setColor(0x5865F2)
                .addFields(
                    {
                        name: "Players",
                        value: `${server.CurrentPlayers ?? "?"}/${server.MaxPlayers ?? "?"}`,
                        inline: true
                    },
                    {
                        name: "Join Key",
                        value: server.JoinKey || "Unknown",
                        inline: true
                    }
                )
                .setFooter({ text: "FHRP Utilities" })
                .setTimestamp();

            if (interaction) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await message.reply({ embeds: [embed] });
            }
        } catch (error) {
            console.error("ER:LC server command failed:", error);

            const payload = { content: "Failed to retrieve server information." };
            if (interaction) {
                await interaction.editReply(payload);
            } else {
                await message.reply(payload);
            }
        }
    }
};
