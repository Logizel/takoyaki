import crypto from "crypto";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { readData, addCommitCount, getOrgChannelsByOrgName } from "./database.js";

async function getAllStandardChannels() {
  const data = await readData();
  return data.tracked_channels.filter(tc => tc.mode === 'standard');
}

function getEventComponents(event, parsed) {
  const isPrivate = parsed.repository?.private || parsed.workflow_run?.repository?.private;
  if (isPrivate) return [];

  let url = null;
  let label = null;

  switch (event) {
    case "push":
    case "repository":
      url = parsed.repository?.html_url;
      label = "View Repository";
      break;
    case "pull_request":
      url = parsed.pull_request?.html_url;
      label = "View Pull Request";
      break;
    case "issues":
      url = parsed.issue?.html_url;
      label = "View Issue";
      break;
    case "workflow_run":
      url = parsed.workflow_run?.html_url;
      label = "View Run";
      break;
  }

  if (!url) return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(label)
        .setStyle(ButtonStyle.Link)
        .setURL(url)
    )
  ];
}

function verifySignature(payload, signature, secret) {
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

function formatMessage(discordId, event, payload, orgSender) {
  const sender = orgSender || payload.sender?.login;
  const repo = payload.repository?.name;
  const isPrivate = payload.repository?.private;
  const owner = payload.repository?.owner?.login;
  const prefix = discordId ? `<@${discordId}>` : `**${sender}**`;

  const repoFull = owner ? `${owner}/${repo}` : repo;

  switch (event) {
    case "push": {
      const commits = payload.commits || [];
      const count = commits.length;
      if (count === 0) return null;
      const firstMsg = commits[0]?.message || "No commit message";
      if (isPrivate) {
        return `${prefix} pushed ${count} commit${count !== 1 ? "s" : ""} to a **private repository**.`;
      }
      return `${prefix} pushed ${count} commit${count !== 1 ? "s" : ""} to **${repoFull}** — *${firstMsg}*`;
    }
    case "pull_request": {
      const action = payload.action;
      const title = payload.pull_request?.title;
      if (action === "opened") {
        if (isPrivate)
          return `${prefix} opened a PR in a **private repository**.`;
        return `${prefix} opened a PR in **${repoFull}**: *${title}*`;
      }
      if (action === "closed") {
        const verb = payload.pull_request?.merged ? "merged" : "closed";
        if (isPrivate)
          return `${prefix} ${verb} a PR in a **private repository**.`;
        return `${prefix} ${verb} a PR in **${repoFull}**: *${title}*`;
      }
      return null;
    }
    case "issues": {
      const action = payload.action;
      const title = payload.issue?.title;
      if (action === "opened") {
        if (isPrivate)
          return `${prefix} opened an issue in a **private repository**.`;
        return `${prefix} opened an issue in **${repoFull}**: *${title}*`;
      }
      if (action === "closed") {
        if (isPrivate)
          return `${prefix} closed an issue in a **private repository**.`;
        return `${prefix} closed an issue in **${repoFull}**: *${title}*`;
      }
      return null;
    }
    case "repository": {
      if (payload.action === "created") {
        if (isPrivate) return `${prefix} created a **private repository**.`;
        return `${prefix} created **${repoFull}**`;
      }
      return null;
    }
    case "workflow_run": {
      const action = payload.action;
      const run = payload.workflow_run;
      const name = run?.name;
      const conclusion = run?.conclusion;
      const branch = run?.head_branch;
      const repoFull = run?.repository?.full_name;
      if (action === "completed" && conclusion) {
        return `${prefix} CI *${name}* **${conclusion}** on \`${branch}\` in **${repoFull}**`;
      }
      return null;
    }
    default:
      return null;
  }
}

async function getUserByGithubLogin(githubLogin) {
  const data = await readData();
  for (const [discordId, userObj] of Object.entries(data.users)) {
    let login;
    if (typeof userObj === 'object' && userObj !== null) {
      login = userObj.githubLogin;
    } else if (typeof userObj === 'string') {
      login = userObj;
    } else {
      continue;
    }
    if (login.toLowerCase() === githubLogin.toLowerCase()) {
      return { discordId, githubLogin: login };
    }
  }
  return null;
}

export async function webhookHandler(req, res) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) {
    return res.status(401).send("Missing signature");
  }

  const payload = req.body.toString("utf-8");
  if (!verifySignature(payload, signature, process.env.GITHUB_WEBHOOK_SECRET)) {
    return res.status(401).send("Invalid signature");
  }

  const event = req.headers["x-github-event"];
  if (
    event === "star" ||
    event === "installation" ||
    event === "installation_repositories"
  ) {
    console.log(`Received ${event} event`);
    return res.status(200).send("OK");
  }

  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return res.status(400).send("Invalid JSON");
  }

  const sender = parsed.sender?.login;
  if (!sender) {
    return res.status(200).send("OK");
  }

  const repoOwner = parsed.repository?.owner?.login || parsed.workflow_run?.repository?.owner?.login;
  const orgChannels = repoOwner ? await getOrgChannelsByOrgName(repoOwner) : [];

  if (orgChannels.length > 0) {
    const message = formatMessage(null, event, parsed, sender);
    if (!message) {
      return res.status(200).send("OK");
    }
    const components = getEventComponents(event, parsed);
    const client = global.discordClient;
    if (client) {
      for (const tc of orgChannels) {
        try {
          const channel = client.channels.cache.get(tc.channel_id);
          if (channel && channel.isTextBased()) {
            await channel.send({ content: message, components });
          }
        } catch (error) {
          console.error("Failed to send webhook message:", error);
        }
      }
    }
    return res.status(200).send("OK");
  }

  const user = await getUserByGithubLogin(sender);
  if (!user) {
    return res.status(200).send("OK");
  }

  const message = formatMessage(user.discordId, event, parsed);
  if (!message) {
    return res.status(200).send("OK");
  }

  const components = getEventComponents(event, parsed);
  const standardChannels = await getAllStandardChannels();
  const client = global.discordClient;
  if (client) {
    let sentToAny = false;
    for (const tc of standardChannels) {
      try {
        const channel = client.channels.cache.get(tc.channel_id);
        if (channel && channel.isTextBased()) {
          await channel.send({ content: message, components });
          sentToAny = true;
        }
      } catch (error) {
        console.error("Failed to send webhook message:", error);
      }
    }
    if (!sentToAny) {
      const fallback = process.env.DISCORD_CHANNEL_ID;
      if (fallback) {
        try {
          const channel = client.channels.cache.get(fallback);
          if (channel && channel.isTextBased()) {
            await channel.send({ content: message, components });
          }
        } catch (error) {
          console.error("Failed to send webhook message to fallback:", error);
        }
      }
    }
  }

  if (event === "push") {
    const commits = parsed.commits || [];
    await addCommitCount(user.discordId, commits.length);
  }

  res.status(200).send("OK");
}
