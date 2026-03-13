const { asyncHandler } = require('../middleware/errorHandler');
const ReportsService = require('../services/ReportsService');

const parseDates = (req) => {
  const today = new Date();
  const from = req.query.from_date || new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const to = req.query.to_date || today.toISOString().split('T')[0];
  return { from, to };
};

exports.tripSummary = asyncHandler(async (req, res) => {
  const { from, to } = parseDates(req);
  const data = await ReportsService.getTripSummary(from, to);
  res.json({ success: true, data });
});

exports.dailyBreakdown = asyncHandler(async (req, res) => {
  const { from, to } = parseDates(req);
  const data = await ReportsService.getDailyBreakdown(from, to);
  res.json({ success: true, data });
});

exports.driverPerformance = asyncHandler(async (req, res) => {
  const { from, to } = parseDates(req);
  const data = await ReportsService.getDriverPerformance(from, to);
  res.json({ success: true, data });
});

exports.vehicleUtilization = asyncHandler(async (req, res) => {
  const { from, to } = parseDates(req);
  const data = await ReportsService.getVehicleUtilization(from, to);
  res.json({ success: true, data });
});

exports.employeeUsage = asyncHandler(async (req, res) => {
  const { from, to } = parseDates(req);
  const data = await ReportsService.getEmployeeUsage(from, to);
  res.json({ success: true, data });
});

exports.shiftReport = asyncHandler(async (req, res) => {
  const { from, to } = parseDates(req);
  const data = await ReportsService.getShiftReport(from, to);
  res.json({ success: true, data });
});

exports.routeReport = asyncHandler(async (req, res) => {
  const { from, to } = parseDates(req);
  const data = await ReportsService.getRouteReport(from, to);
  res.json({ success: true, data });
});

exports.incidentReport = asyncHandler(async (req, res) => {
  const { from, to } = parseDates(req);
  const data = await ReportsService.getIncidentReport(from, to);
  res.json({ success: true, data });
});

exports.exportCSV = asyncHandler(async (req, res) => {
  const { type = 'trips' } = req.params;
  const { from, to } = parseDates(req);
  const csv = await ReportsService.exportCSV(type, from, to);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${type}_report_${from}_${to}.csv`);
  res.send(csv);
});
