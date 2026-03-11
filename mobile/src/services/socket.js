import { io } from 'socket.io-client';
import { SOCKET_URL } from '../constants/app';

export const createSocketClient = (token) => io(SOCKET_URL, {
  auth: { token },
  transports: ['websocket', 'polling'],
  reconnection: true
});
