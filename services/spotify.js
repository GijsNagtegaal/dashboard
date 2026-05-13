import axios from 'axios';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

let accessToken = null;
let tokenExpiry = null;

const refreshAccessToken = async () => {
    try {
        // Spotify requires data to be URL Form Encoded in the BODY
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
        });

        const authHeader = Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64');

        const response = await axios.post(SPOTIFY_AUTH_URL, params.toString(), {
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        accessToken = response.data.access_token;
        // Set expiry with a 60-second "safety buffer"
        tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
        
        return accessToken;
    } catch (error) {
        console.error('Spotify token refresh error:', error.response?.data || error.message);
        return null;
    }
};

const ensureValidToken = async () => {
    // Refresh if no token exists OR if we are within 60 seconds of expiry
    if (!accessToken || Date.now() >= tokenExpiry) {
        return await refreshAccessToken();
    }
    return accessToken;
};

export const getCurrentlyPlaying = async () => {
    try {
        const token = await ensureValidToken();
        if (!token) return null;

        const response = await axios.get(`${SPOTIFY_API_URL}/me/player/currently-playing`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        // Handle 204 No Content (Nothing is playing)
        if (response.status === 204 || !response.data) {
            return { isPlaying: false, track: null };
        }

        const { item, is_playing, progress_ms } = response.data;

        return {
            isPlaying: is_playing,
            track: item.name,
            artist: item.artists.map(a => a.name).join(', '),
            image: item.album.images[0]?.url || null,
            duration: item.duration_ms,
            progress: progress_ms,
            externalUrl: item.external_urls?.spotify || null,
        };
    } catch (error) {
        // Log the specific error from Spotify (e.g., "The access token expired")
        console.error('Spotify API error:', error.response?.data || error.message);
        return null;
    }
};

export default { getCurrentlyPlaying };