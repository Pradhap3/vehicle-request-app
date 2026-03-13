const { sql, getPool } = require('../config/database');

class Vendor {
  static async findAll() {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT v.*,
        (SELECT COUNT(*) FROM drivers d WHERE d.vendor_id = v.id AND d.is_active = 1) AS driver_count,
        (SELECT COUNT(*) FROM vehicles vh WHERE vh.vendor_id = v.id AND vh.is_active = 1) AS vehicle_count
      FROM vendors v WHERE v.is_active = 1 ORDER BY v.name
    `);
    return result.recordset;
  }

  static async findById(id) {
    const pool = getPool();
    const result = await pool.request().input('id', sql.Int, id).query(`
      SELECT v.*,
        (SELECT COUNT(*) FROM drivers d WHERE d.vendor_id = v.id AND d.is_active = 1) AS driver_count,
        (SELECT COUNT(*) FROM vehicles vh WHERE vh.vendor_id = v.id AND vh.is_active = 1) AS vehicle_count
      FROM vendors v WHERE v.id = @id
    `);
    return result.recordset[0] || null;
  }

  static async create(data) {
    const pool = getPool();
    const result = await pool.request()
      .input('name', sql.NVarChar(255), data.name)
      .input('contactPerson', sql.NVarChar(255), data.contact_person || null)
      .input('email', sql.NVarChar(255), data.email || null)
      .input('phone', sql.NVarChar(20), data.phone || null)
      .input('address', sql.NVarChar(500), data.address || null)
      .input('contractStart', sql.Date, data.contract_start || null)
      .input('contractEnd', sql.Date, data.contract_end || null)
      .query(`
        INSERT INTO vendors (name, contact_person, email, phone, address, contract_start, contract_end)
        OUTPUT INSERTED.* VALUES (@name, @contactPerson, @email, @phone, @address, @contractStart, @contractEnd)
      `);
    return result.recordset[0];
  }

  static async update(id, data) {
    const pool = getPool();
    const request = pool.request().input('id', sql.Int, id);
    const sets = ['updated_at = GETDATE()'];
    const fields = {
      name: sql.NVarChar(255), contact_person: sql.NVarChar(255),
      email: sql.NVarChar(255), phone: sql.NVarChar(20), address: sql.NVarChar(500)
    };
    for (const [k, t] of Object.entries(fields)) {
      if (data[k] !== undefined) { request.input(k, t, data[k]); sets.push(`${k} = @${k}`); }
    }
    if (data.contract_start !== undefined) { request.input('cs', sql.Date, data.contract_start); sets.push('contract_start = @cs'); }
    if (data.contract_end !== undefined) { request.input('ce', sql.Date, data.contract_end); sets.push('contract_end = @ce'); }

    const result = await request.query(`UPDATE vendors SET ${sets.join(', ')} OUTPUT INSERTED.* WHERE id = @id`);
    return result.recordset[0] || null;
  }

  static async delete(id) {
    const pool = getPool();
    await pool.request().input('id', sql.Int, id).query(`UPDATE vendors SET is_active = 0, updated_at = GETDATE() WHERE id = @id`);
    return true;
  }
}

module.exports = Vendor;
