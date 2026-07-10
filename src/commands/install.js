import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export async function installCommand(interaction) {
  const appName = process.env.GITHUB_APP_NAME;
  if (!appName) {
    return interaction.reply({
      content: '❌ GITHUB_APP_NAME is not configured.',
      ephemeral: true,
    });
  }

  const installUrl = `https://github.com/apps/${appName}/installations/new`;

  const embed = new EmbedBuilder()
    .setColor(0x24292e)
    .setTitle('📦 Install Takoyaki GitHub App')
    .setDescription(
      'Click the button below to install Takoyaki on your GitHub account.\n\n' +
      'Once installed, GitHub will automatically send events from **all your repos** — no per-repo webhooks needed.'
    )
    .addFields(
      { name: '📋 What you get', value: 'Pings for pushes, PRs, issues, and repo creation across all your repos.' },
      { name: '🔒 Privacy', value: 'Private repos will show as "private repo" without exposing the name.' }
    )
    .setTimestamp()
    .setFooter({ text: 'Takoyaki Bot' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Install Takoyaki GitHub App')
      .setStyle(ButtonStyle.Link)
      .setURL(installUrl)
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}