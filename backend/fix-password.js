// ============================================
// FIX ADMIN PASSWORD - Ready to Use Script
// Copy this file as: fix-password.js
// Run with: node fix-password.js
// ============================================

require('dotenv').config();
const bcrypt = require('bcryptjs');
const sql = require('mssql');

const dbConfig = {
  server: process.env.DB_HOST || 'aisinvehiclerequest.database.windows.net',
  database: process.env.DB_NAME || 'free-sql-db-8381381',
  user: process.env.DB_USER || 'pradhap',
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectionTimeout: 30000,
    requestTimeout: 30000
  }
};

async function fixAdminPassword() {
  let pool;
  
  try {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         Admin Password Reset Utility                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    
    // Step 1: Validate credentials
    console.log('[1/4] Validating database credentials...');
    if (!dbConfig.password) {
      console.error('❌ DB_PASSWORD not found in .env file');
      console.log('\nAdd this to your .env file:');
      console.log('DB_PASSWORD=your_actual_password');
      process.exit(1);
    }
    console.log('✓ Database credentials ready');
    console.log('');
    
    // Step 2: Generate new hash
    console.log('[2/4] Generating new password hash...');
    const password = 'Admin@2024';
    const hash = await bcrypt.hash(password, 12);
    console.log('✓ Hash generated successfully');
    console.log('   Password: ' + password);
    console.log('   Hash: ' + hash);
    console.log('');
    
    // Step 3: Connect to database
    console.log('[3/4] Connecting to database...');
    pool = await sql.connect(dbConfig);
    console.log('✓ Database connected');
    console.log('');
    
    // Step 4: Update admin user
    console.log('[4/4] Updating admin user...');
    
    // Delete old admin if exists
    await pool.request()
      .query('DELETE FROM users WHERE email = \'admin@aisin.com\'');
    console.log('   ✓ Old admin user removed (if existed)');
    
    // Insert new admin
    await pool.request()
      .input('employee_id', sql.NVarChar(50), 'ADMIN001')
      .input('name', sql.NVarChar(255), 'System Admin')
      .input('email', sql.NVarChar(255), 'admin@aisin.com')
      .input('department', sql.NVarChar(100), 'IT')
      .input('role', sql.NVarChar(50), 'HR_ADMIN')
      .input('password_hash', sql.NVarChar(255), hash)
      .query(`
        INSERT INTO users (employee_id, name, email, department, role, password_hash, is_active, created_at, updated_at)
        VALUES (@employee_id, @name, @email, @department, @role, @password_hash, 1, GETDATE(), GETDATE())
      `);
    console.log('   ✓ New admin user created');
    console.log('');
    
    // Verify user was created
    const result = await pool.request()
      .query('SELECT id, email, role FROM users WHERE email = \'admin@aisin.com\'');
    
    if (result.recordset.length > 0) {
      const user = result.recordset[0];
      console.log('✓ Verification successful');
      console.log('   User ID: ' + user.id);
      console.log('   Email: ' + user.email);
      console.log('   Role: ' + user.role);
      console.log('');
    } else {
      console.error('❌ Verification failed - user not found in database');
      process.exit(1);
    }
    
    // Success message
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              ✓ PASSWORD RESET SUCCESSFUL                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Login Credentials:');
    console.log('  Email: admin@aisin.com');
    console.log('  Password: Admin@2024');
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Restart your Node.js server (npm run dev)');
    console.log('  2. Try logging in with credentials above');
    console.log('  3. Should see login success ✓');
    console.log('');
    console.log('WARNING: Change password after first login!');
    console.log('');
    
    await pool.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error occurred:');
    console.error('   ' + error.message);
    console.error('');
    
    if (error.code === 'ELOGIN') {
      console.error('Database login failed. Check:');
      console.error('  - DB_USER in .env');
      console.error('  - DB_PASSWORD in .env');
      console.error('  - DB_HOST in .env');
      console.error('  - User has permission to access database');
    } else if (error.code === 'ETIME') {
      console.error('Connection timeout. Check:');
      console.error('  - Database server is running');
      console.error('  - Firewall allows connection');
      console.error('  - Network connectivity');
    } else {
      console.error('Full error:', error);
    }
    
    if (pool) {
      await pool.close();
    }
    process.exit(1);
  }
}

// Run the fix
fixAdminPassword();
