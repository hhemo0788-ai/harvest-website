import express from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
import { JSONFilePreset } from 'lowdb/node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// LowDB Setup
const defaultData = { products: [], admins: [] };
const db = await JSONFilePreset(path.join(__dirname, 'data', 'db.json'), defaultData);

// Ensure hardcoded admin exists in DB
const adminCredentials = { username: "admin", password: "1234" };
await db.read();
const existingAdmin = db.data.admins.find(a => a.username === adminCredentials.username);
if (!existingAdmin) {
    db.data.admins.push({ id: Date.now().toString(), ...adminCredentials });
    await db.write();
} else {
    existingAdmin.password = adminCredentials.password;
    await db.write();
}

const app = express();
const PORT = process.env.PORT || 8080;

app.set('trust proxy', 1);

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

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'harvest-secret-pesticide-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
}));

const isAuthenticatedAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        res.status(401).json({ error: 'Unauthorized' });
    } else {
        res.redirect('/login.html');
    }
};

app.get('/admin.html', isAuthenticatedAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === "admin" && password === "1234") {
        req.session.user = { username: "admin", role: 'admin' };
        req.session.save((err) => {
            if (err) return res.status(500).json({ error: 'Session save error' });
            res.json({ success: true, role: 'admin' });
        });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/session', (req, res) => {
    res.json({ user: req.session.user || null });
});

// GET Products
app.get(['/products', '/api/products'], async (req, res) => {
    await db.read();
    const { search, category } = req.query;
    let products = [...db.data.products];

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

// POST Product
app.post(['/products', '/api/products'], isAuthenticatedAdmin, upload.single('image'), async (req, res) => {
    await db.read();
    const productData = {
        ...req.body,
        id: Date.now().toString(),
        price: parseFloat(req.body.price) || 0,
        stock: parseInt(req.body.stock) || 0,
        image_url: req.file ? `/uploads/${req.file.filename}` : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    db.data.products.push(productData);
    await db.write();
    res.json({ success: true, id: productData.id });
});

// PUT Product
app.put(['/products/:id', '/api/products/:id'], isAuthenticatedAdmin, upload.single('image'), async (req, res) => {
    await db.read();
    const index = db.data.products.findIndex(p => p.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Product not found' });

    const updates = {
        ...req.body,
        price: parseFloat(req.body.price) || 0,
        stock: parseInt(req.body.stock) || 0,
        updated_at: new Date().toISOString()
    };
    if (req.file) {
        updates.image_url = `/uploads/${req.file.filename}`;
    }

    db.data.products[index] = { ...db.data.products[index], ...updates };
    await db.write();
    res.json({ success: true });
});

// DELETE Product
app.delete(['/products/:id', '/api/products/:id'], isAuthenticatedAdmin, async (req, res) => {
    await db.read();
    db.data.products = db.data.products.filter(p => p.id !== req.params.id);
    await db.write();
    res.json({ success: true });
});

app.get(['/api/last-updated', '/last-updated'], async (req, res) => {
    await db.read();
    if (db.data.products.length === 0) return res.json({ last_updated: null });

    const latest = db.data.products.reduce((max, p) => {
        const date = new Date(p.updated_at || p.created_at);
        return date > max ? date : max;
    }, new Date(0));

    res.json({ last_updated: latest.toISOString() });
});

app.get(['/products/:id', '/api/products/:id'], async (req, res) => {
    await db.read();
    const product = db.data.products.find(p => p.id === req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
