import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createOAuthState, getUser } from '../database.js';

export async function linkCommand(interaction) {
  const existingUser = getUser(interaction.user.id);
  const state = createOAuthState(interaction.user.id, interaction.token);
  const oauthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${process.env.BASE_URL}/auth/callback&state=${state}&scope=read:user`;

  let title = '🔗 Link GitHub Account';
  let color = 0x24292e;

  if (existingUser) {
    title = '🔄 Re-link GitHub Account';
    color = 0xd63384;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription('Click the button below to authorize Takoyaki with your GitHub account.')
    .addFields(
      { name: '📋 What happens next', value: 'After authorizing, GitHub events from your repos will ping you in Discord.' },
      { name: '🔒 Privacy', value: 'Private repos will show as "private repo" without exposing the name.' }
    )
    .setTimestamp()
    .setFooter({ text: 'Takoyaki Bot' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(existingUser ? 'Re-authorize with GitHub' : 'Authorize with GitHub')
      .setStyle(ButtonStyle.Link)
      .setURL(oauthUrl)
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}