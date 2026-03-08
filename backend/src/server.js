// src/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');

const { connectDB, closeDB } = require('./config/database');
const routes = require('./routes');
const logger = require('./utils/logger');
const EmailService = require('./services/EmailService');
const SmartAllocationService = require('./ai/SmartAllocationService');

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    error: 'Too many requests, please try again later'
  }
});
app.use('/api/', limiter);

// Pass io to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// API Routes
app.use('/api', routes);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'AISIN Fleet Management System',
    version: '2.0.0',
    status: 'running',
    environment: process.env.NODE_ENV || 'development'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Join room based on user role
  socket.on('join_role', (role) => {
    socket.join(role);
    logger.info(`Socket ${socket.id} joined room: ${role}`);
  });

  // Driver location updates
  socket.on('driver_location', (data) => {
    io.to('HR_ADMIN').emit('cab_location_update', data);
  });

  // Trip status updates
  socket.on('trip_status', (data) => {
    io.to('HR_ADMIN').emit('trip_status_update', data);
    if (data.employee_id) {
      io.to(`user_${data.employee_id}`).emit('trip_status_update', data);
    }
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Scheduled tasks
const setupCronJobs = () => {
  // Process pending email notifications every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await EmailService.processPendingEmails();
      if (result.processed > 0) {
        logger.info(`Processed ${result.processed} email notifications`);
      }
    } catch (error) {
      logger.error('Email processing cron error:', error);
    }
  });

  // Check traffic for all active routes every 10 minutes
  if (process.env.ENABLE_AI_FEATURES === 'true') {
    cron.schedule('*/10 * * * *', async () => {
      try {
        const Route = require('./models/Route');
        const routes = await Route.findAll();
        
        for (const route of routes) {
          if (route.start_latitude && route.end_latitude) {
            await SmartAllocationService.checkTrafficAndNotify(route.id);
          }
        }
      } catch (error) {
        logger.error('Traffic check cron error:', error);
      }
    });
  }

  logger.info('Cron jobs scheduled');
};

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    
    // Initialize email service
    await EmailService.initialize();
    
    // Setup cron jobs
    setupCronJobs();
    
    // Start server
    server.listen(PORT, () => {
      console.log('');
      console.log('='.repeat(50));
      console.log('  AISIN Fleet Management System');
      console.log('='.repeat(50));
      console.log(`  Server: http://localhost:${PORT}`);
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('='.repeat(50));
      console.log('');
      
      logger.info(`Server started on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down server...');
  
  server.close(async () => {
    await closeDB();
    logger.info('Server shutdown complete');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startServer();

module.exports = { app, server, io };
