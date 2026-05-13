import axios from 'axios';

const HA_API_URL = process.env.HOME_ASSISTANT_URL;
const HA_TOKEN = process.env.HOME_ASSISTANT_TOKEN;
const HA_LIGHT_ENTITY = process.env.HOME_ASSISTANT_LIGHT_ENTITY;

const haClient = axios.create({
    baseURL: HA_API_URL,
    headers: {
        Authorization: `Bearer ${HA_TOKEN}`,
        'Content-Type': 'application/json',
    },
});

export const getLightState = async (entityId = HA_LIGHT_ENTITY) => {
    try {
        const response = await haClient.get(`/api/states/${entityId}`);
        return {
            isOn: response.data.state === 'on',
            state: response.data.state,
            attributes: response.data.attributes,
        };
    } catch (error) {
        console.error('Home Assistant GET error:', error.message);
        return null;
    }
};

export const toggleLight = async (entityId = HA_LIGHT_ENTITY) => {
    try {
        const currentState = await getLightState(entityId);
        const action = currentState?.isOn ? 'turn_off' : 'turn_on';

        const response = await haClient.post(
            `/api/services/light/${action}`,
            {
                entity_id: entityId,
            }
        );

        return {
            success: true,
            action,
            newState: action === 'turn_on' ? 'on' : 'off',
        };
    } catch (error) {
        console.error('Home Assistant toggle error:', error.message);
        return {
            success: false,
            error: error.message,
        };
    }
};

export const turnOnLight = async (entityId = HA_LIGHT_ENTITY) => {
    try {
        await haClient.post(`/api/services/light/turn_on`, {
            entity_id: entityId,
        });
        return { success: true };
    } catch (error) {
        console.error('Home Assistant turn on error:', error.message);
        return { success: false, error: error.message };
    }
};

export const turnOffLight = async (entityId = HA_LIGHT_ENTITY) => {
    try {
        await haClient.post(`/api/services/light/turn_off`, {
            entity_id: entityId,
        });
        return { success: true };
    } catch (error) {
        console.error('Home Assistant turn off error:', error.message);
        return { success: false, error: error.message };
    }
};

export default {
    getLightState,
    toggleLight,
    turnOnLight,
    turnOffLight,
};
