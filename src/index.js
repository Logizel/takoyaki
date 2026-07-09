import 'dotenv/config';
import { Client, GatewayIntentBits, Events, ActivityType, PermissionFlagsBits } from 'discord.js';
import express from 'express';
import { oauthCallbackHandler } from './oauth-handler.js';
import { webhookHandler } from './webhook-handler.js';
import { linkCommand } from './commands/link.js';
import { unlinkCommand } from './commands/unlink.js';
import { setchannelCommand } from './commands/setchannel.js';

const app = express();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Make client globally accessible for webhook handler
global.discordClient = client;

// Raw body parser for webhook
app.use('/webhook', express.raw({ type: 'application/json' }));
app.post('/webhook', webhookHandler);

// JSON parser for other routes
app.use(express.json());
app.get('/auth/callback', oauthCallbackHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});

client.once(Events.ClientReady, (c) => {
  console.log('Takoyaki is online! 🐙');
  c.user.setPresence({
    activities: [{ name: 'GitHub events', type: ActivityType.Watching }],
    status: 'online',
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'github') {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'link') {
      await linkCommand(interaction);
    } else if (subcommand === 'unlink') {
      await unlinkCommand(interaction);
    }
  } else if (commandName === 'setchannel') {
    await setchannelCommand(interaction);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});