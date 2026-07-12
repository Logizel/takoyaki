import { EmbedBuilder } from "discord.js";
import {
  getUser,
  getAllLogins,
  getTodayCommits,
  getAllTodayCommits,
} from "../database.js";

function fmt(n) {
  return n.toLocaleString();
}

const GQL_QUERY = `
  query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
        }
      }
    }
  }
`;

const GQL_CALENDAR = `
  query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

async function fetchCommitCount(login, token, since, until) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: GQL_QUERY,
      variables: { login, from: since, to: until },
    }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) {
    console.error(
      "GitHub API error:",
      res.status,
      JSON.stringify(body.errors || body),
    );
    throw new Error(`GitHub API: ${res.status}`);
  }
  return (
    body.data.user.contributionsCollection.contributionCalendar
      .totalContributions || 0
  );
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function yearAgoStr() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function dateStart(s) {
  return s + "T00:00:00Z";
}
function dateEnd(s) {
  return s + "T23:59:59Z";
}

async function generateStreakGrid(login, token) {
  const today = todayStr();
  const yearAgo = yearAgoStr();
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: GQL_CALENDAR,
      variables: { login, from: dateStart(yearAgo), to: dateEnd(today) },
    }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) {
    console.error(
      "GitHub API error:",
      res.status,
      JSON.stringify(body.errors || body),
    );
    throw new Error(`GitHub API: ${res.status}`);
  }
  const weeks =
    body.data.user.contributionsCollection.contributionCalendar.weeks;
  const commits = {};
  for (const week of weeks) {
    for (const day of week.contributionDays) {
      commits[day.date] = day.contributionCount;
    }
  }

  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;

  const grid = [];
  for (let i = 0; i < 182; i++) {
    const d = new Date(now.getTime() - i * oneDay);
    const key = d.toISOString().slice(0, 10);
    grid.push({ date: d, count: commits[key] || 0 });
  }
  grid.reverse();

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const lines = [];

  for (let row = 0; row < 7; row++) {
    let line = dayNames[row] + " ";
    for (let col = 0; col < 26; col++) {
      const idx = col * 7 + row;
      if (idx >= grid.length) {
        line += " ";
        continue;
      }
      const count = grid[idx].count;
      if (count === 0) {
        line += "\x1b[0;100m \x1b[0m";
      } else if (count <= 3) {
        line += "\x1b[2;32m▓\x1b[0m";
      } else if (count <= 6) {
        line += "\x1b[0;32m█\x1b[0m";
      } else if (count <= 10) {
        line += "\x1b[1;32m▓\x1b[0m";
      } else {
        line += "\x1b[1;32m█\x1b[0m";
      }
    }
    lines.push(line);
  }

  return "```ansi\n" + lines.join("\n") + "\n```";
}

export async function statsCommand(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "me") {
    await statsMe(interaction);
  } else if (sub === "compare") {
    await statsCompare(interaction);
  } else if (sub === "top") {
    await statsTop(interaction);
  } else if (sub === "top-day") {
    await statsTopDay(interaction);
  } else if (sub === "streak") {
    await statsStreak(interaction);
  }
}

async function statsMe(interaction) {
  const user = await getUser(interaction.user.id);
  if (!user || !user.accessToken) {
    return interaction.reply({
      content:
        "❌ No GitHub account linked or missing access token. Please run `/github link` again.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: false });

  try {
    const today = todayStr();
    const yearAgo = yearAgoStr();

    const [yearCount, todayCount] = await Promise.all([
      fetchCommitCount(
        user.githubLogin,
        user.accessToken,
        dateStart(yearAgo),
        dateEnd(today),
      ),
      fetchCommitCount(
        user.githubLogin,
        user.accessToken,
        dateStart(today),
        dateEnd(today),
      ),
    ]);

    const embed = new EmbedBuilder()
      .setColor(0x24292e)
      .setTitle(`📊 Contribution Stats — @${user.githubLogin}`)
      .addFields(
        {
          name: "📅 Today",
          value: `**${fmt(todayCount)}** contributions`,
          inline: true,
        },
        {
          name: "📆 Past 365 days",
          value: `**${fmt(yearCount)}** contributions`,
          inline: true,
        },
        {
          name: "🏆 Daily average",
          value: `**${(yearCount / 365).toFixed(1)}** / day`,
          inline: true,
        },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("Stats me error:", err);
    await interaction.editReply({
      content: "❌ Failed to fetch commit stats from GitHub. Try again later.",
    });
  }
}

async function statsCompare(interaction) {
  const targetUser = interaction.options.getUser("user");
  if (!targetUser) {
    return interaction.reply({
      content: "❌ Please specify a user to compare with.",
      ephemeral: true,
    });
  }

  const me = await getUser(interaction.user.id);
  const them = await getUser(targetUser.id);

  if (!me || !me.accessToken) {
    return interaction.reply({
      content:
        "❌ You need to link your GitHub account first via `/github link`.",
      ephemeral: true,
    });
  }
  if (!them || !them.accessToken) {
    return interaction.reply({
      content: "❌ That user hasn't linked their GitHub account.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: false });

  try {
    const today = todayStr();
    const yearAgo = yearAgoStr();

    const [myYear, theirYear] = await Promise.all([
      fetchCommitCount(
        me.githubLogin,
        me.accessToken,
        dateStart(yearAgo),
        dateEnd(today),
      ),
      fetchCommitCount(
        them.githubLogin,
        them.accessToken,
        dateStart(yearAgo),
        dateEnd(today),
      ),
    ]);

    const diff = myYear - theirYear;
    const sign = diff >= 0 ? "+" : "";
    const winner =
      diff > 0
        ? `<@${interaction.user.id}>`
        : diff < 0
          ? `<@${targetUser.id}>`
          : "Nobody";

    const embed = new EmbedBuilder()
      .setColor(0x24292e)
      .setTitle("📊 Contribution Comparison (Past 365 Days)")
      .setDescription(`${winner} is ahead!`)
      .addFields(
        {
          name: `@${me.githubLogin}`,
          value: `**${fmt(myYear)}** contributions`,
          inline: true,
        },
        {
          name: `@${them.githubLogin}`,
          value: `**${fmt(theirYear)}** contributions`,
          inline: true,
        },
        {
          name: "Difference",
          value: `**${sign}${fmt(Math.abs(diff))}**`,
          inline: true,
        },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("Stats compare error:", err);
    await interaction.editReply({
      content: "❌ Failed to fetch commit stats. Try again later.",
    });
  }
}

async function statsTop(interaction) {
  const allUsers = (await getAllLogins()).filter((u) => u.accessToken);
  if (allUsers.length === 0) {
    return interaction.reply({
      content: "❌ No users have linked their GitHub accounts yet.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: false });

  try {
    const today = todayStr();
    const yearAgo = yearAgoStr();

    const results = [];
    for (const u of allUsers) {
      try {
        const count = await fetchCommitCount(
          u.githubLogin,
          u.accessToken,
          dateStart(yearAgo),
          dateEnd(today),
        );
        results.push({
          discordId: u.discordId,
          githubLogin: u.githubLogin,
          count,
        });
      } catch {
        // skip failed fetches
      }
    }

    results.sort((a, b) => b.count - a.count);

    const medals = ["🥇", "🥈", "🥉"];
    let description = "";
    for (let i = 0; i < Math.min(results.length, 10); i++) {
      const r = results[i];
      const rank = i < 3 ? medals[i] : `#${i + 1}`;
      description += `${rank} <@${r.discordId}> — **${fmt(r.count)}** contributions\n`;
    }

    if (results.length > 10) {
      description += `\n... and ${results.length - 10} more`;
    }

    const embed = new EmbedBuilder()
      .setColor(0x24292e)
      .setTitle("🏆 Contribution Leaderboard (Past 365 Days)")
      .setDescription(description)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("Stats top error:", err);
    await interaction.editReply({
      content: "❌ Failed to fetch leaderboard. Try again later.",
    });
  }
}

async function statsTopDay(interaction) {
  const allToday = await getAllTodayCommits();
  if (allToday.length === 0) {
    return interaction.reply({
      content: "📭 No commits from anyone today yet.",
      ephemeral: true,
    });
  }

  allToday.sort((a, b) => b.count - a.count);

  const medals = ["🥇", "🥈", "🥉"];
  let description = `📅 **${todayStr()}**\n\n`;
  for (let i = 0; i < Math.min(allToday.length, 10); i++) {
    const r = allToday[i];
    const rank = i < 3 ? medals[i] : `#${i + 1}`;
    description += `${rank} <@${r.discordId}> — **${fmt(r.count)}** commit${r.count !== 1 ? "s" : ""}\n`;
  }

  const embed = new EmbedBuilder()
    .setColor(0x24292e)
    .setTitle("📊 Today's Commit Leaders")
    .setDescription(description)
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: false });
}

async function statsStreak(interaction) {
  const user = await getUser(interaction.user.id);
  if (!user) {
    return interaction.reply({
      content: "❌ No GitHub account linked. Please run `/github link` first.",
      ephemeral: true,
    });
  }

  const grid = await generateStreakGrid(user.githubLogin, user.accessToken);
  const embed = new EmbedBuilder()
    .setColor(0x24292e)
    .setTitle(`📊 Contribution Streak — @${user.githubLogin}`)
    .setDescription(`Past 182 days\n\n${grid}`)
    .setFooter({ text: "█ ▓ ░ = high → low | ⬛ = no commits" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: false });
}
