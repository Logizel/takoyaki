import { EmbedBuilder } from 'discord.js';

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
      `Click the link below to install the **Takoyaki** GitHub App on your account.\n\n` +
      `Once installed, GitHub will automatically send all events from **all your repos** to Takoyaki. ` +
      `No need to configure webhooks per-repo.\n\n` +
      `[Install Takoyaki GitHub App](${installUrl})`
    )
    .addFields(
      { name: '📋 What you get', value: 'Pings for pushes, PRs, issues, and repo creation across all your repos.' },
      { name: '🔒 Privacy', value: 'Private repos will show as "private repo" without exposing the name.' }
    )
    .setTimestamp()
    .setFooter({ text: 'Takoyaki Bot' });

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}