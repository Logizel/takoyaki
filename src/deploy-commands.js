import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import 'dotenv/config';

const commands = [
  new SlashCommandBuilder()
    .setName('github')
    .setDescription('Manage your GitHub integration with Takoyaki.')
    .addSubcommand(sub => sub.setName('link').setDescription('Install the GitHub App and link your account.'))
    .addSubcommand(sub => sub.setName('unlink').setDescription('Remove your GitHub link.')),
  new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Set this channel for Takoyaki notifications.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();