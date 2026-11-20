require("dotenv").config({ path: "keys.env" });

const {
    Client,
    GatewayIntentBits
} = require("discord.js");

const { EmbedBuilder } = require("discord.js");

const serverCommand = require("./commands/server");
const { getApiPing } = require("./services/erlc");

const PREFIX = "-";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Bot Ready
client.once("clientReady", () => {
    console.log(`${client.user.tag} is online!`);
});

// Prefix Commands
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content
        .slice(PREFIX.length)
        .trim()
        .split(/ +/);

    const command = args.shift().toLowerCase();

    try {
        if (command === "ping") {
            const sent = await message.reply("Pinging...");

            const botLatency =
                sent.createdTimestamp - message.createdTimestamp;

            const discordLatency = Math.round(client.ws.ping);

            let erlcLatency = "Unavailable";

            try {
                erlcLatency = `${await getApiPing()}ms`;
            } catch (error) {
                console.error("ERLC Ping Error:", error.message);
            }

const utcTime = new Date().toISOString()
    .replace("T", " ")
    .slice(0, 19) + " UTC";

const embed = new EmbedBuilder()
    .setTitle("Pong!")
    .setColor(0x5865F2)
    .addFields(
        {
            name: "Bot Latency",
            value: `${botLatency}ms`,
            inline: true
        },
        {
            name: "Discord API",
            value: `${discordLatency}ms`,
            inline: true
        },
        {
            name: "ER:LC API",
            value: erlcLatency,
            inline: true
        }
    )
    .setFooter({ text: `FVRP Utilities • ${utcTime}` });
            await sent.edit({ content: "", embeds: [embed] });
        }

        else if (command === "server") {
            await serverCommand.execute(message);
        }

    } catch (error) {
        console.error(error);
        await message.reply(
            "An error occurred while executing this command."
        );
    }
});

// Login
client.login(process.env.DISCORD_TOKEN);