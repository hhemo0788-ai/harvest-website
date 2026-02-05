const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'harvest_system.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Users Table (for Admin)
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user'
        )`);

        // Products Table
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            stock INTEGER NOT NULL,
            expiration_date TEXT,
            active_ingredient TEXT,
            package_size TEXT,
            origin TEXT,
            image_url TEXT,
            carton_size TEXT,
            unit_type TEXT,
            updated_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Migration for existing tables
        const columns = ['active_ingredient', 'package_size', 'origin', 'image_url', 'carton_size', 'unit_type', 'updated_at'];
        columns.forEach(col => {
            db.run(`ALTER TABLE products ADD COLUMN ${col} TEXT`, (err) => {
                // Ignore error if column already exists
            });
        });

        // Create Default Admin
        const adminUsername = 'admin';
        const adminPassword = 'admin123'; // In production, use env vars
        const saltRounds = 10;

        db.get(`SELECT id FROM users WHERE username = ?`, [adminUsername], (err, row) => {
            if (err) console.error(err.message);
            if (!row) {
                bcrypt.hash(adminPassword, saltRounds, (err, hash) => {
                    if (err) console.error(err);
                    db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
                        [adminUsername, hash, 'admin'], (err) => {
                            if (err) console.error(err.message);
                            else console.log('Default admin account created (admin/admin123).');
                        });
                });
            }
        });

        // Seed functionality can be added here if needed
    });
}

module.exports = db;
