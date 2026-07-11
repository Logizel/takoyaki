import { EmbedBuilder } from 'discord.js';
import { getUser, getAllLogins, getTodayCommits, getAllTodayCommits, readData } from '../database.js';

function fmt(n) {
  return n.toLocaleString();
}

async function fetchCommitCount(login, token, since, until) {
  const q = `author:${login}+committer-date:${since}..${until}`;
  const url = `https://api.github.com/search/commits?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.cloak-preview',
    },
  });
  const body = await res.json();
  if (!res.ok) {
    console.error('GitHub API error:', res.status, JSON.stringify(body));
    throw new Error(`GitHub API: ${res.status}`);
  }
  return body.total_count || 0;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function yearAgoStr() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function generateStreakGrid(discordId) {
  const data = readData();
  const commits = data.commits[discordId] || {};

  const today = new Date();
  const oneDay = 24 * 60 * 60 * 1000;

  const grid = [];
  for (let i = 0; i < 182; i++) {
    const d = new Date(today.getTime() - i * oneDay);
    const key = d.toISOString().slice(0, 10);
    grid.push({ date: d, count: commits[key] || 0 });
  }
  grid.reverse();

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const lines = [];

  for (let row = 0; row < 7; row++) {
    let line = dayNames[row] + ' ';
    for (let col = 0; col < 26; col++) {
      const idx = col * 7 + row;
      if (idx >= grid.length) {
        line += ' ';
        continue;
      }
      const count = grid[idx].count;
      if (count === 0) {
        line += '\x1b[0;100m \x1b[0m';
      } else if (count <= 3) {
        line += '\x1b[2;32m▓\x1b[0m';
      } else if (count <= 6) {
        line += '\x1b[0;32m█\x1b[0m';
      } else if (count <= 10) {
        line += '\x1b[1;32m▓\x1b[0m';
      } else {
        line += '\x1b[1;32m█\x1b[0m';
      }
    }
    lines.push(line);
  }

  return '```ansi\n' + lines.join('\n') + '\n```';
}

export async function statsCommand(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'me') {
    await statsMe(interaction);
  } else if (sub === 'compare') {
    await statsCompare(interaction);
  } else if (sub === 'top') {
    await statsTop(interaction);
  } else if (sub === 'top-day') {
    await statsTopDay(interaction);
  } else if (sub === 'streak') {
    await statsStreak(interaction);
  }
}

async function statsMe(interaction) {
  const user = getUser(interaction.user.id);
  if (!user || !user.accessToken) {
    return interaction.reply({
      content: '❌ No GitHub account linked or missing access token. Please run `/github link` again.',
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const today = todayStr();
    const until = todayStr();
    const yearAgo = yearAgoStr();

    const sinceToday = today + 'T00:00:00Z';
    const untilToday = today + 'T23:59:59Z';

    const [todayCount, yearCount, localToday] = await Promise.all([
      fetchCommitCount(user.githubLogin, user.accessToken, sinceToday, untilToday),
      fetchCommitCount(user.githubLogin, user.accessToken, yearAgo, until),
      Promise.resolve(getTodayCommits(interaction.user.id)),
    ]);

    const totalLocal = yearCount + localToday;

    const embed = new EmbedBuilder()
      .setColor(0x24292e)
      .setTitle(`📊 Commit Stats — @${user.githubLogin}`)
      .addFields(
        { name: '📅 Today', value: `**${fmt(todayCount + localToday)}** commits`, inline: true },
        { name: '📆 Past 365 days', value: `**${fmt(yearCount)}** commits`, inline: true },
        { name: '🏆 Daily average', value: `**${(yearCount / 365).toFixed(1)}** / day`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Stats me error:', err);
    await interaction.editReply({ content: '❌ Failed to fetch commit stats from GitHub. Try again later.' });
  }
}

async function statsCompare(interaction) {
  const targetUser = interaction.options.getUser('user');
  if (!targetUser) {
    return interaction.reply({ content: '❌ Please specify a user to compare with.', ephemeral: true });
  }

  const me = getUser(interaction.user.id);
  const them = getUser(targetUser.id);

  if (!me || !me.accessToken) {
    return interaction.reply({ content: '❌ You need to link your GitHub account first via `/github link`.', ephemeral: true });
  }
  if (!them || !them.accessToken) {
    return interaction.reply({ content: '❌ That user hasn\'t linked their GitHub account.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const today = todayStr();
    const yearAgo = yearAgoStr();

    const [myYear, theirYear] = await Promise.all([
      fetchCommitCount(me.githubLogin, me.accessToken, yearAgo, today),
      fetchCommitCount(them.githubLogin, them.accessToken, yearAgo, today),
    ]);

    const diff = myYear - theirYear;
    const sign = diff >= 0 ? '+' : '';
    const winner = diff > 0 ? `<@${interaction.user.id}>` : diff < 0 ? `<@${targetUser.id}>` : 'Nobody';

    const embed = new EmbedBuilder()
      .setColor(0x24292e)
      .setTitle('📊 Commit Comparison (Past 365 Days)')
      .setDescription(`${winner} is ahead!`)
      .addFields(
        { name: `@${me.githubLogin}`, value: `**${fmt(myYear)}** commits`, inline: true },
        { name: `@${them.githubLogin}`, value: `**${fmt(theirYear)}** commits`, inline: true },
        { name: 'Difference', value: `**${sign}${fmt(Math.abs(diff))}**`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Stats compare error:', err);
    await interaction.editReply({ content: '❌ Failed to fetch commit stats. Try again later.' });
  }
}

async function statsTop(interaction) {
  const allUsers = getAllLogins().filter(u => u.accessToken);
  if (allUsers.length === 0) {
    return interaction.reply({ content: '❌ No users have linked their GitHub accounts yet.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const today = todayStr();
    const yearAgo = yearAgoStr();

    const results = [];
    for (const u of allUsers) {
      try {
        const count = await fetchCommitCount(u.githubLogin, u.accessToken, yearAgo, today);
        results.push({ discordId: u.discordId, githubLogin: u.githubLogin, count });
      } catch {
        // skip failed fetches
      }
    }

    results.sort((a, b) => b.count - a.count);

    const medals = ['🥇', '🥈', '🥉'];
    let description = '';
    for (let i = 0; i < Math.min(results.length, 10); i++) {
      const r = results[i];
      const rank = i < 3 ? medals[i] : `#${i + 1}`;
      description += `${rank} <@${r.discordId}> — **${fmt(r.count)}** commits\n`;
    }

    if (results.length > 10) {
      description += `\n... and ${results.length - 10} more`;
    }

    const embed = new EmbedBuilder()
      .setColor(0x24292e)
      .setTitle('🏆 Commit Leaderboard (Past 365 Days)')
      .setDescription(description)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('Stats top error:', err);
    await interaction.editReply({ content: '❌ Failed to fetch leaderboard. Try again later.' });
  }
}

async function statsTopDay(interaction) {
  const allToday = getAllTodayCommits();
  if (allToday.length === 0) {
    return interaction.reply({ content: '📭 No commits from anyone today yet.', ephemeral: true });
  }

  allToday.sort((a, b) => b.count - a.count);

  const medals = ['🥇', '🥈', '🥉'];
  let description = `📅 **${todayStr()}**\n\n`;
  for (let i = 0; i < Math.min(allToday.length, 10); i++) {
    const r = allToday[i];
    const rank = i < 3 ? medals[i] : `#${i + 1}`;
    description += `${rank} <@${r.discordId}> — **${fmt(r.count)}** commit${r.count !== 1 ? 's' : ''}\n`;
  }

  const embed = new EmbedBuilder()
    .setColor(0x24292e)
    .setTitle('📊 Today\'s Commit Leaders')
    .setDescription(description)
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function statsStreak(interaction) {
  const user = getUser(interaction.user.id);
  if (!user) {
    return interaction.reply({
      content: '❌ No GitHub account linked. Please run `/github link` first.',
      ephemeral: true,
    });
  }

  const grid = generateStreakGrid(interaction.user.id);
  const embed = new EmbedBuilder()
    .setColor(0x24292e)
    .setTitle(`📊 Commit Streak — @${user.githubLogin}`)
    .setDescription(`Past 365 days (data from webhook pushes)\n\n${grid}`)
    .setFooter({ text: '█ ▓ ░ = high → low | ⬛ = no commits' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}