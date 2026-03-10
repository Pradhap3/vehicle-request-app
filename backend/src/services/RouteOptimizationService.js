const DEFAULT_OFFICE_POINT = {
  latitude: 13.11,
  longitude: 77.99
};

class RouteOptimizationService {
  static officeKeywords = ['aisin', 'narasapura', 'karinaikanahalli', 'kiadb', '563133'];

  static toNumberOrNull(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  static getOfficePoint() {
    const latitude = this.toNumberOrNull(process.env.OFFICE_LATITUDE) ?? DEFAULT_OFFICE_POINT.latitude;
    const rawLongitude = this.toNumberOrNull(process.env.OFFICE_LONGITUDE);
    const longitude = rawLongitude == null
      ? DEFAULT_OFFICE_POINT.longitude
      : (rawLongitude < 0 && Math.abs(rawLongitude) >= 67 && Math.abs(rawLongitude) <= 98 ? Math.abs(rawLongitude) : rawLongitude);

    return { latitude, longitude };
  }

  static isOfficeLocation(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return this.officeKeywords.some((keyword) => normalized.includes(keyword));
  }

  static distanceKm(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  static getRequestPoint(request) {
    const office = this.getOfficePoint();
    const outbound = this.isOfficeLocation(request.pickup_location);

    const selectedLatitude = outbound
      ? this.toNumberOrNull(request.stop_latitude ?? request.drop_latitude)
      : this.toNumberOrNull(request.stop_latitude ?? request.pickup_latitude);
    const selectedLongitude = outbound
      ? this.toNumberOrNull(request.stop_longitude ?? request.drop_longitude)
      : this.toNumberOrNull(request.stop_longitude ?? request.pickup_longitude);

    const latitude = selectedLatitude;
    let longitude = selectedLongitude;
    if (longitude != null && longitude < 0 && Math.abs(longitude) >= 67 && Math.abs(longitude) <= 98) {
      longitude = Math.abs(longitude);
    }

    const distanceFromOfficeKm = latitude != null && longitude != null
      ? this.distanceKm(latitude, longitude, office.latitude, office.longitude)
      : null;

    return {
      ...request,
      trip_direction: outbound ? 'OUTBOUND' : 'INBOUND',
      latitude,
      longitude,
      distanceFromOfficeKm
    };
  }

  static sortRequestsForTrip(requests = []) {
    return [...requests].sort((a, b) => {
      const aSequence = Number(a.stop_sequence || 0);
      const bSequence = Number(b.stop_sequence || 0);
      if (aSequence && bSequence && aSequence !== bSequence) {
        return a.trip_direction === 'OUTBOUND' ? bSequence - aSequence : aSequence - bSequence;
      }

      const aDistance = Number(a.distanceFromOfficeKm || 0);
      const bDistance = Number(b.distanceFromOfficeKm || 0);
      if (aDistance !== bDistance) {
        return a.trip_direction === 'OUTBOUND' ? aDistance - bDistance : bDistance - aDistance;
      }

      return String(a.employee_name || '').localeCompare(String(b.employee_name || ''));
    });
  }

  static clusterRequests(requests = [], availableCabs = []) {
    if (!requests.length || !availableCabs.length) {
      return [];
    }

    const office = this.getOfficePoint();
    const pending = this.sortRequestsForTrip(requests.map((request) => this.getRequestPoint(request)));
    const maxCapacity = Math.max(...availableCabs.map((cab) => Number(cab.capacity) || 0), 1);
    const clusters = [];

    while (pending.length > 0) {
      const seed = pending.shift();
      const cluster = [seed];

      while (cluster.length < maxCapacity && pending.length > 0) {
        const last = cluster[cluster.length - 1];
        let bestIndex = -1;
        let bestScore = Number.POSITIVE_INFINITY;

        for (let index = 0; index < pending.length; index += 1) {
          const candidate = pending[index];
          const geographicPenalty =
            last.latitude != null && last.longitude != null && candidate.latitude != null && candidate.longitude != null
              ? this.distanceKm(last.latitude, last.longitude, candidate.latitude, candidate.longitude)
              : Math.abs(Number(last.stop_sequence || 0) - Number(candidate.stop_sequence || 0)) * 2;
          const officePenalty = candidate.distanceFromOfficeKm == null
            ? 20
            : Math.abs((candidate.distanceFromOfficeKm || 0) - (seed.distanceFromOfficeKm || 0));
          const score = geographicPenalty + officePenalty;

          if (score < bestScore) {
            bestScore = score;
            bestIndex = index;
          }
        }

        if (bestIndex < 0) break;
        cluster.push(pending.splice(bestIndex, 1)[0]);
      }

      const ordered = this.sortRequestsForTrip(cluster);
      const routeDistanceKm = ordered.reduce((total, current, index) => {
        if (index === 0) {
          if (current.latitude == null || current.longitude == null) return total;
          return total + this.distanceKm(office.latitude, office.longitude, current.latitude, current.longitude);
        }
        const previous = ordered[index - 1];
        if ([previous.latitude, previous.longitude, current.latitude, current.longitude].some((value) => value == null)) {
          return total;
        }
        return total + this.distanceKm(previous.latitude, previous.longitude, current.latitude, current.longitude);
      }, 0);

      clusters.push({
        requests: ordered,
        passengerCount: ordered.length,
        routeDistanceKm
      });
    }

    return clusters.sort((a, b) => b.passengerCount - a.passengerCount || a.routeDistanceKm - b.routeDistanceKm);
  }

  static scoreCabForCluster(cab, cluster) {
    const capacity = Number(cab.capacity) || 0;
    const passengerCount = Number(cluster.passengerCount) || 0;
    if (capacity < passengerCount) return Number.NEGATIVE_INFINITY;

    const leftoverSeats = capacity - passengerCount;
    return (
      (Number(cab.driver_route_match) || 0) * 1000 +
      (Number(cab.route_trip_count) || 0) * 25 +
      (cab.driver_id ? 30 : 0) -
      leftoverSeats * 15 -
      cluster.routeDistanceKm * 0.05
    );
  }

  static planAssignments(requests = [], availableCabs = []) {
    const clusters = this.clusterRequests(requests, availableCabs);
    const remainingCabs = [...availableCabs];
    const assignments = [];

    for (const cluster of clusters) {
      let bestCabIndex = -1;
      let bestCabScore = Number.NEGATIVE_INFINITY;

      for (let index = 0; index < remainingCabs.length; index += 1) {
        const cab = remainingCabs[index];
        const score = this.scoreCabForCluster(cab, cluster);
        if (score > bestCabScore) {
          bestCabScore = score;
          bestCabIndex = index;
        }
      }

      if (bestCabIndex < 0 || bestCabScore === Number.NEGATIVE_INFINITY) {
        continue;
      }

      const [cab] = remainingCabs.splice(bestCabIndex, 1);
      assignments.push({
        cab,
        cluster,
        score: bestCabScore
      });
    }

    return assignments;
  }
}

module.exports = RouteOptimizationService;
