const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const packageInfo = require("../../package.json");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("version")
        .setDescription("Show the current FHRP Utilities version."),

    async execute({ message, interaction }) {
        const embed = new EmbedBuilder()
            .setTitle("FHRP Utilities")
            .setDescription(`Version **v${packageInfo.version}**`)
            .setColor(0x5865F2)
            .setTimestamp();

        if (interaction) {
            await interaction.reply({ embeds: [embed] });
        } else {
            await message.reply({ embeds: [embed] });
        }
    }
};
