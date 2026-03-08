// migrations/seed.js
require('dotenv').config({ path: '../.env' });

const bcrypt = require('bcryptjs');
const { sql, connectDB, closeDB } = require('../src/config/database');
const logger = require('../src/utils/logger');

const seedData = async () => {
  try {
    console.log('Starting database seeding...\n');
    
    const pool = await connectDB();
    
    // Check if admin exists
    const existingAdmin = await pool.request()
      .input('email', sql.NVarChar(255), 'admin@aisin.com')
      .query('SELECT id FROM users WHERE email = @email');
    
    if (existingAdmin.recordset.length === 0) {
      // Create admin user
      const hashedPassword = await bcrypt.hash('Admin@2024', 12);
      
      await pool.request()
        .input('employee_id', sql.NVarChar(50), 'ADMIN001')
        .input('name', sql.NVarChar(255), 'System Admin')
        .input('email', sql.NVarChar(255), 'admin@aisin.com')
        .input('department', sql.NVarChar(100), 'IT')
        .input('role', sql.NVarChar(50), 'HR_ADMIN')
        .input('password_hash', sql.NVarChar(255), hashedPassword)
        .query(`
          INSERT INTO users (employee_id, name, email, department, role, password_hash, is_active, created_at, updated_at)
          VALUES (@employee_id, @name, @email, @department, @role, @password_hash, 1, GETDATE(), GETDATE())
        `);
      
      console.log('✅ Admin user created:');
      console.log('   Email: admin@aisin.com');
      console.log('   Password: Admin@2024');
    } else {
      console.log('ℹ️  Admin user already exists');
    }

    // Create sample routes if none exist
    const existingRoutes = await pool.request()
      .query('SELECT COUNT(*) as count FROM routes');
    
    if (existingRoutes.recordset[0].count === 0) {
      const sampleRoutes = [
        {
          name: 'Office to Tech Park',
          start_point: 'AISIN Office, Industrial Area',
          end_point: 'Tech Park, Electronic City',
          start_latitude: 12.8496,
          start_longitude: 77.6603,
          end_latitude: 12.8456,
          end_longitude: 77.6611,
          distance_km: 15,
          estimated_time_minutes: 35
        },
        {
          name: 'Station to Office',
          start_point: 'Central Railway Station',
          end_point: 'AISIN Office, Industrial Area',
          start_latitude: 12.9762,
          start_longitude: 77.5713,
          end_latitude: 12.8496,
          end_longitude: 77.6603,
          distance_km: 22,
          estimated_time_minutes: 45
        }
      ];

      for (const route of sampleRoutes) {
        await pool.request()
          .input('name', sql.NVarChar(255), route.name)
          .input('start_point', sql.NVarChar(500), route.start_point)
          .input('end_point', sql.NVarChar(500), route.end_point)
          .input('start_latitude', sql.Float, route.start_latitude)
          .input('start_longitude', sql.Float, route.start_longitude)
          .input('end_latitude', sql.Float, route.end_latitude)
          .input('end_longitude', sql.Float, route.end_longitude)
          .input('distance_km', sql.Float, route.distance_km)
          .input('estimated_time_minutes', sql.Int, route.estimated_time_minutes)
          .query(`
            INSERT INTO routes (name, start_point, end_point, start_latitude, start_longitude, 
                               end_latitude, end_longitude, distance_km, estimated_time_minutes, 
                               is_active, created_at, updated_at)
            VALUES (@name, @start_point, @end_point, @start_latitude, @start_longitude,
                    @end_latitude, @end_longitude, @distance_km, @estimated_time_minutes,
                    1, GETDATE(), GETDATE())
          `);
      }
      
      console.log('✅ Sample routes created');
    } else {
      console.log('ℹ️  Routes already exist');
    }

    console.log('\n✅ Seeding completed');
    console.log('\n='.repeat(50));
    console.log('  Production Login Credentials:');
    console.log('  Email: admin@aisin.com');
    console.log('  Password: Admin@2024');
    console.log('='.repeat(50));
    console.log('\n⚠️  IMPORTANT: Change the admin password after first login!');
    
    await closeDB();
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seedData();
