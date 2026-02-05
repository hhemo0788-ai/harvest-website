const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// LowDB Setup
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync(path.join(__dirname, 'data', 'db.json'));
const db = low(adapter);

// Initialize DB Defaults
db.defaults({ products: [], admins: [] }).write();

// Ensure hardcoded admin exists in DB
const adminCredentials = { username: "admin", password: "1234" };
const existingAdmin = db.get('admins').find({ username: adminCredentials.username }).value();
if (!existingAdmin) {
    db.get('admins').push({ id: Date.now().toString(), ...adminCredentials }).write();
} else {
    // Update password if it changed to the requested 1234
    db.get('admins').find({ username: adminCredentials.username }).assign({ password: adminCredentials.password }).write();
}

const app = express();
const PORT = process.env.PORT || 8080;

// Trust proxy for sessions behind Railway/Heroku/Antigravity
app.set('trust proxy', 1);

// Configure Multer for Image Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'public/uploads/';
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'harvest-secret-pesticide-key',
    resave: false,
    saveUninitialized: false, // Changed to false for better session handling
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Helpful for cross-site sessions if needed, but 'lax' is usually fine
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
}));

// Auth Middleware
const isAuthenticatedAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        res.status(401).json({ error: 'Unauthorized' });
    } else {
        res.redirect('/login.html');
    }
};

// Route protection for admin.html
app.get('/admin.html', isAuthenticatedAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve static files AFTER protected routes
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // Using hardcoded check as requested, but also checking DB for consistency
    if (username === "admin" && password === "1234") {
        req.session.user = { username: "admin", role: 'admin' };
        // Explicitly save session to ensure it persists before redirect/response
        req.session.save((err) => {
            if (err) return res.status(500).json({ error: 'Session save error' });
            res.json({ success: true, role: 'admin' });
        });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
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
    let products = db.get('products').value();

    if (search) {
        const lowerSearch = search.toLowerCase();
        products = products.filter(p =>
            (p.name && p.name.toLowerCase().includes(lowerSearch)) ||
            (p.active_ingredient && p.active_ingredient.toLowerCase().includes(lowerSearch))
        );
    }

    if (category && category !== 'All') {
        if (category === 'Pesticides') {
            products = products.filter(p => p.category !== 'Fertilizers');
        } else if (category === 'Fertilizers') {
            products = products.filter(p => p.category && p.category.includes('Fertilizers'));
        } else {
            products = products.filter(p => p.category === category);
        }
    }

    products.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    res.json(products);
});

// POST Product (Admin Protected)
app.post('/api/products', isAuthenticatedAdmin, upload.single('image'), (req, res) => {
    const productData = {
        ...req.body,
        id: Date.now().toString(),
        image_url: req.file ? `/uploads/${req.file.filename}` : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    db.get('products').push(productData).write();
    res.json({ success: true, id: productData.id });
});

// PUT Product (Admin Protected)
app.put('/api/products/:id', isAuthenticatedAdmin, upload.single('image'), (req, res) => {
    const existing = db.get('products').find({ id: req.params.id }).value();
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const updates = { ...req.body, updated_at: new Date().toISOString() };
    if (req.file) {
        updates.image_url = `/uploads/${req.file.filename}`;
    }

    db.get('products').find({ id: req.params.id }).assign(updates).write();
    res.json({ success: true });
});

// DELETE Product (Admin Protected)
app.delete('/api/products/:id', isAuthenticatedAdmin, (req, res) => {
    db.get('products').remove({ id: req.params.id }).write();
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
