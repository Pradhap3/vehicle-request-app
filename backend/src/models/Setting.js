const { sql, getPool } = require('../config/database');

class Setting {
  static async get(category, keyName) {
    const pool = getPool();
    const result = await pool.request()
      .input('category', sql.NVarChar(50), category)
      .input('keyName', sql.NVarChar(100), keyName)
      .query(`SELECT value FROM settings WHERE category = @category AND key_name = @keyName`);
    return result.recordset[0]?.value || null;
  }

  static async getByCategory(category) {
    const pool = getPool();
    const result = await pool.request()
      .input('category', sql.NVarChar(50), category)
      .query(`SELECT key_name, value, description FROM settings WHERE category = @category ORDER BY key_name`);
    const map = {};
    for (const row of result.recordset) {
      map[row.key_name] = row.value;
    }
    return map;
  }

  static async getAll() {
    const pool = getPool();
    const result = await pool.request().query(`SELECT * FROM settings ORDER BY category, key_name`);
    return result.recordset;
  }

  static async set(category, keyName, value, userId) {
    const pool = getPool();
    await pool.request()
      .input('category', sql.NVarChar(50), category)
      .input('keyName', sql.NVarChar(100), keyName)
      .input('value', sql.NVarChar(sql.MAX), value)
      .input('updatedBy', sql.Int, userId || null)
      .query(`
        MERGE settings AS target
        USING (SELECT @category AS category, @keyName AS key_name) AS source
        ON target.category = source.category AND target.key_name = source.key_name
        WHEN MATCHED THEN UPDATE SET value = @value, updated_by = @updatedBy, updated_at = GETDATE()
        WHEN NOT MATCHED THEN INSERT (category, key_name, value, updated_by) VALUES (@category, @keyName, @value, @updatedBy);
      `);
    return { category, key_name: keyName, value };
  }

  static async bulkSet(settings, userId) {
    for (const { category, key_name, value } of settings) {
      await this.set(category, key_name, value, userId);
    }
    return true;
  }
}

module.exports = Setting;
