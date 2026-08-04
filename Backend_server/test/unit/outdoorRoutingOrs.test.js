'use strict';

const {
  mapOsrmRoute,
  mapOrsRoute,
  shouldTryOrsFallback,
  normalizeManeuver,
  instructionVi
} = require('../../application/navigation/outdoorRoutingApplicationService');

describe('outdoorRoutingApplicationService', () => {
  const prevOrs = process.env.ORS_API_KEY;

  afterEach(() => {
    if (prevOrs == null) delete process.env.ORS_API_KEY;
    else process.env.ORS_API_KEY = prevOrs;
  });

  test('mapOsrmRoute maps polyline + steps', () => {
    const mapped = mapOsrmRoute({
      code: 'Ok',
      routes: [
        {
          distance: 120.4,
          duration: 90.2,
          geometry: {
            coordinates: [
              [106.7, 10.77],
              [106.701, 10.771]
            ]
          },
          legs: [
            {
              steps: [
                {
                  distance: 50,
                  duration: 40,
                  name: 'Đường A',
                  maneuver: { type: 'depart', modifier: 'straight', location: [106.7, 10.77] }
                },
                {
                  distance: 70,
                  duration: 50,
                  name: 'Đường B',
                  maneuver: { type: 'turn', modifier: 'left', location: [106.701, 10.771] }
                }
              ]
            }
          ]
        }
      ]
    });
    expect(mapped).not.toBeNull();
    expect(mapped.provider).toBe('osrm');
    expect(mapped.polyline).toHaveLength(2);
    expect(mapped.steps[0].maneuver).toBe('depart');
    expect(mapped.steps[1].maneuver).toBe('left');
    expect(mapped.steps[1].instruction).toContain('Rẽ trái');
  });

  test('mapOrsRoute maps GeoJSON feature', () => {
    const mapped = mapOrsRoute({
      features: [
        {
          geometry: {
            coordinates: [
              [106.7, 10.77],
              [106.702, 10.772]
            ]
          },
          properties: {
            summary: { distance: 200, duration: 150 },
            segments: [
              {
                steps: [
                  {
                    type: 11,
                    distance: 80,
                    duration: 60,
                    name: 'Start',
                    way_points: [0, 0]
                  },
                  {
                    type: 1,
                    distance: 120,
                    duration: 90,
                    name: 'Right rd',
                    way_points: [1, 1]
                  }
                ]
              }
            ]
          }
        }
      ]
    });
    expect(mapped).not.toBeNull();
    expect(mapped.provider).toBe('openrouteservice');
    expect(mapped.polyline).toHaveLength(2);
    expect(mapped.steps[0].maneuver).toBe('depart');
    expect(mapped.steps[1].maneuver).toBe('right');
  });

  test('shouldTryOrsFallback only when ORS_API_KEY set', () => {
    delete process.env.ORS_API_KEY;
    expect(shouldTryOrsFallback({ code: 'OSRM_UNAVAILABLE', status: 502 })).toBe(false);
    process.env.ORS_API_KEY = 'test-key';
    expect(shouldTryOrsFallback({ code: 'OSRM_UNAVAILABLE', status: 502 })).toBe(true);
    expect(shouldTryOrsFallback({ code: 'ROUTE_NOT_FOUND', status: 404 })).toBe(true);
    expect(shouldTryOrsFallback({ code: 'INVALID_COORD', status: 400 })).toBe(false);
  });

  test('normalizeManeuver + instructionVi', () => {
    expect(normalizeManeuver({ type: 'arrive' })).toBe('arrive');
    expect(instructionVi('arrive', 0, '')).toBe('Đã đến nơi');
  });
});
