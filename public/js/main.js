const productGrid = document.getElementById('productGrid');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');

document.addEventListener('DOMContentLoaded', () => {
    fetchProducts();
    fetchLastUpdated();
    fetchStockPdf();
});

async function fetchLastUpdated() {
    try {
        const res = await fetch('/api/last-updated');
        const data = await res.json();
        if (data.last_updated) {
            const date = new Date(data.last_updated + 'Z'); // Treat as UTC if stored as ISO without TZ, or local depending on sqlite
            // SQLite datetime('now') returns UTC usually if not specified 'localtime'.
            // However simplistic logging above uses default CURRENT_TIMESTAMP which is UTC.
            // Let's format nicely.

            // Note: date string from server might need parsing. 
            // In SQLite, CURRENT_TIMESTAMP is YYYY-MM-DD HH:MM:SS
            // JS Date parse handles this space-separated format well enough usually, but let's be safe: replace space with T and append Z?
            // Actually standard sqlite output is "YYYY-MM-DD HH:MM:SS".
            // new Date("2026-02-05 14:00:00") treates as local time in some browsers?
            // Let's assume it's UTC for consistency or just format it as is.

            const dateObj = new Date(data.last_updated);

            if (!isNaN(dateObj)) {
                const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
                document.getElementById('lastUpdated').textContent = `آخر تحديث للقائمة: ${dateObj.toLocaleDateString('ar-EG', options)}`;
            }
        }
    } catch (err) {
        console.error('Failed to fetch last updated', err);
    }
}

searchInput.addEventListener('input', () => fetchProducts());
categoryFilter.addEventListener('change', () => fetchProducts());

categoryFilter.addEventListener('change', () => fetchProducts());

// Enforce List View
productGrid.classList.add('view-list');

async function fetchProducts() {
    const query = searchInput.value;
    const category = categoryFilter.value;

    try {
        let url = `/products?search=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}&sort=name`;
        const res = await fetch(url);
        const products = await res.json();
        renderProducts(products);
    } catch (err) {
        console.error('Error fetching products:', err);
        productGrid.innerHTML = '<p class="text-danger">Failed to load products.</p>';
    }
}

const categoryMap = {
    'Insecticide': 'مبيد حشري',
    'Fungicide': 'مبيد فطري',
    'Acaricide': 'مبيد اكاروسي',
    'Herbicide': 'مبيد حشائش',
    'Fertilizers': 'أسمدة',
    'Fertilizers-NPK': 'أسمدة NPK',
    'Fertilizers-Specialized': 'أسمدة متخصصة',
    'Fertilizers-GrowthRegulator': 'منظم نمو',
    'Fertilizers-SoilConditioner': 'محسنات تربة'
};

function renderProducts(products) {
    productGrid.innerHTML = '';

    if (products.length === 0) {
        productGrid.innerHTML = '<p>No products found.</p>';
        return;
    }

    products.forEach(product => {
        // Check for expiry
        const isExpired = new Date(product.expiration_date) < new Date();

        const card = document.createElement('div');
        card.className = 'product-card';
        card.style.cursor = 'pointer';
        card.onclick = () => window.location.href = `product.html?id=${product.id}`;

        card.innerHTML = `
            ${product.image_url ?
                `<div class="product-image-container" style="height: 200px; overflow: hidden;">
                    <img src="${product.image_url}" alt="${product.name}" style="width: 100%; height: 100%; object-fit: cover;">
                 </div>` :
                `<div class="product-image-placeholder">
                    ${product.category.includes('Fertilizers') ? '🌿' : '🪲'}
                </div>`
            }
            <div class="card-body">
                <div class="list-col-info">
                    <span class="card-category">${categoryMap[product.category] || product.category}</span>
                    <h3 class="card-title">
                        ${product.name}
                        ${isExpired ? '<span class="expiry-badge">منتهي الصلاحية</span>' : ''}
                    </h3>
                    <p class="card-desc">${product.description || 'لا يوجد وصف.'}</p>
                </div>
                
                <div class="list-col-details">
                    ${(() => {
                const isFertilizer = product.category && (product.category.includes('Fertilizers') || product.category.includes('أسمدة'));
                const label = isFertilizer ? 'التركيب' : 'المادة الفعالة';
                return product.active_ingredient ? `<div><strong>${label}:</strong><br>${product.active_ingredient.split(' + ').join('<br>')}</div>` : '';
            })()}
                    ${product.origin ? `<div><strong>المنشأ:</strong> ${product.origin}</div>` : ''}
                </div>
                
                <div class="list-col-price">
                   ${product.price.toFixed(2)} ج.م
                </div>

                <div class="list-col-stock">
                    <div class="stock-info ${product.stock < 10 ? 'stock-low' : ''}">
                         ${product.stock > 0 ? `المخزون: ${product.stock} ${{ 'Bottle': 'عبوة', 'Bag': 'كيس', 'Tablet': 'قرص' }[product.unit_type] || 'عبوة'}` : '<span class="stock-out">نفذت الكمية</span>'}
                    </div>
                     <div style="font-size: 0.8rem; color: #888; margin-top: 5px;">
                        انتهاء: ${new Date(product.expiration_date).toLocaleDateString('ar-EG')}
                    </div>
                </div>
            </div>
        `;

        productGrid.appendChild(card);
    });
}
async function fetchStockPdf() {
    try {
        const res = await fetch('/api/stock-pdf');
        const data = await res.json();
        const link = document.getElementById('stockBalanceLink');
        if (data.url) {
            link.href = data.url;
            link.style.display = 'inline-block';
        } else {
            // If no PDF uploaded, we might want to hide it or keep it as # 
            link.style.opacity = '0.5';
            link.onclick = (e) => {
                e.preventDefault();
                alert('عذراً، لم يتم رفع ملف رصيد المخزن بعد.');
            };
        }
    } catch (err) {
        console.error('Failed to fetch stock PDF', err);
    }
}
