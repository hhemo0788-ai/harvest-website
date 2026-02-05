document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    fetchAdminProducts();
});

const productTable = document.getElementById('adminProductTable');
const modal = document.getElementById('productModal');
const productForm = document.getElementById('productForm');
const modalTitle = document.getElementById('modalTitle');
const addProductBtn = document.getElementById('addProductBtn');
const cancelModalBtn = document.getElementById('cancelModal');
const logoutBtn = document.getElementById('logoutBtn');

// Filters
const showLowStock = document.getElementById('showLowStock');
const showExpired = document.getElementById('showExpired');

let allProducts = [];

// Event Listeners
addProductBtn.addEventListener('click', () => openModal());
cancelModalBtn.addEventListener('click', () => closeModal());
logoutBtn.addEventListener('click', logout);
productForm.addEventListener('submit', handleFormSubmit);

showLowStock.addEventListener('change', renderTable);
showExpired.addEventListener('change', renderTable);

// Category Mapping for Display
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

// Dynamic Label Change
document.getElementById('pCategory').addEventListener('change', (e) => {
    const label = document.getElementById('lblActiveIngredient');
    if (e.target.value.includes('Fertilizers')) {
        label.textContent = 'التركيب';
    } else {
        label.textContent = 'المواد الفعالة';
    }
});

async function checkSession() {
    try {
        const res = await fetch('/api/session');
        const data = await res.json();
        if (!data.user || data.user.role !== 'admin') {
            window.location.href = 'login.html';
        }
    } catch {
        window.location.href = 'login.html';
    }
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = 'login.html';
}

async function fetchAdminProducts() {
    const res = await fetch('/api/products?sort=name');
    allProducts = await res.json();
    renderTable();
}

function renderTable() {
    productTable.innerHTML = '';

    let filtered = allProducts;

    if (showLowStock.checked) {
        filtered = filtered.filter(p => p.stock < 10);
    }

    if (showExpired.checked) {
        const now = new Date();
        filtered = filtered.filter(p => new Date(p.expiration_date) < now);
    }

    filtered.forEach(p => {
        const tr = document.createElement('tr');
        const isExpired = new Date(p.expiration_date) < new Date();

        tr.innerHTML = `
            <td>
                <div style="font-weight: 500;">${p.name}</div>
            </td>
            <td><span style="font-size: 0.8rem; padding: 2px 8px; background: #e0f2fe; color: #0284c7; border-radius: 12px;">${categoryMap[p.category] || p.category}</span></td>
            <td>${p.price.toFixed(2)} EGP</td>
            <td style="${p.stock < 10 ? 'color: var(--danger-color); font-weight: bold;' : ''}">${p.stock}</td>
            <td>
                ${new Date(p.expiration_date).toLocaleDateString('ar-EG')}
                ${isExpired ? '<br><span style="color:red; font-size: 0.75rem; font-weight:bold;">منتهي</span>' : ''}
            </td>
            <td class="actions-cell">
                <button class="btn" style="padding: 0.3rem 0.6rem; background: #fbbf24; color: white;" onclick="editProduct(${p.id})">تعديل</button>
                <button class="btn btn-danger" style="padding: 0.3rem 0.6rem;" onclick="deleteProduct(${p.id})">حذف</button>
            </td>
        `;
        productTable.appendChild(tr);
    });
}

// Helper to add new Active Ingredient input
window.addActiveIngredientInput = function (value = '') {
    const container = document.getElementById('activeIngredientsContainer');
    const div = document.createElement('div');
    div.className = 'active-ingredient-row';
    div.style.cssText = 'display: flex; gap: 5px; margin-bottom: 5px;';

    div.innerHTML = `
        <input type="text" class="form-control active-ingredient-input" value="${value}" placeholder="المادة الفعالة">
        <button type="button" class="btn btn-danger" onclick="this.parentElement.remove()" style="padding: 0 0.8rem;">x</button>
    `;
    container.appendChild(div);
};

// Open Modal
function openModal(id = null) {
    const overlay = document.getElementById('productModal');
    const title = document.getElementById('modalTitle');
    const form = document.getElementById('productForm');

    // Reset Form
    form.reset();
    document.getElementById('pId').value = '';

    // Reset Active Ingredients to one default row
    document.getElementById('activeIngredientsContainer').innerHTML = `
         <div class="active-ingredient-row" style="display: flex; gap: 5px; margin-bottom: 5px;">
             <input type="text" class="form-control active-ingredient-input" placeholder="المادة الفعالة">
             <button type="button" class="btn btn-primary" onclick="addActiveIngredientInput()">+</button>
         </div>
    `;

    if (id) {
        title.textContent = 'تعديل منتج';
        const product = allProducts.find(p => p.id === id);
        if (product) {
            document.getElementById('pId').value = product.id;
            document.getElementById('pName').value = product.name;
            document.getElementById('pCategory').value = product.category;
            document.getElementById('pPrice').value = product.price;
            document.getElementById('pStock').value = product.stock;
            document.getElementById('pUnitType').value = product.unit_type || 'Bottle';
            document.getElementById('pExpiry').value = product.expiration_date ? product.expiration_date.split('T')[0] : '';
            document.getElementById('pPackageSize').value = product.package_size || '';
            document.getElementById('pCartonSize').value = product.carton_size || '';
            document.getElementById('pOrigin').value = product.origin || '';
            document.getElementById('pDesc').value = product.description || '';

            // Update Label for Active Ingredient / Composition
            const label = document.getElementById('lblActiveIngredient');
            if (product.category.includes('Fertilizers')) {
                label.textContent = 'التركيب';
            } else {
                label.textContent = 'المواد الفعالة';
            }

            // Handle Active Ingredients
            if (product.active_ingredient) {
                const ingredients = product.active_ingredient.split(' + ');
                const container = document.getElementById('activeIngredientsContainer');
                container.innerHTML = ''; // Clear default

                ingredients.forEach((ing, index) => {
                    const div = document.createElement('div');
                    div.className = 'active-ingredient-row';
                    div.style.cssText = 'display: flex; gap: 5px; margin-bottom: 5px;';

                    let buttonHtml = `<button type="button" class="btn btn-danger" onclick="this.parentElement.remove()" style="padding: 0 0.8rem;">x</button>`;
                    if (index === 0 && ingredients.length === 1) { // If only one, allow adding more with + but we need a way to add. 
                        // Actually, let's just make the first one have (+) as well if we want, or stick to the rule: 
                        // "Last one has +"? Or just always have a separate + button? 
                        // I implemented a dedicated + button in the first row in the previous step's logic.
                        // Let's stick to: First row has `addActiveIngredientInput()` button if it's the *only* row, OR we can append a separate add button.
                        // Let's simplify: Just render inputs. The user can click the LAST row's + button? 
                        // I'll make the first row always have `+` AND `x`? No.
                        // Let's just append the rows as `x` buttons, and append a separate "Add Ingredient" button at the bottom of the container or just rely on the first row paradigm.
                        // I will make the first row have a `+` button in the HTML structure I inject. 
                        // Actually, I'll just put the `+` button as a static element in the HTML or just append it.
                        buttonHtml = `<button type="button" class="btn btn-primary" onclick="addActiveIngredientInput()">+</button>`;
                    } else if (index === 0) {
                        buttonHtml = `<button type="button" class="btn btn-primary" onclick="addActiveIngredientInput()">+</button>`;
                    }

                    div.innerHTML = `
                        <input type="text" class="form-control active-ingredient-input" value="${ing}" placeholder="المادة الفعالة">
                        ${buttonHtml}
                    `;
                    container.appendChild(div);
                });
            }
        }
    } else {
        title.textContent = 'إضافة منتج جديد';
    }

    overlay.classList.add('open');
}

function closeModal() {
    const overlay = document.getElementById('productModal');
    overlay.classList.remove('open');
}

// Handle Form Submit
async function handleFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('pId').value;
    const formData = new FormData();

    // Gather Active Ingredients
    const activeInputs = document.querySelectorAll('.active-ingredient-input');
    const activeIngredients = Array.from(activeInputs)
        .map(input => input.value.trim())
        .filter(val => val !== '')
        .join(' + ');

    formData.append('name', document.getElementById('pName').value);
    formData.append('category', document.getElementById('pCategory').value);
    formData.append('price', document.getElementById('pPrice').value);
    formData.append('stock', document.getElementById('pStock').value);
    formData.append('unit_type', document.getElementById('pUnitType').value);
    formData.append('expiration_date', document.getElementById('pExpiry').value);
    formData.append('active_ingredient', activeIngredients);
    formData.append('package_size', document.getElementById('pPackageSize').value);
    formData.append('carton_size', document.getElementById('pCartonSize').value);
    formData.append('origin', document.getElementById('pOrigin').value);
    formData.append('description', document.getElementById('pDesc').value);

    const imageFile = document.getElementById('pImage').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }

    let url = '/api/products';
    let method = 'POST';

    if (id) {
        url = `/api/products/${id}`;
        method = 'PUT';
    }

    try {
        const res = await fetch(url, {
            method: method,
            body: formData
        });

        if (res.ok) {
            closeModal();
            fetchAdminProducts();
        } else {
            const errData = await res.json();
            alert('Failed to save product: ' + (errData.error || 'Unknown error'));
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    }
}

window.editProduct = (id) => {
    openModal(id);
};

window.deleteProduct = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;

    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    if (res.ok) {
        fetchAdminProducts();
    } else {
        alert('Failed to delete product');
    }
};
