import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { setChannel } from '../database.js';

export async function setchannelCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
  }

  setChannel(interaction.guildId, interaction.channelId);

  const embed = new EmbedBuilder()
    .setColor(0x28a745)
    .setTitle('✅ Channel Set for Notifications')
    .setDescription(`Takoyaki will now send GitHub notifications to <#${interaction.channelId}>.`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}