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
const DelayMonitoringService = require('./services/DelayMonitoringService');
const RecurringTransportService = require('./services/RecurringTransportService');
const SchemaBootstrapService = require('./services/SchemaBootstrapService');
const { setupSocketHandlers } = require('./sockets/handlers');
const { setupCronJobs: setupCronJobsV2 } = require('./jobs');

const app = express();
const server = http.createServer(app);
app.disable('x-powered-by');
app.set('trust proxy', 1);

const parseAllowedOrigins = () => {
  const configured = String(process.env.FRONTEND_ALLOWED_ORIGINS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const fallback = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ['http://localhost:3000', 'http://localhost:5173'];
  return new Set([...(configured.length ? configured : fallback)]);
};

const allowedOrigins = parseAllowedOrigins();
const corsOrigin = (origin, callback) => {
  // Allow same-origin/non-browser clients.
  if (!origin) return callback(null, true);
  if (allowedOrigins.has(origin)) return callback(null, true);
  return callback(new Error(`CORS blocked for origin: ${origin}`));
};

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
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
  origin: corsOrigin,
  credentials: true
}));
app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || '1mb' }));
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

const authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 min
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again later.'
  }
});
app.use('/api/auth/login', authLimiter);

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
    name: 'AISIN Cab Request Management',
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

// Socket.IO connection handling (enhanced V2 handlers)
setupSocketHandlers(io);

// Scheduled tasks
const setupCronJobs = () => {
  const autoAssignWindowMinutes = parseInt(process.env.AUTO_ASSIGN_WINDOW_MINUTES || '30', 10);

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
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await RecurringTransportService.ensureDailyTrips(new Date(), { io });
      if (result.success && result.generatedCount > 0) {
        logger.info(`Generated ${result.generatedCount} recurring commute request(s)`);
      }
    } catch (error) {
      logger.error('Recurring transport cron error:', error);
    }
  });

  // Auto-assign upcoming rides every minute for requests within assignment window.
  cron.schedule('* * * * *', async () => {
    try {
      const result = await SmartAllocationService.autoAllocateUpcomingRequests(autoAssignWindowMinutes);
      if (result.success && result.totalAllocations > 0) {
        logger.info(
          `Auto-assigned ${result.totalAllocations} request(s) across ${result.processedRoutes} route(s)`
        );
      }
    } catch (error) {
      logger.error('Auto assignment cron error:', error);
    }
  });

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

  // Monitor cab shift delays (office entry/leave schedules) every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await DelayMonitoringService.monitorCabShiftDelays({ io });
      if (result.success && result.alerts > 0) {
        logger.info(`Shift delay monitor raised ${result.alerts} alert(s)`);
      }
    } catch (error) {
      logger.error('Shift delay monitor cron error:', error);
    }
  });

  logger.info('Cron jobs scheduled');
};

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    await SchemaBootstrapService.ensureSchema();
    
    // Initialize email service
    await EmailService.initialize();
    
    // Setup cron jobs (V2 with enhanced jobs)
    setupCronJobsV2(io);
    
    // Start server
    server.listen(PORT, () => {
      console.log('');
      console.log('='.repeat(50));
      console.log('  AISIN Cab Request Management');
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
