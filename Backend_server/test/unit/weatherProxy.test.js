'use strict';

const weather = require('../../application/weather/weatherApplicationService');

describe('weatherApplicationService', () => {
  const prevKey = process.env.OPENWEATHER_API_KEY;

  afterEach(() => {
    weather._resetWeatherCacheForTests();
    if (prevKey == null) delete process.env.OPENWEATHER_API_KEY;
    else process.env.OPENWEATHER_API_KEY = prevKey;
  });

  test('WEATHER_DISABLED when missing API key', async () => {
    delete process.env.OPENWEATHER_API_KEY;
    await expect(weather.getCurrentWeather({ query: { lat: 10.77, lng: 106.7 } })).rejects.toMatchObject({
      status: 503,
      code: 'WEATHER_DISABLED'
    });
  });

  test('rejects invalid coords', async () => {
    process.env.OPENWEATHER_API_KEY = 'x';
    await expect(weather.getCurrentWeather({ query: { lat: 'x', lng: 106.7 } })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_COORD'
    });
  });
});
