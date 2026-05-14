import 'dotenv/config';
import axios from 'axios';
import express from 'express';
import { Liquid } from 'liquidjs';
import { fileURLToPath } from 'url';
import path from 'path';
import cookieParser from 'cookie-parser';
import methodOverride from 'method-override';

// Import Services
import spotifyService from './services/spotify.js';
import shopifyService from './services/shopify.js';
import miraklService from './services/mirakl.js';
import weatherService from './services/weather.js';
import githubService from './services/github.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const engine = new Liquid();

// --- Middleware ---
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static('public'));
app.use('/gsap', express.static(path.join(__dirname, 'node_modules/gsap/dist/')));


// --- View Engine ---
app.engine('liquid', engine.express());
app.set('views', './views');
app.set('view engine', 'liquid');

// --- Spotify Logic ---
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
let accessToken = null;
let tokenExpiry = null;

const ensureValidToken = async () => {
    if (accessToken && Date.now() < tokenExpiry) return accessToken;
    try {
        const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
        const response = await axios.post('https://accounts.spotify.com/api/token', 
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
            }), 
            { headers: { 'Authorization': `Basic ${authHeader}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        accessToken = response.data.access_token;
        tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
        return accessToken;
    } catch (error) {
        console.error('Spotify Auth Failed');
        return null;
    }
};

// --- Routes ---
app.get('/', async (req, res) => {
    try {
        const [spotify, shopify, mirakl, weather, github,] = await Promise.all([
            spotifyService.getCurrentlyPlaying().catch(() => null),
            shopifyService.getShopifyOrders().catch(() => null),
            miraklService.getMiraklOrders().catch(() => null),
            weatherService.getWeather().catch(() => null),
            githubService.getGitHubStats().catch(() => null),
        ]);

        const commerce = {
            totalOrders: (shopify?.orderCount ?? 0) + (mirakl?.orderCount ?? 0),
            totalValue: (shopify?.totalValue ?? 0) + (mirakl?.totalValue ?? 0),
            currency: 'EUR',
            shopify: shopify ?? { orderCount: 0, totalValue: 0 },
            mirakl: mirakl ?? { orderCount: 0, totalValue: 0 },
        };

        res.render('index.liquid', { spotify, commerce, weather, github, now: new Date() });
    } catch (error) {
        console.error('Dashboard Error:', error);
        res.status(500).send('Dashboard failed to load');
    }
});

app.post('/api/spotify/control', async (req, res) => {
    const { action } = req.query;
    const token = await ensureValidToken();
    if (!token) return res.status(401).send('Unauthorized');

    const map = {
        play: { e: '/me/player/play', m: 'PUT' },
        pause: { e: '/me/player/pause', m: 'PUT' },
        next: { e: '/me/player/next', m: 'POST' },
        previous: { e: '/me/player/previous', m: 'POST' }
    };

    try {
        await axios({
            method: map[action].m,
            url: `https://api.spotify.com/v1${map[action].e}`,
            headers: { Authorization: `Bearer ${token}` }
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Device not active' }); }
});

// --- Server Startup ---
const PORT = 8000;
app.listen(PORT, () => {
    console.log(`\n🚀 Server live at http://localhost:${PORT}`);
});

process.on('unhandledRejection', (err) => console.error('Promise Rejection:', err));