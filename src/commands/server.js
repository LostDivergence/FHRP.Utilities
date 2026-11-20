const { EmbedBuilder } = require("discord.js");
const { getServerInfo } = require("../services/erlc");

async function execute(message) {
    try {
        const server = await getServerInfo();

        const embed = new EmbedBuilder()
            .setTitle(server.Name)
            .setColor(0x5865F2)
            .addFields(
                {
                    name: "Players",
                    value: `${server.CurrentPlayers}/${server.MaxPlayers}`,
                    inline: true
                },
                {
                    name: "Join Key",
                    value: server.JoinKey || "Unknown",
                    inline: true
                }
            )
            .setFooter({ text: "FVRP Utilities" })
            .setTimestamp();

        await message.reply({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        await message.reply("Failed to retrieve server information.");
    }
}

module.exports = { execute };