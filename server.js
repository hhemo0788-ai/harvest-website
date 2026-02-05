const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Multer for Image Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Append extension
    }
});
const upload = multer({ storage: storage });

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret-harvest-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Auth Middleware
const isAuthenticatedAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// --- API Routes ---

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        bcrypt.compare(password, user.password, (err, result) => {
            if (result) {
                req.session.user = { id: user.id, username: user.username, role: user.role };
                res.json({ success: true, role: user.role });
            } else {
                res.status(401).json({ error: 'Invalid credentials' });
            }
        });
    });
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Check Session
app.get('/api/session', (req, res) => {
    res.json({ user: req.session.user || null });
});

// GET Products (Public)
app.get('/api/products', (req, res) => {
    const { search, category } = req.query;
    let query = "SELECT * FROM products WHERE 1=1";
    let params = [];

    if (search) {
        query += " AND (name LIKE ? OR active_ingredient LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
    }

    if (category) {
        if (category === 'Pesticides') {
            // Match any category that is NOT 'Fertilizers' (assuming binary main grouping for now, or we could use IN clause)
            query += " AND category != 'Fertilizers'";
        } else if (category === 'Fertilizers') {
            query += " AND category LIKE '%Fertilizers%'";
        } else if (category !== 'All') {
            // Specific pesticide type
            query += " AND category = ?";
            params.push(category);
        }
    }

    if (req.query.sort === 'name') {
        query += " ORDER BY name ASC";
    } else {
        query += " ORDER BY created_at DESC";
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// GET Single Product (Public)
app.get('/api/products/:id', (req, res) => {
    const sql = `SELECT * FROM products WHERE id = ?`;
    db.get(sql, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Product not found' });
        res.json(row);
    });
});

// POST Product (Admin)
app.post('/api/products', isAuthenticatedAdmin, upload.single('image'), (req, res) => {
    const { name, category, description, price, stock, expiration_date, active_ingredient, package_size, origin, carton_size, unit_type } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    const sql = `INSERT INTO products (name, category, description, price, stock, expiration_date, active_ingredient, package_size, origin, image_url, carton_size, unit_type, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;
    db.run(sql, [name, category, description, price, stock, expiration_date, active_ingredient, package_size, origin, image_url, carton_size, unit_type], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

// PUT Product (Admin)
app.put('/api/products/:id', isAuthenticatedAdmin, upload.single('image'), (req, res) => {
    const { name, category, description, price, stock, expiration_date, active_ingredient, package_size, origin, carton_size, unit_type } = req.body;
    let image_url = req.file ? `/uploads/${req.file.filename}` : undefined;

    // Build Dynamic Query based on whether image is updated
    let sql = `UPDATE products SET name = ?, category = ?, description = ?, price = ?, stock = ?, expiration_date = ?, active_ingredient = ?, package_size = ?, origin = ?, carton_size = ?, unit_type = ?, updated_at = CURRENT_TIMESTAMP`;
    let params = [name, category, description, price, stock, expiration_date, active_ingredient, package_size, origin, carton_size, unit_type];

    if (image_url) {
        sql += `, image_url = ?`;
        params.push(image_url);
    }

    sql += ` WHERE id = ?`;
    params.push(req.params.id);

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// DELETE Product (Admin)
app.delete('/api/products/:id', isAuthenticatedAdmin, (req, res) => {
    const sql = `DELETE FROM products WHERE id = ?`;
    db.run(sql, req.params.id, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Get Last Updated Date
app.get('/api/last-updated', (req, res) => {
    const sql = `SELECT MAX(CASE WHEN updated_at IS NOT NULL THEN updated_at ELSE created_at END) as last_updated FROM products`;
    db.get(sql, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ last_updated: row ? row.last_updated : null });
    });
});

// Start Server
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
