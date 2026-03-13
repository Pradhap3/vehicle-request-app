import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

export function useDriverLocation(enabled, onLocation) {
  const watcherRef = useRef(null);
  const [locationError, setLocationError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      if (watcherRef.current) {
        watcherRef.current.remove();
        watcherRef.current = null;
      }
      return undefined;
    }

    let active = true;
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        if (active) setLocationError('Location permission was denied.');
        return;
      }

      watcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10000,
          distanceInterval: 25
        },
        (position) => {
          setLocationError(null);
          onLocation?.({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            speed: position.coords.speed,
            heading: position.coords.heading,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude
          });
        }
      );
    })();

    return () => {
      active = false;
      if (watcherRef.current) {
        watcherRef.current.remove();
        watcherRef.current = null;
      }
    };
  }, [enabled, onLocation]);

  return { locationError };
}
