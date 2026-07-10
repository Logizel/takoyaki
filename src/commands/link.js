import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createOAuthState, getUser } from '../database.js';

export async function linkCommand(interaction) {
  const existingUser = getUser(interaction.user.id);
  const appName = process.env.GITHUB_APP_NAME;
  if (!appName) {
    return interaction.reply({
      content: '❌ GITHUB_APP_NAME is not configured.',
      ephemeral: true,
    });
  }

  const state = createOAuthState(interaction.user.id, interaction.token);
  const installUrl = `https://github.com/apps/${appName}/installations/new?state=${state}`;

  let title = '🔗 Link GitHub Account';
  let color = 0x24292e;

  if (existingUser) {
    title = '🔄 Re-link GitHub Account';
    color = 0xd63384;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(
      'Click the button below to install Takoyaki on your GitHub account and authorize it.\n\n' +
      'Once installed, GitHub events from **all your repos** will ping you here in Discord.'
    )
    .addFields(
      { name: '📋 What happens next', value: 'After authorizing, pushes, PRs, issues, and repo creation will notify you.' },
      { name: '🔒 Privacy', value: 'Private repos will show as "private repo" without exposing the name.' }
    )
    .setTimestamp()
    .setFooter({ text: 'Takoyaki Bot' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(existingUser ? 'Re-link GitHub Account' : 'Link GitHub Account')
      .setStyle(ButtonStyle.Link)
      .setURL(installUrl)
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}