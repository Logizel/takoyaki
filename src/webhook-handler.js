import crypto from 'crypto';
import { readData, getChannel } from './database.js';

function verifySignature(payload, signature, secret) {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

function formatMessage(discordId, event, payload) {
  const sender = payload.sender?.login;
  const repo = payload.repository?.name;
  const isPrivate = payload.repository?.private;
  const mention = `<@${discordId}>`;

  switch (event) {
    case 'push': {
      const commits = payload.commits || [];
      const count = commits.length;
      const firstMsg = commits[0]?.message || 'No commit message';
      if (isPrivate) {
        return `${mention} pushed ${count} commit${count !== 1 ? 's' : ''} to a **private repo**.`;
      }
      return `${mention} pushed ${count} commit${count !== 1 ? 's' : ''} to **${repo}** — *${firstMsg}*`;
    }
    case 'pull_request': {
      const action = payload.action;
      const title = payload.pull_request?.title;
      if (action === 'opened') {
        if (isPrivate) return `${mention} opened a PR in a **private repo**.`;
        return `${mention} opened a PR in **${repo}**: *${title}*`;
      }
      if (action === 'closed' || action === 'merged') {
        const verb = action === 'merged' ? 'merged' : 'closed';
        if (isPrivate) return `${mention} ${verb} a PR in a **private repo**.`;
        return `${mention} ${verb} a PR in **${repo}**: *${title}*`;
      }
      return null;
    }
    case 'issues': {
      const action = payload.action;
      const title = payload.issue?.title;
      if (action === 'opened') {
        if (isPrivate) return `${mention} opened an issue in a **private repo**.`;
        return `${mention} opened an issue in **${repo}**: *${title}*`;
      }
      if (action === 'closed') {
        if (isPrivate) return `${mention} closed an issue in a **private repo**.`;
        return `${mention} closed an issue in **${repo}**: *${title}*`;
      }
      return null;
    }
    case 'repository': {
      if (payload.action === 'created') {
        if (isPrivate) return `${mention} created a **private repo**.`;
        return `${mention} created **${repo}**`;
      }
      return null;
    }
    default:
      return null;
  }
}

function getUserByGithubLogin(githubLogin) {
  const data = readData();
  for (const [discordId, login] of Object.entries(data.users)) {
    if (login.toLowerCase() === githubLogin.toLowerCase()) {
      return { discordId, githubLogin: login };
    }
  }
  return null;
}

export async function webhookHandler(req, res) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    return res.status(401).send('Missing signature');
  }

  const payload = req.body.toString('utf-8');
  if (!verifySignature(payload, signature, process.env.GITHUB_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  const event = req.headers['x-github-event'];
  if (event === 'star') {
    return res.status(200).send('OK');
  }

  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const sender = parsed.sender?.login;
  if (!sender) {
    return res.status(200).send('OK');
  }

  const user = getUserByGithubLogin(sender);
  if (!user) {
    return res.status(200).send('OK');
  }

  let channelId = getChannel(user.discordId);
  if (!channelId) {
    channelId = process.env.DISCORD_CHANNEL_ID;
  }
  if (!channelId) {
    return res.status(200).send('OK');
  }

  const message = formatMessage(user.discordId, event, parsed);
  if (!message) {
    return res.status(200).send('OK');
  }

  try {
    const client = global.discordClient;
    if (client) {
      const channel = client.channels.cache.get(channelId);
      if (channel && channel.isTextBased()) {
        await channel.send(message);
      }
    }
  } catch (error) {
    console.error('Failed to send webhook message:', error);
  }

  res.status(200).send('OK');
}