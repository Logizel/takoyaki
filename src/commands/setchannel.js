import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { setChannelId, getChannelId } from '../database.js';

export async function setchannelCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
  }

  setChannelId(interaction.channelId);

  const embed = new EmbedBuilder()
    .setColor(0x28a745)
    .setTitle('✅ Channel Set for Notifications')
    .setDescription(`Takoyaki will now send GitHub notifications to <#${interaction.channelId}>.`)
    .addFields({ name: 'Channel ID', value: `\`${interaction.channelId}\``, inline: true })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export const setchannelCommandData = new SlashCommandBuilder()
  .setName('setchannel')
  .setDescription('Set this channel for Takoyaki notifications')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);