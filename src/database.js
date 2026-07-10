import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCAL_PATH = resolve(__dirname, '../data/data.json');
let DATA_PATH = process.env.DATA_PATH || LOCAL_PATH;

function ensureDataDir() {
  const dir = resolve(DATA_PATH, '..');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      if (err.code === 'EACCES' && DATA_PATH !== LOCAL_PATH) {
        console.warn(`Cannot write to ${DATA_PATH}, falling back to ${LOCAL_PATH}`);
        DATA_PATH = LOCAL_PATH;
        ensureDataDir();
      } else {
        throw err;
      }
    }
  }
}

export function readData() {
  ensureDataDir();
  if (!fs.existsSync(DATA_PATH)) {
    return { users: {}, channels: {}, oauth_states: {} };
  }
  try {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    // Clean expired oauth_states
    const now = Date.now();
    const validStates = {};
    for (const [state, value] of Object.entries(data.oauth_states || {})) {
      if (now - value.created_at <= 5 * 60 * 1000) {
        validStates[state] = value;
      }
    }
    data.oauth_states = validStates;
    return data;
  } catch {
    return { users: {}, channels: {}, oauth_states: {} };
  }
}

function writeData(data) {
  ensureDataDir();
  const tempPath = `${DATA_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, DATA_PATH);
}

export function getUser(discordId) {
  const data = readData();
  return data.users[discordId] || null;
}

export function setUser(discordId, githubUsername) {
  const data = readData();
  data.users[discordId] = githubUsername;
  writeData(data);
}

export function deleteUser(discordId) {
  const data = readData();
  delete data.users[discordId];
  writeData(data);
}

export function getChannel(guildId) {
  const data = readData();
  return data.channels[guildId] || null;
}

export function setChannel(guildId, channelId) {
  const data = readData();
  data.channels[guildId] = channelId;
  writeData(data);
}

export function getChannelId() {
  const data = readData();
  return Object.values(data.channels)[0] || null;
}

export function setChannelId(channelId) {
  const data = readData();
  const guildId = Object.keys(data.channels)[0] || 'default';
  data.channels[guildId] = channelId;
  writeData(data);
}

export function createOAuthState(discordId, interactionToken = null) {
  const data = readData();
  const state = crypto.randomBytes(16).toString('hex');
  data.oauth_states[state] = { discord_id: discordId, interaction_token: interactionToken, created_at: Date.now() };
  writeData(data);
  return state;
}

export function getOAuthState(state) {
  const data = readData();
  const entry = data.oauth_states[state];
  if (!entry) return null;
  if (Date.now() - entry.created_at > 5 * 60 * 1000) {
    delete data.oauth_states[state];
    writeData(data);
    return null;
  }
  return entry;
}

export function deleteOAuthState(state) {
  const data = readData();
  delete data.oauth_states[state];
  writeData(data);
}