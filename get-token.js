const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// --- CONFIGURATION ---
const CLIENT_ID = '8f87d5399717413ba025bafda5cbc52f';
const CLIENT_SECRET = '9cefd01d412347cda9a5d8610ea2579c';
// Use the IP loopback address as per latest security requirements
const REDIRECT_URI = 'http://127.0.0.1:3000/callback'; 
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'app-remote-control',
  'streaming',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-library-modify',
  'user-library-read',
  'user-read-playback-position',
  'user-read-recently-played',
  'user-top-read',
  'user-read-private',
  'user-read-email',
  'user-follow-modify',
  'user-follow-read'
];

// --- ROUTES ---

/**
 * 1. Redirect the user to Spotify Login
 */
app.get('/login', (req, response) => {
  const scopeString = encodeURIComponent(SCOPES.join(' '));
  const encodedRedirect = encodeURIComponent(REDIRECT_URI);
  
  const spotifyAuthUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${CLIENT_ID}&scope=${scopeString}&state=123456&redirect_uri=${encodedRedirect}&prompt=consent`;
  
  response.redirect(spotifyAuthUrl);
});

/**
 * 2. Handle the callback from Spotify and exchange the code for a token
 */
app.get('/callback', async (req, res) => {
  const code = req.query.code || null;

  if (!code) {
    return res.status(400).send('Authorization code missing');
  }

  try {
    // Exchange code for Access Token
    const tokenResponse = await axios({
      method: 'post',
      url: 'https://accounts.spotify.com/api/token',
      data: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
      }).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')),
      },
    });

    // Successfully received the tokens!
    // tokenResponse.data contains: access_token, refresh_token, expires_in
    console.log('Successfully authenticated with Spotify');
    res.json(tokenResponse.data);

  } catch (error) {
    console.error('Spotify Auth Error:', error.response ? error.response.data : error.message);
    res.status(500).json({
      error: 'Failed to authenticate',
      details: error.response ? error.response.data : error.message
    });
  }
});

app.listen(3000, () => {
  console.log('Server running at http://127.0.0.1:3000');
  console.log('Go to http://127.0.0.1:3000/login to start');
});