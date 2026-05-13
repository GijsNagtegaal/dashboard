import express from 'express';
import { Liquid } from 'liquidjs';
import { fileURLToPath } from 'url';
import path from 'path';
import cookieParser from 'cookie-parser';
import methodOverride from 'method-override';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const API_BASE = 'https://api.gijsnagtegaal.nl/items';
const ASSET_BASE = 'https://api.gijsnagtegaal.nl/assets';
const PLACEHOLDER_IMAGE = '/assets/images/placeholder.webp';
const DEFAULT_USER_ID = 1;

// ─── APP SETUP ────────────────────────────────────────────────────────────────

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(express.json());
app.use(methodOverride('_method'));
app.use('/gsap', express.static(path.join(__dirname, 'node_modules/gsap/dist/')));

const engine = new Liquid();
app.engine('liquid', engine.express());
app.set('views', './views');
app.set('view engine', 'liquid');

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const getActiveUserId = (req) =>
    req.cookies.userId ? parseInt(req.cookies.userId, 10) : DEFAULT_USER_ID;

const fetchData = async (endpoint) => {
    try {
        const response = await fetch(`${API_BASE}/${endpoint}`);
        const result = await response.json();
        return result.data;
    } catch (e) {
        console.error(`Fetch error for ${endpoint}:`, e);
        return null;
    }
};

const assetUrl = (asset) => {
    if (!asset) return PLACEHOLDER_IMAGE;

    const id = typeof asset === 'object' ? (asset.id || asset.memoji) : asset;

    return (id && typeof id === 'string') 
        ? `${ASSET_BASE}/${id}` 
        : PLACEHOLDER_IMAGE;
};

const resolveZoneId = (zoneEntry) =>
    typeof zoneEntry === 'object' ? zoneEntry.frankendael_zones_id : zoneEntry;

const getPlantIdsFromZone = (zone) => {
    if (!zone.plants?.length) return [];
    return zone.plants
        .map(link => typeof link === 'object' ? link.frankendael_plants_id : link)
        .filter(Boolean);
};

const normalizePlant = (plant) => {
    if (!plant) return null;
    return {
        ...plant,
        in_bloom: assetUrl(plant.in_bloom),
        not_in_bloom: assetUrl(plant.not_in_bloom),
        title: plant.quest_title || 'Opdracht',
        description: plant.quest_text,
        type: plant.quest_type === 'labels' ? 'button' : 'image',
        correct_answer: (plant.quest_options || []).find(o => o.correct)?.value,
        options: (plant.quest_options || []).map(o => ({
            text: o.label || o.value,
            value: o.value,
            image_url: assetUrl(o.image),
        })),
        xp: 25,
    };
};

const getCollectedIds = async (userId) => {
    const data = await fetchData(
        `frankendael_users_plants?filter[frankendael_users_id]=${userId}&fields=frankendael_plants_id`
    ) || [];
    return new Set(
        data.map(item => {
            const ref = item.frankendael_plants_id;
            return typeof ref === 'object' ? ref.id : ref;
        })
    );
};

const getCollectedPlants = async (userId) => {
    const data = await fetchData(
        `frankendael_users_plants?filter[frankendael_users_id][_eq]=${userId}&fields=*,frankendael_plants_id.*.*`
    ) || [];
    return data.map(item => item.frankendael_plants_id).filter(Boolean);
};

const attachMainZone = (plant, allZones) => {
    const firstZoneEntry = plant.zones?.[0];
    const zoneId = resolveZoneId(firstZoneEntry);
    return {
        ...normalizePlant(plant),
        main_zone: allZones.find(z => z.id === zoneId) ?? null,
    };
};

// ─── GLOBALE DATA MIDDLEWARE ──────────────────────────────────────────────────

app.use(async (req, res, next) => {
    // Prevent the middleware from running on static assets or specific libraries
    if (req.path.includes('.') || req.path.startsWith('/gsap')) return next();
    
    const userId = getActiveUserId(req);

    try {
        const [userProfile, allZones, collectedIds] = await Promise.all([
            fetchData(`frankendael_users/${userId}?fields=*,memoji.*`),
            fetchData('frankendael_zones?fields=*.*'),
            getCollectedIds(userId)
        ]);

        res.locals.userId = userId;
        res.locals.user = userProfile || {};
        res.locals.allZones = allZones || [];
        res.locals.collectedIds = collectedIds || new Set();

        // Handle the nested Memoji asset ID
        // Directus often returns the junction object, we need the file ID inside it
        const memojiAsset = userProfile?.memoji?.memoji || userProfile?.memoji;
        res.locals.userMemoji = assetUrl(memojiAsset);

        next();
    } catch (error) {
        console.error('Middleware Error:', error);
        res.locals.userId = userId;
        res.locals.userMemoji = PLACEHOLDER_IMAGE;
        next();
    }
});

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Home
app.get('/', async (req, res) => {
    try {
        const [allNews, collectedPlants] = await Promise.all([
            fetchData('frankendael_news'),
            getCollectedPlants(res.locals.userId),
        ]);

        res.render('index.liquid', {
            zones: res.locals.allZones,
            plants: (collectedPlants || []).map(p => attachMainZone(p, res.locals.allZones)),
            news: (allNews || []).map(n => ({ ...n, image: assetUrl(n.image) })),
            zone_type: 'home',
            current_path: req.path,
        });
    } catch (error) {
        res.status(500).send('Home error');
    }
});

// Veldverkenner map overview
app.get('/veldverkenner', async (req, res) => {
    try {
        const allPlants = await fetchData('frankendael_plants?fields=*.*') || [];
        const statusMap = {};

        const zonesWithQuest = res.locals.allZones.map(zone => {
            const plantIdsInZone = getPlantIdsFromZone(zone);
            const isComplete = plantIdsInZone.length > 0 && 
                plantIdsInZone.every(id => res.locals.collectedIds.has(id));

            statusMap[zone.slug] = isComplete;
            const plantWithQuest = allPlants.find(p => plantIdsInZone.includes(p.id) && p.quest_title);
            const normalized = normalizePlant(plantWithQuest);

            return {
                ...zone,
                quest: normalized ? { ...normalized, plant: normalized } : null,
                zoneCompleted: isComplete,
            };
        });

        res.render('veldverkenner.liquid', {
            zones: zonesWithQuest,
            completedCount: zonesWithQuest.filter(z => z.zoneCompleted).length,
            status: statusMap,
            progress: res.locals.collectedIds.size,
            totalZonesCount: zonesWithQuest.length,
            zone_type: 'veldverkenner',
            current_path: req.path,
        });
    } catch (error) {
        res.status(500).send('Map error');
    }
});

// Single zone view
app.get('/veldverkenner/:zone_slug', async (req, res) => {
    try {
        const zoneData = await fetchData(`frankendael_zones?filter[slug][_eq]=${req.params.zone_slug}&fields=*.*`) || [];
        const currentZone = zoneData[0];
        if (!currentZone) return res.status(404).send('Zone niet gevonden');

        const plantIds = getPlantIdsFromZone(currentZone);
        const plantsInZone = plantIds.length
            ? await fetchData(`frankendael_plants?filter[id][_in]=${plantIds.join(',')}&fields=*.*`)
            : [];

        const normalizedPlants = (plantsInZone || []).map(plant => {
            const normalized = normalizePlant(plant);
            const zoneId = resolveZoneId(plant.zones?.[0]);
            return {
                ...normalized,
                collected: res.locals.collectedIds.has(plant.id),
                quest: plant.quest_title ? normalized : null,
                main_zone: res.locals.allZones.find(z => z.id === zoneId) ?? null,
            };
        });

        const collectedCount = normalizedPlants.filter(p => p.collected).length;

        res.render('zone.liquid', {
            zone: currentZone,
            zone_name: currentZone.name,
            plants: normalizedPlants,
            zone_slug: req.params.zone_slug,
            zone_type: currentZone.type,
            current_path: req.path,
            stats: {
                total: normalizedPlants.length,
                collected: collectedCount,
                percentage: normalizedPlants.length > 0 ? (collectedCount / normalizedPlants.length) * 100 : 0,
            },
        });
    } catch (error) {
        res.status(500).send('Zone error');
    }
});

// Single plant quest
app.get('/veldverkenner/:zone_slug/:item_slug', async (req, res) => {
    try {
        const [zoneData, plantData] = await Promise.all([
            fetchData(`frankendael_zones?filter[slug][_eq]=${req.params.zone_slug}`),
            fetchData(`frankendael_plants?filter[slug][_eq]=${req.params.item_slug}&fields=*.*`),
        ]);
        const plant = normalizePlant(plantData[0]);
        res.render('opdracht.liquid', {
            quest: plant,
            plant,
            zone: zoneData[0],
            zone_slug: req.params.zone_slug,
            state: req.query.step || 'intro',
            user_id: res.locals.userId,
            zone_type: zoneData[0].type,
            current_path: req.path,
        });
    } catch (error) {
        res.status(500).send('Quest error');
    }
});

// Collection overview
app.get('/collectie', async (req, res) => {
    const collected = await getCollectedPlants(res.locals.userId);
    res.render('collectie.liquid', {
        plants: collected.map(p => attachMainZone(p, res.locals.allZones)),
        zone_type: 'collectie',
        current_path: req.path,
    });
});

app.get('/collectie/in_bloom', async (request, response) => {
    const userId = getActiveUserId(request);
    const [collected, allZones] = await Promise.all([getCollectedPlants(userId), fetchData('frankendael_zones')]);
    const filtered = collected.filter(p => p.zones && p.zones.length > 0).map(plant => {
        const zoneId = typeof plant.zones[0] === 'object' ? plant.zones[0].frankendael_zones_id : plant.zones[0];
        return { ...normalizePlant(plant), main_zone: allZones.find(z => z.id === zoneId) ?? null };
    });
    response.render('collectie.liquid', { plants: filtered, title: 'In Bloei', zone_type: 'collectie', current_path: request.path });
});

app.get('/collectie/not_in_bloom', async (request, response) => {
    const userId = getActiveUserId(request);
    const collected = await getCollectedPlants(userId);
    const filtered = collected.filter(p => !p.zones || p.zones.length === 0).map(p => normalizePlant(p));
    response.render('collectie.liquid', { plants: filtered, title: 'Niet in Bloei', zone_type: 'collectie', current_path: request.path });
});

app.get('/collectie/:plant_slug', async (request, response) => {
    const data = await fetchData(`frankendael_plants?filter[slug][_eq]=${request.params.plant_slug}&fields=*.*`);
    if (!data.length) return response.status(404).send('Plant not found');
    response.render('plant-detail.liquid', { plant: normalizePlant(data[0]), zone_type: 'collectie', current_path: request.path });
});

// Account page
app.get('/account', async (req, res) => {
    try {
        // Fetch all possible memojis for the selection grid
        const availableMemojis = await fetchData('frankendael_memoji') || [];
        
        // We use the 'user' already fetched by our middleware
        const user = res.locals.user;

        // Map the grid of memojis for the user to pick from
        const memojis = availableMemojis.map(m => ({
            ...m,
            imageUrl: assetUrl(m.memoji),
            // Add a check to see if this is the currently selected one
            selected: m.id === user.memoji
        }));

        res.render('account.liquid', {
            // total_plants is calculated from the Set size in middleware
            total_plants: res.locals.collectedIds.size,
            memojis,
            current_path: req.path,
            // user and userMemoji are already in res.locals from middleware!
        });
    } catch (error) {
        console.error('Account Route Error:', error);
        res.status(500).send('Account error');
    }
});

app.patch('/account/set-memoji', async (req, res) => {
    const { memojiId } = req.body; 
    try {
        const response = await fetch(`${API_BASE}/frankendael_users/${res.locals.userId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memoji: Number(memojiId) }),
        });

        if (response.ok) {
            // PROGRESSIVE ENHANCEMENT CHECK:
            // If the request wants JSON (from fetch), send JSON.
            // If it's a standard form (browser navigation), redirect.
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.status(200).json({ success: true });
            } else {
                return res.redirect('/account');
            }
        }
        res.status(response.status).send('Update failed');
    } catch (error) {
        res.status(500).send('Server Error');
    }
});
// Update accent color
app.patch('/account/set-accent', async (req, res) => {
    const { accentColor } = req.body; 
    console.log('[accent] PATCH /account/set-accent', {
        userId: res.locals.userId,
        accentColor,
        contentType: req.headers['content-type'],
        accept: req.headers.accept
    });
    try {
        const response = await fetch(`${API_BASE}/frankendael_users/${res.locals.userId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accent_color: accentColor }),
        });
        let directusBody = null;
        try { directusBody = await response.clone().json(); } catch { directusBody = null; }

        console.log('[accent] directus response', {
            ok: response.ok,
            status: response.status,
            body: directusBody
        });

        if (response.ok) return res.status(200).json({ success: true, userId: res.locals.userId, accentColor });
        res.status(response.status).json({ error: 'Update failed', userId: res.locals.userId, accentColor, directusBody });
    } catch (error) {
        console.error('[accent] server error', error);
        res.status(500).json({ error: 'Server connection failed', userId: res.locals.userId, accentColor });
    }
});

// Auth & Other
app.get('/nieuws', async (req, res) => {
    const newsData = await fetchData('frankendael_news') || [];
    res.render('nieuws.liquid', {
        news: newsData.map(n => ({ ...n, image: assetUrl(n.image) })),
        zone_type: 'news',
        current_path: req.path,
    });
});

app.get('/nieuws/:slug', async (request, response) => {
    const data = await fetchData(`frankendael_news?filter[slug][_eq]=${request.params.slug}`);
    response.render('news-detail.liquid', { newsItem: { ...data[0], image: assetUrl(data[0].image) }, zone_type: 'news', current_path: request.path });
});

app.get('/login', (_req, res) => res.render('login.liquid'));
app.get('/welcome', (req, res) => res.render('welcome.liquid', { current_path: req.path }));
app.get('/logout', (_req, res) => { res.clearCookie('userId'); res.redirect('/login'); });

// Save collected plant
app.post('/veldverkenner/:zone_slug/:item_slug', async (req, res) => {
    const { plant_id } = req.body;
    try {
        await fetch(`${API_BASE}/frankendael_users_plants`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                frankendael_users_id: res.locals.userId,
                frankendael_plants_id: parseInt(plant_id, 10),
            }),
        });
        res.redirect(`/veldverkenner/${req.params.zone_slug}`);
    } catch (error) {
        res.status(500).send('Save error');
    }
});

// Login POST
app.post('/login', async (req, res) => {
    const { username } = req.body;
    console.log('[login] POST /login', { username, bodyKeys: Object.keys(req.body) });
    try {
        const allUsers = await fetchData('frankendael_users') || [];
        console.log('[login] fetched users count:', allUsers.length);
        console.log('[login] available usernames:', allUsers.map(u => u.name));
        
        const foundUser = allUsers.find(u => u.name?.toLowerCase() === username?.toLowerCase());
        console.log('[login] foundUser:', foundUser?.id, foundUser?.name);
        
        if (foundUser) {
            res.cookie('userId', foundUser.id, { maxAge: 2_592_000_000, httpOnly: true });
            console.log('[login] cookie set, redirecting');
            res.redirect('/');
        } else {
            console.log('[login] user not found, sending 401');
            res.status(401).send('Gebruiker niet gevonden');
        }
    } catch (error) {
        console.error('[login] error:', error);
        res.status(503).send('Inloggen mislukt');
    }
});

app.listen(8000, () => console.log('🚀 Server started: http://localhost:8000'));

