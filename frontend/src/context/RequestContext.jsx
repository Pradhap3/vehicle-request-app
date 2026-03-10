import { createContext, useContext, useState, useCallback } from 'react';
import { utcToIST, istToUTC, getNowIST } from '../services/timezoneService';
import api from '../services/api';

const RequestContext = createContext();

export const RequestProvider = ({ children }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  const createRequest = useCallback(async (requestData) => {
    setLoading(true);
    try {
      // Convert IST times to UTC before sending
      const payload = {
        ...requestData,
        pickup_time: istToUTC(requestData.pickup_time)
      };

      const response = await api.post('/requests', payload);
      
      // Format response times for display
      const formatted = {
        ...response.data,
        pickup_time: utcToIST(response.data.pickup_time),
        assigned_at: utcToIST(response.data.assigned_at)
      };

      setRequests(prev => [...prev, formatted]);
      return formatted;
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <RequestContext.Provider value={{ requests, loading, createRequest }}>
      {children}
    </RequestContext.Provider>
  );
};

export const useRequests = () => {
  const context = useContext(RequestContext);
  if (!context) {
    throw new Error('useRequests must be used within RequestProvider');
  }
  return context;
};