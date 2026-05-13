import 'dotenv/config';
import axios from 'axios'; // Added missing import
import express from 'express';
import { Liquid } from 'liquidjs';
import { fileURLToPath } from 'url';
import path from 'path';
import cookieParser from 'cookie-parser';
import methodOverride from 'method-override';

// ─── SETUP ──────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const engine = new Liquid();

app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(express.json());
app.use(methodOverride('_method'));
app.use('/gsap', express.static(path.join(__dirname, 'node_modules/gsap/dist/')));

app.engine('liquid', engine.express());
app.set('views', './views');
app.set('view engine', 'liquid');

// ─── SERVICES ────────────────────────────────────────────────────────────────
import spotifyService from './services/spotify.js';
import shopifyService from './services/shopify.js';
import miraklService from './services/mirakl.js';
import weatherService from './services/weather.js';
import githubService from './services/github.js';

// ─── CONSTANTS & CONFIG ──────────────────────────────────────────────────────
const API_BASE = 'https://api.gijsnagtegaal.nl/items';
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Spotify State
let accessToken = null;
let tokenExpiry = null;

// ─── SPOTIFY AUTH HELPERS ────────────────────────────────────────────────────

const refreshAccessToken = async () => {
    try {
        if (!process.env.SPOTIFY_REFRESH_TOKEN) {
            throw new Error("Missing SPOTIFY_REFRESH_TOKEN in .env");
        }

        const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
        const response = await axios.post('https://accounts.spotify.com/api/token', 
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
            }), 
            {
                headers: {
                    'Authorization': `Basic ${authHeader}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
            }
        );

        accessToken = response.data.access_token;
        // Set expiry with a 60-second safety buffer
        tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
        console.log('✅ Spotify Token Refreshed');
        return accessToken;
    } catch (error) {
        console.error('❌ Spotify token refresh error:', error.response?.data || error.message);
        return null;
    }
};

const ensureValidToken = async () => {
    if (!accessToken || Date.now() >= tokenExpiry) {
        return await refreshAccessToken();
    }
    return accessToken;
};

const getActiveUserId = async () => {
    try {
        const token = await ensureValidToken();
        const response = await axios.get('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.data.id;
    } catch (error) {
        console.error('Error fetching User ID:', error.message);
        return null;
    }
};

// ─── API ROUTES ──────────────────────────────────────────────────────────────

app.post('/api/spotify/control', async (req, res) => {
    const { action } = req.query;
    try {
        const token = await ensureValidToken();
        if (!token) return res.status(401).json({ error: "Auth failed" });

        let endpoint = '';
        let method = 'POST';

        switch(action) {
            case 'play': endpoint = '/me/player/play'; method = 'PUT'; break;
            case 'pause': endpoint = '/me/player/pause'; method = 'PUT'; break;
            case 'next': endpoint = '/me/player/next'; method = 'POST'; break;
            case 'previous': endpoint = '/me/player/previous'; method = 'POST'; break;
            default: return res.status(400).json({ error: "Invalid action" });
        }

        await axios({
            method: method,
            url: `https://api.spotify.com/v1${endpoint}`,
            headers: { Authorization: `Bearer ${token}` }
        });

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Spotify Control Error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Check if Spotify is active on a device' });
    }
});

// ─── VIEW ROUTES ─────────────────────────────────────────────────────────────

app.get('/dashboard', async (req, res) => {
    try {
        // Run all service calls in parallel for speed
        const [spotify, shopify, mirakl, weather, github] = await Promise.all([
            spotifyService.getCurrentlyPlaying().catch(() => null),
            shopifyService.getShopifyOrders().catch(() => null),
            miraklService.getMiraklOrders().catch(() => null),
            weatherService.getWeather().catch(() => null),
            githubService.getGitHubStats().catch(() => null),
        ]);

        const commerce = {
            totalOrders: (shopify?.orderCount || 0) + (mirakl?.orderCount || 0),
            totalValue: (shopify?.totalValue || 0) + (mirakl?.totalValue || 0),
            currency: 'EUR',
            shopify: shopify || { orderCount: 0, totalValue: 0 },
            mirakl: mirakl || { orderCount: 0, totalValue: 0 },
        };

        res.render('index.liquid', {
            spotify,
            commerce,
            weather,
            github,
            now: new Date(),
        });
    } catch (error) {
        console.error('Dashboard Route Error:', error);
        res.status(500).send('Error loading dashboard');
    }
});

// Example Order Routes
app.get('/orders/shopify', async (req, res) => {
    try {
        const shopify = await shopifyService.getShopifyOrders();
        res.render('orders.liquid', { marketplace: 'Shopify', orders: shopify.orders || [] });
    } catch (e) { res.status(500).send("Shopify error"); }
});

// ─── SERVER START ────────────────────────────────────────────────────────────
const PORT = 8000;
app.listen(PORT, () => {
    console.log(`Axios loaded: ${typeof axios.post === 'function'}`);
    console.log(`🚀 Server started: http://localhost:${PORT}/dashboard`);
});