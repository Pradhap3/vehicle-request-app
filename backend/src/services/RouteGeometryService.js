const axios = require('axios');
const logger = require('../utils/logger');

class RouteGeometryService {
  static defaultBaseUrl = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';

  static toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  static normalizePoint(point) {
    if (!point) return null;
    const latitude = this.toNumber(point.latitude);
    const longitude = this.toNumber(point.longitude);
    if (latitude == null || longitude == null) return null;
    return { latitude, longitude };
  }

  static dedupePoints(points = []) {
    const normalized = points
      .map((point) => this.normalizePoint(point))
      .filter(Boolean);

    return normalized.filter((point, index) => {
      if (index === 0) return true;
      const previous = normalized[index - 1];
      return previous.latitude !== point.latitude || previous.longitude !== point.longitude;
    });
  }

  static buildFallbackGeometry(points = []) {
    const normalized = this.dedupePoints(points);
    return {
      points: normalized.map((point) => [point.latitude, point.longitude]),
      source: 'fallback'
    };
  }

  static async getRoadGeometry(points = []) {
    const normalized = this.dedupePoints(points);
    if (normalized.length < 2) {
      return this.buildFallbackGeometry(normalized);
    }

    const coordinates = normalized.map((point) => `${point.longitude},${point.latitude}`).join(';');
    const url = `${this.defaultBaseUrl}/route/v1/driving/${coordinates}`;

    try {
      const response = await axios.get(url, {
        params: {
          overview: 'full',
          geometries: 'geojson',
          steps: false
        },
        timeout: 10000
      });

      const route = response.data?.routes?.[0];
      const geometry = route?.geometry?.coordinates;
      if (!Array.isArray(geometry) || geometry.length < 2) {
        return this.buildFallbackGeometry(normalized);
      }

      return {
        points: geometry.map(([longitude, latitude]) => [latitude, longitude]),
        distanceMeters: route.distance ?? null,
        durationSeconds: route.duration ?? null,
        source: 'osrm'
      };
    } catch (error) {
      logger.warn(`Route geometry fallback used: ${error.message}`);
      return this.buildFallbackGeometry(normalized);
    }
  }
}

module.exports = RouteGeometryService;
