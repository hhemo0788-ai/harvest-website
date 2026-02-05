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

// --- MongoDB Configuration ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/harvest_db';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB ✅'))
    .catch(err => {
        console.error('MongoDB connection error ❌:', err);
        console.log('Please ensure MongoDB is running or MONGODB_URI is correctly set.');
    });

// --- Mongoose Schemas ---

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

// Map _id to id for frontend compatibility
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

// --- Admin Initialization ---
async function initAdmin() {
    try {
        const admin = await Admin.findOne({ username: 'admin' });
        if (!admin) {
            await Admin.create({ username: 'admin', password: '1234', role: 'admin' });
            console.log('Default admin created (admin/1234).');
        } else {
            // Keep password in sync with request
            admin.password = '1234';
            await admin.save();
        }
    } catch (err) {
        console.error('Error initializing admin:', err.message);
    }
}
// Init admin only after connection attempt (Mongoose handles buffering)
initAdmin();

// --- Server Setup ---
const app = express();
const PORT = process.env.PORT || 8080;

app.set('trust proxy', 1);

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'harvest-secret-key-2026',
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
    // Check if it's an API request or expects JSON
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        res.status(401).json({ error: 'Unauthorized' });
    } else {
        res.redirect('/login.html');
    }
};

// Protect the admin.html file directly
app.get('/admin.html', isAuthenticatedAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Protect all other files in public EXCEPT login.html and static assets if needed
// For simplicity, we just protect admin.html specifically above.
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        // Search in DB
        const admin = await Admin.findOne({ username, password });
        if (admin) {
            req.session.user = { username: admin.username, role: admin.role };
            req.session.save((err) => {
                if (err) return res.status(500).json({ error: 'Session save error' });
                res.json({ success: true, role: admin.role });
            });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/session', (req, res) => {
    res.json({ user: req.session.user || null });
});

app.get(['/products', '/api/products'], async (req, res) => {
    try {
        const { search, category } = req.query;
        let query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { active_ingredient: { $regex: search, $options: 'i' } }
            ];
        }

        if (category && category !== 'All') {
            if (category === 'Pesticides') {
                query.category = { $ne: 'Fertilizers' };
            } else if (category === 'Fertilizers') {
                query.category = { $regex: 'Fertilizers', $options: 'i' };
            } else {
                query.category = category;
            }
        }

        const products = await Product.find(query).sort({ updated_at: -1 });
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post(['/products', '/api/products'], isAuthenticatedAdmin, upload.single('image'), async (req, res) => {
    try {
        const productData = {
            ...req.body,
            price: parseFloat(req.body.price) || 0,
            stock: parseInt(req.body.stock) || 0,
            image_url: req.file ? `/uploads/${req.file.filename}` : null
        };
        const product = await Product.create(productData);
        res.json({ success: true, id: product._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put(['/products/:id', '/api/products/:id'], isAuthenticatedAdmin, upload.single('image'), async (req, res) => {
    try {
        const updates = {
            ...req.body,
            price: parseFloat(req.body.price) || 0,
            stock: parseInt(req.body.stock) || 0,
            updated_at: Date.now()
        };
        if (req.file) updates.image_url = `/uploads/${req.file.filename}`;

        const product = await Product.findByIdAndUpdate(req.params.id, updates);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete(['/products/:id', '/api/products/:id'], isAuthenticatedAdmin, async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (product && product.image_url) {
            const imagePath = path.join(__dirname, 'public', product.image_url);
            if (fs.existsSync(imagePath)) {
                try { fs.unlinkSync(imagePath); } catch (e) { }
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get(['/api/last-updated', '/last-updated'], async (req, res) => {
    try {
        const latest = await Product.findOne().sort({ updated_at: -1 });
        res.json({ last_updated: latest ? latest.updated_at : null });
    } catch (err) {
        res.json({ last_updated: null });
    }
});

app.get(['/products/:id', '/api/products/:id'], async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/upload-stock-pdf', isAuthenticatedAdmin, upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const currentPdf = await Setting.findOne({ key: 'stock_pdf_url' });
        if (currentPdf && currentPdf.value) {
            const oldPath = path.join(__dirname, 'public', currentPdf.value);
            if (fs.existsSync(oldPath)) {
                try { fs.unlinkSync(oldPath); } catch (e) { }
            }
        }

        const pdfUrl = `/uploads/${req.file.filename}`;
        await Setting.findOneAndUpdate(
            { key: 'stock_pdf_url' },
            { value: pdfUrl },
            { upsert: true }
        );

        res.json({ success: true, url: pdfUrl });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/stock-pdf', async (req, res) => {
    try {
        const pdf = await Setting.findOne({ key: 'stock_pdf_url' });
        res.json({ url: pdf ? pdf.value : null });
    } catch (err) {
        res.json({ url: null });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
