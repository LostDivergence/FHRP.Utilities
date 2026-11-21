const path = require("node:path");
const dotenv = require("dotenv");
const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");

dotenv.config({ path: path.resolve(__dirname, "../keys.env") });
dotenv.config();

const staffSystem = require("./commands/staff");
const commands = [
    require("./commands/ping"),
    require("./commands/server"),
    require("./commands/version"),
    ...staffSystem.commands
];
const commandMap = new Map(commands.map(command => [command.data.name, command]));
const PREFIX = "-";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

async function registerSlashCommands() {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), {
        body: commands.map(command => command.data.toJSON())
    });
    console.log("Registered " + commands.length + " global slash commands.");
}

client.once("clientReady", async () => {
    console.log(client.user.tag + " is online!");
    try { await registerSlashCommands(); }
    catch (error) { console.error("Slash command registration failed:", error); }
});

client.on("messageCreate", async message => {
    if (message.author.bot || !message.guild || !message.content.startsWith(PREFIX)) return;
    const parts = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const name = parts.shift()?.toLowerCase();
    if (!name) return;
    const command = commandMap.get(name);
    if (!command) return;
    try { await command.execute({ client, message, args: parts }); }
    catch (error) {
        console.error("Prefix command error (" + name + "):", error);
        if (!message.replied) await message.reply("An error occurred while executing this command.");
    }
});

client.on("interactionCreate", async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = commandMap.get(interaction.commandName);
            if (command) await command.execute({ client, interaction, args: [] });
            return;
        }
        if (interaction.isStringSelectMenu() || interaction.isButton() || interaction.isModalSubmit()) {
            await staffSystem.handleComponents(interaction);
        }
    } catch (error) {
        console.error("Interaction error:", error);
        const payload = { content: "An error occurred while processing this interaction.", ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
        else await interaction.reply(payload).catch(() => null);
    }
});

if (!process.env.DISCORD_TOKEN) {
    throw new Error("DISCORD_TOKEN is missing. Check keys.env or your hosting environment variables.");
}
client.login(process.env.DISCORD_TOKEN);
