import express from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const MONGODB_URI = process.env.MONGODB_URI; // Removed local fallback
const PORT = process.env.PORT || 8080;
const SESSION_SECRET = process.env.SESSION_SECRET || 'harvest-secret-key-2026-stable';

if (!MONGODB_URI) {
    console.error('❌ CRITICAL ERROR: MONGODB_URI environment variable is missing.');
    console.error('Please add your MongoDB Atlas connection string to Railway Environment Variables.');
    process.exit(1);
}

// --- Mongoose Schemas & Models ---
const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: String,
    price: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    active_ingredient: String,
    package_size: String,
    carton_size: String,
    origin: String,
    expiry: Date,
    description: String,
    image_url: String,
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

ProductSchema.virtual('id').get(function () {
    return this._id.toHexString();
});

const AdminSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, default: 'admin' }
});

const SettingSchema = new mongoose.Schema({
    key: { type: String, unique: true },
    value: mongoose.Schema.Types.Mixed
});

const Product = mongoose.model('Product', ProductSchema);
const Admin = mongoose.model('Admin', AdminSchema);
const Setting = mongoose.model('Setting', SettingSchema);

// --- Express App Setup ---
const app = express();

// Priority 1: Middlewares
app.set('trust proxy', 1); // Crucial for Railway/Proxies
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Multer Setup
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// Session Management
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 Days
    }
}));

// --- Middleware: Protection ---
const isAuthenticatedAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.redirect('/login.html');
};

// --- API Routes (Wrapped in Try/Catch) ---

// Auth
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

        const admin = await Admin.findOne({ username, password });
        if (admin) {
            req.session.user = { username: admin.username, role: admin.role, id: admin._id };
            req.session.save((err) => {
                if (err) return res.status(500).json({ error: 'Session save failure' });
                res.json({ success: true });
            });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: 'Auth service unavailable' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

app.get('/api/session', (req, res) => {
    res.json({ user: req.session?.user || null });
});

// Products: Collection-based
app.get(['/products', '/api/products'], async (req, res) => {
    try {
        const { search, category } = req.query;
        let filter = {};

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { active_ingredient: { $regex: search, $options: 'i' } }
            ];
        }

        if (category && category !== 'All') {
            if (category === 'Pesticides') {
                filter.category = { $ne: 'Fertilizers' };
            } else if (category === 'Fertilizers') {
                filter.category = { $regex: 'Fertilizers', $options: 'i' };
            } else {
                filter.category = category;
            }
        }

        const data = await Product.find(filter).sort({ updated_at: -1 }).lean();
        res.json(data);
    } catch (err) {
        console.error('Fetch Products Error:', err);
        res.status(500).json({ error: 'Database read error' });
    }
});

app.post(['/products', '/api/products'], isAuthenticatedAdmin, upload.single('image'), async (req, res) => {
    try {
        if (!req.body.name) return res.status(400).json({ error: 'Product name is required' });

        const productData = {
            ...req.body,
            price: Number(req.body.price) || 0,
            stock: Number(req.body.stock) || 0,
            image_url: req.file ? `/uploads/${req.file.filename}` : null
        };

        const newProduct = await Product.create(productData);
        res.status(201).json({ success: true, id: newProduct._id });
    } catch (err) {
        console.error('Create Product Error:', err);
        res.status(500).json({ error: 'Failed to save product' });
    }
});

app.put(['/products/:id', '/api/products/:id'], isAuthenticatedAdmin, upload.single('image'), async (req, res) => {
    try {
        const updateData = {
            ...req.body,
            price: Number(req.body.price) || 0,
            stock: Number(req.body.stock) || 0,
            updated_at: Date.now()
        };
        if (req.file) updateData.image_url = `/uploads/${req.file.filename}`;

        const result = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!result) return res.status(404).json({ error: 'Product not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('Update Product Error:', err);
        res.status(500).json({ error: 'Update failed' });
    }
});

app.delete(['/products/:id', '/api/products/:id'], isAuthenticatedAdmin, async (req, res) => {
    try {
        const item = await Product.findByIdAndDelete(req.params.id);
        if (item && item.image_url) {
            const fullPath = path.join(__dirname, 'public', item.image_url);
            if (fs.existsSync(fullPath)) fs.unlink(fullPath, () => { });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Delete Product Error:', err);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// Settings & Metadata
app.get(['/api/last-updated', '/last-updated'], async (req, res) => {
    try {
        const doc = await Product.findOne().sort({ updated_at: -1 }).select('updated_at').lean();
        res.json({ last_updated: doc ? doc.updated_at : null });
    } catch (err) {
        res.json({ last_updated: null });
    }
});

app.get(['/products/:id', '/api/products/:id'], async (req, res) => {
    try {
        const doc = await Product.findById(req.params.id).lean();
        if (!doc) return res.status(404).json({ error: 'Not found' });
        res.json(doc);
    } catch (err) {
        res.status(500).json({ error: 'Query failed' });
    }
});

// PDF Stock Balance
app.post('/api/upload-stock-pdf', isAuthenticatedAdmin, upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No PDF provided' });

        const setting = await Setting.findOne({ key: 'stock_pdf_url' });
        if (setting?.value) {
            const oldPath = path.join(__dirname, 'public', setting.value);
            if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => { });
        }

        const url = `/uploads/${req.file.filename}`;
        await Setting.findOneAndUpdate({ key: 'stock_pdf_url' }, { value: url }, { upsert: true });
        res.json({ success: true, url });
    } catch (err) {
        console.error('PDF Upload Error:', err);
        res.status(500).json({ error: 'PDF upload failed' });
    }
});

app.get('/api/stock-pdf', async (req, res) => {
    try {
        const doc = await Setting.findOne({ key: 'stock_pdf_url' }).lean();
        res.json({ url: doc ? doc.value : null });
    } catch (err) {
        res.json({ url: null });
    }
});

// Static Files & Page Protection
app.get('/admin.html', isAuthenticatedAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

// --- Server Lifecycle & DB Connection ---

async function startServer() {
    console.log('Connecting to MongoDB...');
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log('MongoDB Connected successfully! ✅');

        // Verify/Setup Admin
        const hasAdmin = await Admin.findOne({ username: 'admin' });
        if (!hasAdmin) {
            await Admin.create({ username: 'admin', password: '1234', role: 'admin' });
            console.log('Default admin initialized (admin/1234)');
        }

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT} 🚀`);
        });

    } catch (err) {
        console.error('CRITICAL ERROR: Failed to start application ❌');
        console.error(err);
        process.exit(1);
    }
}

startServer();
