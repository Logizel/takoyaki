import { getOAuthState, deleteOAuthState, setUser } from './database.js';

const DARK_THEME = `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: #0d1117; color: #c9d1d9;
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh; margin: 0;
    }
    .card {
      background: #161b22; padding: 48px; border-radius: 8px;
      border: 1px solid #30363d; text-align: center;
      max-width: 480px; width: 90%;
    }
    h1 { font-size: 24px; margin-bottom: 16px; }
    p { color: #8b949e; line-height: 1.6; margin-bottom: 8px; }
    .success { color: #3fb950; }
    .error { color: #f85149; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    code { background: #0d1117; padding: 2px 8px; border-radius: 4px; font-size: 14px; }
  </style>
`;

async function sendEphemeralFollowup(token, content) {
  try {
    await fetch(`https://discord.com/api/webhooks/${process.env.DISCORD_CLIENT_ID}/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        flags: 64,
      }),
    });
  } catch (err) {
    console.warn('Failed to send ephemeral followup:', err.message);
  }
}

export async function oauthCallbackHandler(req, res) {
  const { code, state } = req.query;

  const stateData = getOAuthState(state);
  if (!stateData) {
    return res.send(`<!DOCTYPE html>
      <html><head><title>Authentication Expired</title>${DARK_THEME}</head>
      <body>
        <div class="card">
          <div class="icon error">❌</div>
          <h1>Authentication Expired</h1>
          <p>The OAuth state has expired or is invalid.</p>
          <p>Please run <code>/github link</code> again in Discord.</p>
        </div>
      </body></html>`);
  }

  const token = stateData.interaction_token;

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (tokenData.error) throw new Error(tokenData.error_description || 'Failed to exchange code for token');

    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    const userData = await userResponse.json();
    if (!userData.login) throw new Error('Failed to fetch GitHub user');

    setUser(stateData.discord_id, userData.login);
    deleteOAuthState(state);

    await sendEphemeralFollowup(token, `✅ **Takoyaki** successfully linked your Discord to GitHub account: **@${userData.login}**`);

    try {
      const client = global.discordClient;
      if (client) {
        const user = await client.users.fetch(stateData.discord_id);
        await user.send(`✅ **Takoyaki** has successfully linked your Discord to GitHub account: **@${userData.login}**`);
      }
    } catch (dmError) {
      console.warn(`Failed to send DM to ${stateData.discord_id}:`, dmError.message);
    }

    return res.send(`<!DOCTYPE html>
      <html><head><title>Success</title>${DARK_THEME}</head>
      <body>
        <div class="card">
          <div class="icon success">✅</div>
          <h1>Successfully Linked!</h1>
          <p>Your Discord account has been linked to <strong>@${userData.login}</strong>.</p>
          <p>You can close this tab and return to Discord.</p>
        </div>
      </body></html>`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    await sendEphemeralFollowup(token, `❌ **Takoyaki** failed to link your GitHub account. Please try \`/github link\` again.`);
    return res.send(`<!DOCTYPE html>
      <html><head><title>Authentication Failed</title>${DARK_THEME}</head>
      <body>
        <div class="card">
          <div class="icon error">❌</div>
          <h1>Authentication Failed</h1>
          <p>Something went wrong during authentication.</p>
          <p>Please run <code>/github link</code> again in Discord.</p>
        </div>
      </body></html>`);
  }
}