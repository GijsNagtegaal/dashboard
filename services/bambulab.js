import axios from 'axios';
import 'dotenv/config';

// ─── BAMBU CLOUD HTTP API ────────────────────────────────────────────────────
// No MQTT, no port 8883 — plain HTTPS on 443, works on any host.
// Endpoint: GET https://api.bambulab.com/v1/iot-service/api/user/bind
// Auth:     Bearer {BAMBU_TOKEN}
// Returns:  list of bound devices with last-known status
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = 'https://api.bambulab.com';

// Maps Bambu's gcode_state strings to something human-readable
const STATE_LABELS = {
    IDLE:    'Idle',
    RUNNING: 'Printing',
    PAUSE:   'Paused',
    FAILED:  'Failed',
    FINISH:  'Finished',
};

export default {
    getPrinterStatus: async () => {
        try {
            const response = await axios.get(
                `${API_BASE}/v1/iot-service/api/user/bind`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.BAMBU_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 8000,
                }
            );

            const data = response.data;

            // Debug: log the raw shape once so we can verify field names
            console.log('Bambu API raw:', JSON.stringify(data).slice(0, 400));

            if (!data || data.message !== 'success') {
                console.warn('Bambu API: unexpected response', data?.message);
                return { status: 'offline', state: 'api_error' };
            }

            // Find our printer by serial number
            const serial  = process.env.BAMBU_SERIAL?.toUpperCase();
            const devices = data.devices ?? [];
            const printer = devices.find(
                (d) => (d.dev_id ?? '').toUpperCase() === serial
            );

            if (!printer) {
                console.warn(`Bambu API: serial ${serial} not found in`, devices.map(d => d.dev_id));
                return { status: 'offline', state: 'not_found' };
            }

            // `dev_status` is 0 = offline, 1 = online
            const isOnline = printer.dev_status === 1 || printer.online === true;

            // The HTTP API gives high-level status but NOT live temps/percent.
            // Those only come via MQTT. We return what we have.
            const gcodeState = printer.print_status ?? printer.last_task_state ?? 'IDLE';

            console.log(`✅ Bambu HTTP API: ${printer.name} — ${gcodeState} (online: ${isOnline})`);

            return {
                status:      isOnline ? 'online' : 'offline',
                state:       STATE_LABELS[gcodeState] ?? gcodeState,
                name:        printer.name        ?? 'Printer',
                model:       printer.dev_product_name ?? '',
                // Live temps not available via HTTP — show dashes in your view
                temp_bed:    null,
                temp_nozzle: null,
                percent:     null,
                lastUpdated: new Date().toLocaleTimeString('nl-NL'),
            };

        } catch (err) {
            const status = err.response?.status;
            const body   = err.response?.data;
            console.error(`Bambu HTTP error [${status}]:`, body ?? err.message);

            // 401 = token expired; surface it clearly
            if (status === 401) {
                return { status: 'offline', state: 'token_expired' };
            }

            return { status: 'offline', state: 'unreachable' };
        }
    }
};