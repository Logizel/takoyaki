import { EmbedBuilder } from 'discord.js';
import { createOAuthState, getUser } from '../database.js';

export async function linkCommand(interaction) {
  const existingUser = getUser(interaction.user.id);
  const state = createOAuthState(interaction.user.id);
  const oauthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&state=${state}&scope=read:user`;

  let description = `🔗 Click this link to authorize Takoyaki with GitHub:\n${oauthUrl}`;
  let title = '🔗 Link GitHub Account';
  let color = 0x24292e;

  if (existingUser) {
    title = '🔄 Re-link GitHub Account';
    color = 0xd63384;
    description = `✅ Updated link: **@${existingUser}** \n\nRe-authorize to link a different account:\n${oauthUrl}`;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: 'Takoyaki Bot' });

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}