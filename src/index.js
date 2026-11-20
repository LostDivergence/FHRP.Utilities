const path = require("node:path");
const dotenv = require("dotenv");
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes
} = require("discord.js");

dotenv.config({ path: path.resolve(__dirname, "../keys.env") });
dotenv.config();

const commands = [
    require("./commands/ping"),
    require("./commands/server"),
    require("./commands/version")
];

const commandMap = new Map(
    commands.map((command) => [command.data.name, command])
);

const PREFIX = "-";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

async function registerSlashCommands() {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

    await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands.map((command) => command.data.toJSON()) }
    );

    console.log(`Registered ${commands.length} global slash commands.`);
}

client.once("clientReady", async () => {
    console.log(`${client.user.tag} is online!`);

    try {
        await registerSlashCommands();
    } catch (error) {
        console.error("Slash command registration failed:", error);
    }
});

client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const parts = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const name = parts.shift()?.toLowerCase();
    if (!name) return;

    const command = commandMap.get(name);
    if (!command) return;

    try {
        await command.execute({
            client,
            message,
            args: parts
        });
    } catch (error) {
        console.error(`Prefix command error (${name}):`, error);

        if (!message.replied) {
            await message.reply("An error occurred while executing this command.");
        }
    }
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute({
            client,
            interaction,
            args: []
        });
    } catch (error) {
        console.error(`Slash command error (${interaction.commandName}):`, error);

        const payload = {
            content: "An error occurred while executing this command.",
            ephemeral: true
        };

        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(payload);
        } else {
            await interaction.reply(payload);
        }
    }
});

if (!process.env.DISCORD_TOKEN) {
    throw new Error("DISCORD_TOKEN is missing. Check keys.env or your hosting environment variables.");
}

client.login(process.env.DISCORD_TOKEN);
