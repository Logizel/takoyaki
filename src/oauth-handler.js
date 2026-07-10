import { getOAuthState, deleteOAuthState, setUser } from './database.js';

export async function oauthCallbackHandler(req, res) {
  const { code, state } = req.query;

  const stateData = getOAuthState(state);
  if (!stateData) {
    return res.send(`
      <!DOCTYPE html>
      <html><head><title>Authentication Expired</title></head>
      <body style="font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
        <h1>❌ Authentication Expired</h1>
        <p>The OAuth state has expired or is invalid. Please run <code>/github link</code> again in Discord.</p>
      </body></html>
    `);
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (tokenData.error) {
      throw new Error(tokenData.error_description || 'Failed to exchange code for token');
    }

    const accessToken = tokenData.access_token;

    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    const userData = await userResponse.json();
    if (!userData.login) {
      throw new Error('Failed to fetch GitHub user');
    }

    const githubUsername = userData.login;
    const discordId = stateData.discord_id;

    setUser(discordId, githubUsername);

    deleteOAuthState(state);

    try {
      const client = global.discordClient;
      if (client) {
        const user = await client.users.fetch(discordId);
        await user.send(`✅ **Takoyaki** has successfully linked your Discord to GitHub account: **@${githubUsername}**`);
      }
    } catch (dmError) {
      console.warn(`Failed to send DM to ${discordId}:`, dmError.message);
    }

    res.send(`
      <!DOCTYPE html>
      <html><head><title>Success</title></head>
      <body style="font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
        <h1>✅ Successfully Linked!</h1>
        <p>Your Discord account has been linked to GitHub account: <strong>@${githubUsername}</strong></p>
        <p>You can close this tab and return to Discord.</p>
      </body></html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.send(`
      <!DOCTYPE html>
      <html><head><title>Authentication Failed</title></head>
      <body style="font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
        <h1>❌ Authentication Failed</h1>
        <p>Something went wrong during authentication. Please try running <code>/github link</code> again in Discord.</p>
      </body></html>
    `);
  }
}