import { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { setChannel } from '../database.js';

export async function setchannelCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: '❌ You need Administrator permission to use this command.',
      ephemeral: true,
    });
  }

  await setChannel(interaction.guildId, interaction.channelId);

  const embed = new EmbedBuilder()
    .setColor(0x28a745)
    .setTitle('✅ Channel Set for Notifications')
    .setDescription(`Notifications will be sent to <#${interaction.channelId}>.\n\nChoose a mode:`)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('org_mode')
      .setLabel('🏢 Enable Org Mode')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('standard_mode')
      .setLabel('📋 Standard Mode')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}