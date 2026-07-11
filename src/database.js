import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCAL_PATH = resolve(__dirname, '../data/data.json');
const TMP_PATH = '/tmp/data.json';
let DATA_PATH = process.env.DATA_PATH || LOCAL_PATH;

function tryMkdir(dir) {
  if (fs.existsSync(dir)) return true;
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function ensureDataDir() {
  const dir = resolve(DATA_PATH, '..');
  if (tryMkdir(dir)) return;

  if (DATA_PATH !== LOCAL_PATH) {
    console.warn(`Cannot write to ${DATA_PATH}, falling back to ${LOCAL_PATH}`);
    DATA_PATH = LOCAL_PATH;
    if (tryMkdir(resolve(LOCAL_PATH, '..'))) return;
  }

  console.warn(`Cannot write to ${DATA_PATH}, falling back to ${TMP_PATH}`);
  DATA_PATH = TMP_PATH;
  if (!tryMkdir(resolve(TMP_PATH, '..'))) {
    throw new Error('No writable data path found — tried DATA_PATH, LOCAL_PATH, and /tmp/');
  }
}

export function readData() {
  ensureDataDir();
  if (!fs.existsSync(DATA_PATH)) {
    return { users: {}, channels: {}, oauth_states: {}, commits: {} };
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

    // Migrate old string-format users to object format
    for (const [id, val] of Object.entries(data.users || {})) {
      if (typeof val === 'string') {
        data.users[id] = { githubLogin: val, accessToken: null };
      }
    }

    // Ensure commits key exists
    if (!data.commits) data.commits = {};

    return data;
  } catch {
    return { users: {}, channels: {}, oauth_states: {}, commits: {} };
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

export function setUser(discordId, userObj) {
  const data = readData();
  data.users[discordId] = userObj;
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

// --- Commit tracking ---

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function addCommitCount(discordId, count) {
  const data = readData();
  if (!data.commits[discordId]) data.commits[discordId] = {};
  const key = todayKey();
  data.commits[discordId][key] = (data.commits[discordId][key] || 0) + count;
  writeData(data);
}

export function getTodayCommits(discordId) {
  const data = readData();
  return data.commits[discordId]?.[todayKey()] || 0;
}

export function getAllTodayCommits() {
  const data = readData();
  const key = todayKey();
  const result = [];
  for (const [discordId, days] of Object.entries(data.commits || {})) {
    const count = days[key] || 0;
    if (count > 0) result.push({ discordId, count });
  }
  return result;
}

export function getCommitsForDateRange(discordId, startDate, endDate) {
  const data = readData();
  const days = data.commits[discordId] || {};
  let total = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    const key = current.toISOString().slice(0, 10);
    total += days[key] || 0;
    current.setDate(current.getDate() + 1);
  }
  return total;
}

export function getYearCommits(discordId) {
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  return getCommitsForDateRange(discordId, yearAgo, now);
}

export function getAllLogins() {
  const data = readData();
  const result = [];
  for (const [discordId, userObj] of Object.entries(data.users)) {
    if (userObj && typeof userObj === 'object') {
      result.push({ discordId, githubLogin: userObj.githubLogin, accessToken: userObj.accessToken });
    }
  }
  return result;
}