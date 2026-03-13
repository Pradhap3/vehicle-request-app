const { sql, getPool } = require('../config/database');

class Shift {
  static async findAll() {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT * FROM shifts WHERE is_active = 1 ORDER BY start_time
    `);
    return result.recordset;
  }

  static async findById(id) {
    const pool = getPool();
    const result = await pool.request().input('id', sql.Int, id).query(`
      SELECT * FROM shifts WHERE id = @id
    `);
    return result.recordset[0] || null;
  }

  static async findByCode(code) {
    const pool = getPool();
    const result = await pool.request().input('code', sql.NVarChar(20), code).query(`
      SELECT * FROM shifts WHERE shift_code = @code AND is_active = 1
    `);
    return result.recordset[0] || null;
  }

  static async create(data) {
    const pool = getPool();
    const result = await pool.request()
      .input('shiftCode', sql.NVarChar(20), data.shift_code)
      .input('name', sql.NVarChar(100), data.name)
      .input('startTime', sql.NVarChar(10), data.start_time)
      .input('endTime', sql.NVarChar(10), data.end_time)
      .input('graceMinutes', sql.Int, data.grace_minutes || 15)
      .input('pickupBefore', sql.Int, data.pickup_before_minutes || 60)
      .query(`
        INSERT INTO shifts (shift_code, name, start_time, end_time, grace_minutes, pickup_before_minutes)
        OUTPUT INSERTED.* VALUES (@shiftCode, @name, @startTime, @endTime, @graceMinutes, @pickupBefore)
      `);
    return result.recordset[0];
  }

  static async update(id, data) {
    const pool = getPool();
    const request = pool.request().input('id', sql.Int, id);
    const sets = ['updated_at = GETDATE()'];
    if (data.name) { request.input('name', sql.NVarChar(100), data.name); sets.push('name = @name'); }
    if (data.start_time) { request.input('st', sql.NVarChar(10), data.start_time); sets.push('start_time = @st'); }
    if (data.end_time) { request.input('et', sql.NVarChar(10), data.end_time); sets.push('end_time = @et'); }
    if (data.grace_minutes !== undefined) { request.input('gm', sql.Int, data.grace_minutes); sets.push('grace_minutes = @gm'); }
    if (data.pickup_before_minutes !== undefined) { request.input('pb', sql.Int, data.pickup_before_minutes); sets.push('pickup_before_minutes = @pb'); }

    const result = await request.query(`UPDATE shifts SET ${sets.join(', ')} OUTPUT INSERTED.* WHERE id = @id`);
    return result.recordset[0] || null;
  }

  static async delete(id) {
    const pool = getPool();
    await pool.request().input('id', sql.Int, id).query(`UPDATE shifts SET is_active = 0, updated_at = GETDATE() WHERE id = @id`);
    return true;
  }
}

module.exports = Shift;
