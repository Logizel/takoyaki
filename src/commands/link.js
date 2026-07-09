import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createOAuthState, getUser } from '../database.js';

export async function linkCommand(interaction) {
  const existingUser = getUser(interaction.user.id);
  if (existingUser) {
    return interaction.reply({
      content: `✅ You are already linked to GitHub account **@${existingUser.githubLogin}**. Run the command again to re-link.`,
      ephemeral: true,
    });
  }

  const state = createOAuthState(interaction.user.id);
  const oauthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${process.env.BASE_URL}/auth/callback&scope=repo,user&state=${state}`;

  const embed = new EmbedBuilder()
    .setColor(0xd63384)
    .setTitle('🐙 Link GitHub Account')
    .setDescription('Click the button below to authorize Takoyaki to access your GitHub account.')
    .addFields(
      { name: 'Permissions Requested', value: '`repo` - Access to repositories (commits, PRs, issues)\n`user:email` - Your email address (for identification)' },
      { name: 'Privacy', value: 'We only store your GitHub ID, username, and access token. We never share your data.' }
    )
    .setTimestamp()
    .setFooter({ text: 'Takoyaki Bot' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Link GitHub Account')
      .setStyle(ButtonStyle.Link)
      .setURL(oauthUrl)
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}

export const linkCommandData = new SlashCommandBuilder()
  .setName('github')
  .setDescription('Link or unlink your GitHub account')
  .addSubcommand(subcommand =>
    subcommand
      .setName('link')
      .setDescription('Link your GitHub account via OAuth')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('unlink')
      .setDescription('Unlink your GitHub account')
  );