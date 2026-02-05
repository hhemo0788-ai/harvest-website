document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    if (productId) {
        fetchProductDetails(productId);
    } else {
        document.getElementById('product-details-container').innerHTML = '<p>Product not found.</p>';
    }
});

async function fetchProductDetails(id) {
    try {
        const res = await fetch(`/products/${id}`);
        if (!res.ok) throw new Error('Product not found');
        const product = await res.json();
        renderProductDetails(product);
    } catch (err) {
        console.error(err);
        document.getElementById('product-details-container').innerHTML = '<p>Error loading product details.</p>';
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

function renderProductDetails(product) {
    document.title = `${product.name} | Harvest Distribution`;

    // Image
    const imageWrapper = document.getElementById('detail-image-wrapper');
    if (product.image_url) {
        imageWrapper.innerHTML = `<img src="${product.image_url}" alt="${product.name}" style="max-height: 100%; max-width: 100%; object-fit: contain;">`;
    } else {
        const icon = product.category.includes('Fertilizers') ? '🌿' : '🪲';
        imageWrapper.innerHTML = `<span style="font-size: 8rem;">${icon}</span>`;
    }

    // Text Fields
    document.getElementById('detail-category').textContent = categoryMap[product.category] || product.category;
    document.getElementById('detail-name').textContent = product.name;
    document.getElementById('detail-price').textContent = `${product.price.toFixed(2)} ج.م`;
    document.getElementById('detail-description').textContent = product.description || 'لا يوجد وصف متاح.';

    // Dynamic Label for Active Ingredient / Composition
    const activeLabel = document.getElementById('detail-active-label');
    if (product.category && (product.category.includes('Fertilizers') || product.category.includes('أسمدة'))) {
        activeLabel.textContent = 'التركيب';
    } else {
        activeLabel.textContent = 'المادة الفعالة';
    }

    // Meta Fields
    // Meta Fields
    if (product.active_ingredient) {
        const ingredients = product.active_ingredient.split(' + ');
        document.getElementById('detail-active').innerHTML = ingredients.map(ing => `<div style="margin-bottom: 4px;">${ing}</div>`).join('');
    } else {
        document.getElementById('detail-active').textContent = 'غير متوفر';
    }
    document.getElementById('detail-size').textContent = product.package_size || 'غير متوفر';
    document.getElementById('detail-origin').textContent = product.origin || 'غير متوفر';
    document.getElementById('detail-expiry').textContent = new Date(product.expiration_date).toLocaleDateString('ar-EG');
    document.getElementById('detail-carton').textContent = product.carton_size || 'غير متوفر';

    // Stock Logic
    const stockEl = document.getElementById('detail-stock');
    const unitMap = { 'Bottle': 'عبوة', 'Bag': 'كيس', 'Tablet': 'قرص' };
    const unit = unitMap[product.unit_type] || 'عبوة';

    if (product.stock > 10) {
        stockEl.innerHTML = `<span style="color: var(--primary-color);">متوفر (${product.stock} ${unit})</span>`;
    } else if (product.stock > 0) {
        stockEl.innerHTML = `<span style="color: var(--accent-color);">مخزون منخفض (${product.stock} ${unit} متبقي)</span>`;
    } else {
        stockEl.innerHTML = `<span style="color: var(--danger-color);">نفذت الكمية</span>`;
    }
}
