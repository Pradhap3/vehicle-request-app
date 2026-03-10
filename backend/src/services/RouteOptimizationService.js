const DEFAULT_OFFICE_POINT = {
  latitude: 13.11,
  longitude: 77.99
};

class RouteOptimizationService {
  static officeKeywords = ['aisin', 'narasapura', 'karinaikanahalli', 'kiadb', '563133'];
  static sameStopRadiusKm = 0.25;
  static maxClusterRadiusKm = 12;
  static corridorPenaltyKm = 6;

  static toNumberOrNull(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  static normalizeLongitude(value) {
    const lng = this.toNumberOrNull(value);
    if (lng == null) return null;
    if (lng < 0 && Math.abs(lng) >= 67 && Math.abs(lng) <= 98) {
      return Math.abs(lng);
    }
    return lng;
  }

  static normalizePoint(point) {
    if (!point) return null;
    const latitude = this.toNumberOrNull(point.latitude);
    const longitude = this.normalizeLongitude(point.longitude);
    if (latitude == null || longitude == null) return null;
    return { ...point, latitude, longitude };
  }

  static getOfficePoint() {
    const latitude = this.toNumberOrNull(process.env.OFFICE_LATITUDE) ?? DEFAULT_OFFICE_POINT.latitude;
    const longitude = this.normalizeLongitude(process.env.OFFICE_LONGITUDE) ?? DEFAULT_OFFICE_POINT.longitude;
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

  static estimateTravelMinutes(fromPoint, toPoint, targetTime = null, stopCount = 0) {
    if (!fromPoint || !toPoint) return 0;
    const baseDistance = this.distanceKm(fromPoint.latitude, fromPoint.longitude, toPoint.latitude, toPoint.longitude);
    const speed = this.estimateAverageSpeedKmph(targetTime);
    const roadFactor = baseDistance < 2 ? 1.15 : baseDistance < 10 ? 1.28 : 1.38;
    const dwellPenalty = stopCount > 0 ? Math.min(stopCount * 1.5, 12) : 0;
    return Math.max(2, Math.round(((baseDistance * roadFactor) / Math.max(speed, 12)) * 60 + dwellPenalty));
  }

  static estimateAverageSpeedKmph(targetTime = null) {
    const date = targetTime ? new Date(targetTime) : new Date();
    const hour = Number.isNaN(date.getTime()) ? new Date().getHours() : date.getHours();

    if ((hour >= 5 && hour < 9) || (hour >= 16 && hour < 21)) return 23;
    if ((hour >= 9 && hour < 16) || (hour >= 21 && hour < 23)) return 28;
    return 34;
  }

  static getSpatialKey(latitude, longitude) {
    const lat = this.toNumberOrNull(latitude);
    const lng = this.normalizeLongitude(longitude);
    if (lat == null || lng == null) return 'unknown';
    return `${Math.round(lat * 20) / 20}:${Math.round(lng * 20) / 20}`;
  }

  static getPassengerCount(request) {
    return Math.max(1, Number.parseInt(request.passengers || request.number_of_people || '1', 10) || 1);
  }

  static getRequestPoint(request) {
    const office = this.getOfficePoint();
    const outbound = this.isOfficeLocation(request.pickup_location);

    const selectedLatitude = outbound
      ? this.toNumberOrNull(request.stop_latitude ?? request.drop_latitude)
      : this.toNumberOrNull(request.stop_latitude ?? request.pickup_latitude);
    const selectedLongitude = outbound
      ? this.normalizeLongitude(request.stop_longitude ?? request.drop_longitude)
      : this.normalizeLongitude(request.stop_longitude ?? request.pickup_longitude);

    const point = selectedLatitude != null && selectedLongitude != null
      ? { latitude: selectedLatitude, longitude: selectedLongitude }
      : null;

    const distanceFromOfficeKm = point
      ? this.distanceKm(point.latitude, point.longitude, office.latitude, office.longitude)
      : null;

    return {
      ...request,
      trip_direction: outbound ? 'OUTBOUND' : 'INBOUND',
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null,
      passenger_count: this.getPassengerCount(request),
      distanceFromOfficeKm,
      spatial_key: point ? this.getSpatialKey(point.latitude, point.longitude) : 'unknown'
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

  static mergeNearbyRequests(requests = []) {
    const grouped = [];

    for (const request of requests) {
      const passengers = request.passenger_count || 1;
      let targetGroup = null;

      for (const group of grouped) {
        const sameKey = group.spatial_key === request.spatial_key && group.trip_direction === request.trip_direction;
        const distance = group.latitude != null && request.latitude != null
          ? this.distanceKm(group.latitude, group.longitude, request.latitude, request.longitude)
          : Number.POSITIVE_INFINITY;
        const sameStopName = group.stop_name && request.stop_name
          && String(group.stop_name).trim().toLowerCase() === String(request.stop_name).trim().toLowerCase();

        if (sameKey || sameStopName || distance <= this.sameStopRadiusKm) {
          targetGroup = group;
          break;
        }
      }

      if (!targetGroup) {
        grouped.push({
          ...request,
          passenger_count: passengers,
          requests: [request]
        });
        continue;
      }

      targetGroup.passenger_count += passengers;
      targetGroup.requests.push(request);
    }

    return grouped;
  }

  static clusterRequests(requests = [], availableCabs = []) {
    if (!requests.length || !availableCabs.length) return [];

    const normalized = this.sortRequestsForTrip(requests.map((request) => this.getRequestPoint(request)));
    const mergedStops = this.mergeNearbyRequests(normalized);
    const capacities = availableCabs.map((cab) => Number(cab.capacity) || 0).filter(Boolean).sort((a, b) => b - a);
    const maxCapacity = capacities[0] || 1;
    const clusters = [];
    const pending = [...mergedStops];

    while (pending.length > 0) {
      const seed = pending.shift();
      const clusterStops = [seed];
      let clusterPassengers = seed.passenger_count || 1;

      while (pending.length > 0) {
        let bestIndex = -1;
        let bestScore = Number.POSITIVE_INFINITY;

        for (let index = 0; index < pending.length; index += 1) {
          const candidate = pending[index];
          if ((clusterPassengers + (candidate.passenger_count || 1)) > maxCapacity) continue;

          const anchor = clusterStops[clusterStops.length - 1];
          const hopDistance = anchor.latitude != null && candidate.latitude != null
            ? this.distanceKm(anchor.latitude, anchor.longitude, candidate.latitude, candidate.longitude)
            : Math.abs(Number(anchor.stop_sequence || 0) - Number(candidate.stop_sequence || 0));
          const seedDistance = seed.latitude != null && candidate.latitude != null
            ? this.distanceKm(seed.latitude, seed.longitude, candidate.latitude, candidate.longitude)
            : hopDistance;

          if (seedDistance > this.maxClusterRadiusKm) continue;

          const score = (hopDistance * 1.7) + seedDistance + Math.abs((candidate.distanceFromOfficeKm || 0) - (seed.distanceFromOfficeKm || 0));
          if (score < bestScore) {
            bestScore = score;
            bestIndex = index;
          }
        }

        if (bestIndex < 0) break;

        const candidate = pending.splice(bestIndex, 1)[0];
        clusterStops.push(candidate);
        clusterPassengers += candidate.passenger_count || 1;
      }

      const expandedRequests = clusterStops.flatMap((stop) => stop.requests || [stop]);
      const orderedRequests = this.optimizeSequence(expandedRequests);
      const routeMetrics = this.buildRouteMetrics(orderedRequests);

      clusters.push({
        tripDirection: orderedRequests[0]?.trip_direction || 'INBOUND',
        passengerCount: orderedRequests.reduce((sum, request) => sum + (request.passenger_count || 1), 0),
        stopCount: clusterStops.length,
        requests: orderedRequests,
        virtualStops: clusterStops,
        routeDistanceKm: routeMetrics.distanceKm,
        routeMetrics
      });
    }

    return clusters.sort((a, b) =>
      b.passengerCount - a.passengerCount
      || a.routeMetrics.durationMinutes - b.routeMetrics.durationMinutes
    );
  }

  static optimizeSequence(requests = []) {
    const enriched = this.sortRequestsForTrip(requests.map((request) => this.getRequestPoint(request)));
    if (enriched.length <= 2) return enriched;

    const office = this.getOfficePoint();
    const direction = enriched[0]?.trip_direction || 'INBOUND';
    const origin = direction === 'OUTBOUND'
      ? this.normalizePoint(office)
      : this.normalizePoint(office);

    const remaining = [...enriched];
    const ordered = [];
    let current = origin;

    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestScore = Number.POSITIVE_INFINITY;

      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index];
        const hopDistance = current && candidate.latitude != null
          ? this.distanceKm(current.latitude, current.longitude, candidate.latitude, candidate.longitude)
          : Number(candidate.distanceFromOfficeKm || 0);
        const corridorPenalty = direction === 'OUTBOUND'
          ? Number(candidate.distanceFromOfficeKm || 0)
          : -Number(candidate.distanceFromOfficeKm || 0);
        const score = hopDistance + (corridorPenalty * 0.2);
        if (score < bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }

      const [next] = remaining.splice(bestIndex, 1);
      ordered.push(next);
      current = this.normalizePoint(next);
    }

    return this.twoOpt(direction, ordered);
  }

  static twoOpt(direction, requests = []) {
    if (requests.length < 4) return requests;

    const office = this.getOfficePoint();
    const anchor = this.normalizePoint(office);
    const routeDistance = (sequence) => {
      let total = 0;
      let previous = anchor;
      for (const stop of sequence) {
        const point = this.normalizePoint(stop);
        if (previous && point) {
          total += this.distanceKm(previous.latitude, previous.longitude, point.latitude, point.longitude);
        }
        previous = point;
      }
      if (direction === 'INBOUND' && previous) {
        total += this.distanceKm(previous.latitude, previous.longitude, anchor.latitude, anchor.longitude);
      }
      return total;
    };

    let improved = [...requests];
    let bestDistance = routeDistance(improved);
    let changed = true;

    while (changed) {
      changed = false;
      for (let i = 0; i < improved.length - 2; i += 1) {
        for (let j = i + 1; j < improved.length - 1; j += 1) {
          const candidate = [
            ...improved.slice(0, i),
            ...improved.slice(i, j + 1).reverse(),
            ...improved.slice(j + 1)
          ];
          const candidateDistance = routeDistance(candidate);
          if (candidateDistance + 0.05 < bestDistance) {
            improved = candidate;
            bestDistance = candidateDistance;
            changed = true;
          }
        }
      }
    }

    return improved;
  }

  static buildStopPlan(requests = [], startTime = null) {
    const office = this.getOfficePoint();
    const direction = requests[0]?.trip_direction || 'INBOUND';
    const timeline = [];
    const grouped = [];

    for (const request of requests) {
      let stop = grouped.find((row) =>
        (row.stop_name && request.stop_name && String(row.stop_name).trim().toLowerCase() === String(request.stop_name).trim().toLowerCase())
        || (row.latitude != null && request.latitude != null
          && this.distanceKm(row.latitude, row.longitude, request.latitude, request.longitude) <= this.sameStopRadiusKm)
      );
      if (!stop) {
        stop = {
          stop_name: request.stop_name || request.pickup_location || request.drop_location || `Stop ${grouped.length + 1}`,
          stop_sequence: grouped.length + 1,
          latitude: request.latitude,
          longitude: request.longitude,
          passenger_count: 0,
          employee_ids: [],
          employee_names: []
        };
        grouped.push(stop);
      }
      stop.passenger_count += request.passenger_count || 1;
      stop.employee_ids.push(request.employee_id);
      if (request.employee_name) stop.employee_names.push(request.employee_name);
    }

    let current = this.normalizePoint(office);
    let minutesFromStart = 0;

    grouped.forEach((stop, index) => {
      const point = this.normalizePoint(stop);
      const legMinutes = current && point ? this.estimateTravelMinutes(current, point, startTime, index) : 0;
      minutesFromStart += legMinutes;
      timeline.push({
        ...stop,
        eta_offset_minutes: minutesFromStart,
        leg_minutes: legMinutes
      });
      current = point;
    });

    if (direction === 'INBOUND' && current) {
      minutesFromStart += this.estimateTravelMinutes(current, this.normalizePoint(office), startTime, grouped.length);
    }

    return {
      stops: timeline,
      totalStopCount: timeline.length,
      totalDurationMinutes: minutesFromStart
    };
  }

  static buildRouteMetrics(requests = [], startTime = null) {
    const office = this.getOfficePoint();
    const direction = requests[0]?.trip_direction || 'INBOUND';
    const stopPlan = this.buildStopPlan(requests, startTime);
    const points = requests.map((request) => this.normalizePoint(request)).filter(Boolean);

    let totalDistanceKm = 0;
    let previous = this.normalizePoint(office);
    for (const point of points) {
      totalDistanceKm += this.distanceKm(previous.latitude, previous.longitude, point.latitude, point.longitude);
      previous = point;
    }
    if (direction === 'INBOUND' && previous) {
      totalDistanceKm += this.distanceKm(previous.latitude, previous.longitude, office.latitude, office.longitude);
    }

    return {
      distanceKm: Number(totalDistanceKm.toFixed(2)),
      durationMinutes: stopPlan.totalDurationMinutes,
      stopPlan: stopPlan.stops,
      stopCount: stopPlan.totalStopCount,
      averageLegMinutes: stopPlan.totalStopCount > 0 ? Number((stopPlan.totalDurationMinutes / stopPlan.totalStopCount).toFixed(1)) : 0
    };
  }

  static scoreCabForCluster(cab, cluster) {
    const capacity = Number(cab.capacity) || 0;
    const passengerCount = Number(cluster.passengerCount) || 0;
    if (capacity < passengerCount) return Number.NEGATIVE_INFINITY;

    const leftoverSeats = capacity - passengerCount;
    const utilization = passengerCount / Math.max(capacity, 1);
    const firstStop = cluster.requests[0];
    const cabDistanceToFirstStop = cab.current_latitude != null && cab.current_longitude != null && firstStop?.latitude != null && firstStop?.longitude != null
      ? this.distanceKm(Number(cab.current_latitude), this.normalizeLongitude(cab.current_longitude), firstStop.latitude, firstStop.longitude)
      : this.corridorPenaltyKm;

    return (
      (Number(cab.driver_route_match) || 0) * 1200 +
      (Number(cab.route_trip_count) || 0) * 30 +
      (cab.driver_id ? 40 : 0) +
      (utilization * 100) -
      (leftoverSeats * 12) -
      (cluster.routeMetrics.distanceKm * 0.08) -
      (cabDistanceToFirstStop * 3)
    );
  }

  static planAssignments(requests = [], availableCabs = [], options = {}) {
    const clusters = this.clusterRequests(requests, availableCabs);
    const remainingCabs = [...availableCabs];
    const assignments = [];
    const baseTime = options.baseTime || new Date();

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
      const routeMetrics = this.buildRouteMetrics(cluster.requests, baseTime);

      assignments.push({
        cab,
        cluster: {
          ...cluster,
          routeMetrics
        },
        score: Number(bestCabScore.toFixed(2)),
        utilizationPct: Math.round((cluster.passengerCount / Math.max(Number(cab.capacity) || 1, 1)) * 100),
        remainingSeats: Math.max(0, (Number(cab.capacity) || 0) - cluster.passengerCount)
      });
    }

    return assignments;
  }

  static buildTrackingMetrics({ cab, routePath = [], currentPoint, tripDirection }) {
    const normalizedPath = routePath
      .map((point, index) => {
        const normalized = this.normalizePoint(point);
        return normalized ? { ...point, ...normalized, index } : null;
      })
      .filter(Boolean);

    const cabPoint = currentPoint || this.normalizePoint({
      latitude: cab?.current_latitude,
      longitude: cab?.current_longitude
    });

    if (!cabPoint || normalizedPath.length === 0) {
      return {
        nextStop: null,
        remainingStops: [],
        etaMinutes: null,
        completionPct: 0
      };
    }

    let nextStopIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const point of normalizedPath) {
      const distance = this.distanceKm(cabPoint.latitude, cabPoint.longitude, point.latitude, point.longitude);
      if (distance < bestDistance) {
        bestDistance = distance;
        nextStopIndex = point.index;
      }
    }

    const remainingStops = normalizedPath.slice(nextStopIndex).filter((point) =>
      point.kind === 'ROUTE_STOP' || point.kind === 'OFFICE' || point.kind === 'DESTINATION'
    );

    let etaMinutes = 0;
    let previous = cabPoint;
    for (const stop of remainingStops) {
      etaMinutes += this.estimateTravelMinutes(previous, stop, new Date(), 0);
      previous = stop;
    }

    const completionPct = normalizedPath.length > 0
      ? Math.max(0, Math.min(100, Math.round((nextStopIndex / normalizedPath.length) * 100)))
      : 0;

    return {
      nextStop: remainingStops[0] || null,
      remainingStops,
      etaMinutes,
      completionPct,
      nearestPathDistanceKm: Number(bestDistance.toFixed(2)),
      tripDirection
    };
  }
}

module.exports = RouteOptimizationService;
