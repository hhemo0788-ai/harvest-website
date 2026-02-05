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

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'harvest-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
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

// Login (Simple Plain-text for now as requested)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.get('admins').find({ username: username, password: password }).value();

    if (user) {
        req.session.user = { id: user.id, username: user.username, role: 'admin' };
        res.json({ success: true, role: 'admin' });
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

    // Sort by updated_at or created_at desc
    products.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));

    res.json(products);
});

// GET Single Product
app.get('/api/products/:id', (req, res) => {
    const product = db.get('products').find({ id: req.params.id }).value();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
});

// POST Product (Admin)
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

// PUT Product (Admin)
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

// DELETE Product (Admin)
app.delete('/api/products/:id', isAuthenticatedAdmin, (req, res) => {
    db.get('products').remove({ id: req.params.id }).write();
    res.json({ success: true });
});

// Get Last Updated Date
app.get('/api/last-updated', (req, res) => {
    const products = db.get('products').value();
    if (products.length === 0) return res.json({ last_updated: null });

    const latest = products.reduce((max, p) => {
        const date = new Date(p.updated_at || p.created_at);
        return date > max ? date : max;
    }, new Date(0));

    res.json({ last_updated: latest.toISOString() });
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
