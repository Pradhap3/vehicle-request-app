import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

export const useGeolocation = (options = {}) => {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [permissionStatus, setPermissionStatus] = useState('prompt'); // 'granted', 'denied', 'prompt'
  const [watching, setWatching] = useState(false);

  const {
    enableHighAccuracy = true,
    timeout = 10000,
    maximumAge = 0,
    watchPosition = false,
    onLocationUpdate = null
  } = options;

  // Check permission status
  const checkPermission = useCallback(async () => {
    if (!navigator.permissions) {
      setPermissionStatus('prompt');
      return 'prompt';
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      setPermissionStatus(result.state);
      
      // Listen for permission changes
      result.addEventListener('change', () => {
        setPermissionStatus(result.state);
      });
      
      return result.state;
    } catch (err) {
      console.error('Permission check failed:', err);
      setPermissionStatus('prompt');
      return 'prompt';
    }
  }, []);

  // Request location permission with user-friendly prompts
  const requestPermission = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      const err = 'Geolocation is not supported by your browser';
      setError(err);
      setLoading(false);
      toast.error(err);
      return { success: false, error: err };
    }

    return new Promise((resolve) => {
      // Show instruction toast
      toast('Please allow location access when prompted', {
        icon: '📍',
        duration: 5000
      });

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          };
          setLocation(loc);
          setPermissionStatus('granted');
          setLoading(false);
          toast.success('Location access granted!');
          resolve({ success: true, location: loc });
        },
        (err) => {
          let errorMessage = 'Unable to retrieve location';
          
          switch (err.code) {
            case err.PERMISSION_DENIED:
              errorMessage = 'Location permission denied. Please enable location in browser settings.';
              setPermissionStatus('denied');
              break;
            case err.POSITION_UNAVAILABLE:
              errorMessage = 'Location information is unavailable.';
              break;
            case err.TIMEOUT:
              errorMessage = 'Location request timed out.';
              break;
          }
          
          setError(errorMessage);
          setLoading(false);
          toast.error(errorMessage);
          resolve({ success: false, error: errorMessage });
        },
        {
          enableHighAccuracy,
          timeout,
          maximumAge
        }
      );
    });
  }, [enableHighAccuracy, timeout, maximumAge]);

  // Start watching position
  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return null;
    }

    if (watching) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const loc = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          timestamp: position.timestamp
        };
        setLocation(loc);
        setError(null);
        
        if (onLocationUpdate) {
          onLocationUpdate(loc);
        }
      },
      (err) => {
        let errorMessage = 'Location tracking error';
        switch (err.code) {
          case err.PERMISSION_DENIED:
            errorMessage = 'Location permission denied';
            break;
          case err.POSITION_UNAVAILABLE:
            errorMessage = 'Position unavailable';
            break;
          case err.TIMEOUT:
            errorMessage = 'Location request timeout';
            break;
        }
        setError(errorMessage);
      },
      {
        enableHighAccuracy,
        timeout,
        maximumAge
      }
    );

    setWatching(true);
    return watchId;
  }, [watching, enableHighAccuracy, timeout, maximumAge, onLocationUpdate]);

  // Stop watching position
  const stopWatching = useCallback((watchId) => {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
    }
    setWatching(false);
  }, []);

  // Get current position once
  const getCurrentPosition = useCallback(() => {
    return requestPermission();
  }, [requestPermission]);

  // Check permission on mount
  useEffect(() => {
    checkPermission().then((status) => {
      if (status === 'granted') {
        getCurrentPosition();
      } else {
        setLoading(false);
      }
    });
  }, [checkPermission]);

  return {
    location,
    error,
    loading,
    permissionStatus,
    watching,
    requestPermission,
    startWatching,
    stopWatching,
    getCurrentPosition,
    checkPermission
  };
};

export default useGeolocation;
