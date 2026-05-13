import axios from 'axios';

// One Call 3.0 is the only endpoint that gives you everything at once
const WEATHER_API_URL = 'https://api.openweathermap.org/data/3.0/onecall';

export const getWeather = async () => {
    try {
        const response = await axios.get(WEATHER_API_URL, {
            params: {
                lat: process.env.OPENWEATHER_LAT,
                lon: process.env.OPENWEATHER_LON,
                appid: process.env.OPENWEATHER_API_KEY,
                units: process.env.OPENWEATHER_UNIT || 'metric',
            },
        });

        const data = response.data;

        return {
            // Main Hero Data
            temp: Math.round(data.current.temp),
            feelsLike: Math.round(data.current.feels_like),
            description: data.current.weather[0].description,
            icon: `https://openweathermap.org/img/wn/${data.current.weather[0].icon}@2x.png`,
            
            // 6-Pack Stats Grid
            stats: {
                wind: `${data.current.wind_speed} m/s`,
                humidity: `${data.current.humidity}%`,
                visibility: `${(data.current.visibility / 1000).toFixed(0)}km`,
                pressure: `${data.current.pressure} hPa`,
                uv: data.current.uvi,
                dewPoint: `${Math.round(data.current.dew_point)}°C`
            },

            // Hourly Forecast (Next 24 hours)
            hourly: data.hourly.slice(0, 24).map(h => ({
                time: new Date(h.dt * 1000).toLocaleTimeString([], { hour: 'numeric' }),
                temp: Math.round(h.temp),
                icon: `https://openweathermap.org/img/wn/${h.weather[0].icon}.png`,
                pop: Math.round(h.pop * 100)
            })),

            // Minutely Rain (For the small bars)
            minutely: data.minutely || [],

            // Daily Forecast Tabs
            daily: data.daily.map(day => ({
                name: new Date(day.dt * 1000).toLocaleDateString('en-US', { weekday: 'short' }),
                temp: Math.round(day.temp.day),
                icon: `https://openweathermap.org/img/wn/${day.weather[0].icon}.png`
            }))
        };
    } catch (error) {
        // Detailed logging to help you debug the 401
        console.error('Weather API Error:', error.response ? error.response.data : error.message);
        return null;
    }
};

export default {
    getWeather,
};
