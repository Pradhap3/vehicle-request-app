const Trip = require('../models/Trip');
const logger = require('../utils/logger');

exports.getMyTrips = async (req, res) => {
  try {
    const trips = await Trip.findTodayByEmployee(req.user.id);
    res.json({ success: true, data: trips });
  } catch (error) {
    logger.error('Get employee trips error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch employee trips' });
  }
};

exports.getDriverTrips = async (req, res) => {
  try {
    const trips = await Trip.findTodayByDriver(req.user.id);
    res.json({ success: true, data: trips });
  } catch (error) {
    logger.error('Get driver trips error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch driver trips' });
  }
};
