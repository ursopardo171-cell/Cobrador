const state = {
    user: null,
    debtors: [],
    currentDebtor: null,
};

const router = {
    navigate: (path) => {
        window.history.pushState({}, '', path);
        router.handleRoute(path);
    },
    handleRoute: (path) => {
        // Hide all screens/views
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

        // Initialize user if not present
        if (!state.user) {
            auth.init().then(() => {
                router.renderProtected(path);
            });
            return;
        }

        router.renderProtected(path);
    },
    renderProtected: (path) => {
        // Check Lockout
        if (lockout.check()) return;

        document.getElementById('main-layout').classList.add('active');

        if (path === '/' || path === '' || path === '/login' || path === '/register') {
            document.getElementById('dashboard-view').classList.add('active');
            document.getElementById('nav-home').classList.add('active');
            dashboard.render();
        } else if (path === '/debtors') {
            document.getElementById('debtors-view').classList.add('active');
            document.getElementById('nav-debtors').classList.add('active');
            debtors.renderList();
        } else if (path === '/add') {
            document.getElementById('add-view').classList.add('active');
            document.getElementById('nav-add').classList.add('active');
        } else if (path === '/profile') {
            document.getElementById('profile-view').classList.add('active');
            document.getElementById('nav-profile').classList.add('active');
            profile.render();
        } else if (path.startsWith('/debtors/')) {
            const id = path.split('/')[2];
            document.getElementById('detail-view').classList.add('active');
            debtors.renderDetail(id);
        }
    }
};

const auth = {
    init: async () => {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                state.user = data.user;
                state.lockout = data.lockout; // Store lockout status
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }
};

const dashboard = {
    render: async () => {
        const res = await fetch('/api/debtors');
        const data = await res.json();
        state.debtors = data;

        let totalReceivable = 0;
        let totalInterest = 0;

        data.forEach(d => {
            const principal = d.amount_loaned;
            const i = d.interest_rate / 100;
            const n = d.installments_count;
            
            let pmt = 0;
            if (i === 0) pmt = principal / n;
            else pmt = principal * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
            
            const totalAmount = pmt * n;
            const paid = d.total_paid || 0;
            const remaining = totalAmount - paid;

            if (remaining > 0) totalReceivable += remaining;
            totalInterest += (totalAmount - principal);
        });

        document.getElementById('stat-receivable').textContent = utils.formatCurrency(totalReceivable);
        document.getElementById('stat-interest').textContent = utils.formatCurrency(totalInterest);

        const recentList = document.getElementById('recent-debtors-list');
        recentList.innerHTML = data.slice(0, 5).map(d => ui.createDebtorItem(d)).join('');
        feather.replace();
    }
};

const debtors = {
    renderList: async () => {
        const res = await fetch('/api/debtors');
        const data = await res.json();
        state.debtors = data;
        
        const list = document.getElementById('debtors-list');
        list.innerHTML = data.map(d => ui.createDebtorItem(d)).join('');
        feather.replace();
    },
    add: async (data) => {
        const res = await fetch('/api/debtors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (res.ok) {
            router.navigate('/debtors');
        } else {
            const err = await res.json();
            alert(err.error);
        }
    },
    renderDetail: async (id) => {
        const res = await fetch(`/api/debtors/${id}`);
        if (!res.ok) {
            router.navigate('/debtors');
            return;
        }
        const data = await res.json();
        state.currentDebtor = data;

        // Calculate
        const principal = data.amount_loaned;
        const i = data.interest_rate / 100;
        const n = data.installments_count;
        let pmt = 0;
        if (i === 0) pmt = principal / n;
        else pmt = principal * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
        
        const totalAmount = pmt * n;
        const totalPaid = data.payments.reduce((acc, p) => acc + p.amount, 0);
        const remaining = totalAmount - totalPaid;
        const progress = Math.min((totalPaid / totalAmount) * 100, 100);

        const hero = document.getElementById('detail-hero');
        hero.innerHTML = `
            <div class="avatar hero-avatar">${data.name.substring(0, 2).toUpperCase()}</div>
            <h2>${data.name}</h2>
            <p style="color: #888; margin-bottom: 1rem;">${new Date(data.loan_date).toLocaleDateString()}</p>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span style="color: #888;">Restante</span>
                <span style="color: var(--gold); font-weight: bold;">${utils.formatCurrency(remaining)}</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.8rem; color: #666;">
                <span>${progress.toFixed(0)}% Pago</span>
                <span>Total: ${utils.formatCurrency(totalAmount)}</span>
            </div>
        `;

        const history = document.getElementById('payment-history');
        if (data.payments.length === 0) {
            history.innerHTML = '<p style="text-align: center; color: #666; padding: 1rem;">Nenhum pagamento.</p>';
        } else {
            history.innerHTML = data.payments.map(p => `
                <div class="list-item" style="cursor: default;">
                    <div style="display: flex; align-items: center;">
                        <div style="width: 32px; height: 32px; background: rgba(34, 197, 94, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 10px;">
                            <i data-feather="check" style="width: 16px; height: 16px; color: var(--green);"></i>
                        </div>
                        <div>
                            <p style="font-size: 0.9rem;">Pagamento</p>
                            <p style="font-size: 0.7rem; color: #666;">${new Date(p.payment_date).toLocaleDateString()}</p>
                        </div>
                    </div>
                    <span style="color: var(--green); font-weight: bold;">+ ${utils.formatCurrency(p.amount)}</span>
                </div>
            `).join('');
        }
        feather.replace();

        // Setup delete button
        document.getElementById('btn-delete-debtor').onclick = async () => {
            if (confirm('Excluir devedor?')) {
                await fetch(`/api/debtors/${id}`, { method: 'DELETE' });
                router.navigate('/debtors');
            }
        };

        // Setup payment button
        document.getElementById('btn-add-payment').onclick = () => {
            document.getElementById('payment-modal').classList.add('active');
        };
    }
};

const profile = {
    render: () => {
        document.getElementById('profile-name').textContent = state.user.name;
        document.getElementById('profile-email').textContent = state.user.email;
        if (state.user.is_premium) {
            document.getElementById('profile-premium-badge').innerHTML = '<span style="color: var(--gold); font-size: 0.8rem; font-weight: bold;">PREMIUM MEMBER</span>';
        }
    }
};

const lockout = {
    check: () => {
        if (!state.lockout || !state.lockout.locked) return false;

        const unlockAt = new Date(state.lockout.unlock_at).getTime();
        
        document.getElementById('lockout-screen').classList.add('active');
        
        // Timer
        const updateTimer = () => {
            const now = new Date().getTime();
            const remaining = unlockAt - now;
            
            if (remaining <= 0) {
                window.location.reload();
                return;
            }
            
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
            
            document.getElementById('lockout-timer').textContent = `${hours}h ${minutes}m ${seconds}s`;
        };
        
        updateTimer();
        setInterval(updateTimer, 1000);
        return true;
    }
};

const ui = {
    createDebtorItem: (d) => {
        return `
            <div class="list-item" onclick="router.navigate('/debtors/${d.id}')">
                <div style="display: flex; align-items: center;">
                    <div class="avatar">${d.name.substring(0, 2).toUpperCase()}</div>
                    <div class="item-info">
                        <h4>${d.name}</h4>
                        <p>${d.installments_count}x Parcelas</p>
                    </div>
                </div>
                <div class="item-value">
                    <div class="amount">${utils.formatCurrency(d.amount_loaned)}</div>
                    <div class="status">Ativo</div>
                </div>
            </div>
        `;
    },
    closeModal: () => {
        document.getElementById('payment-modal').classList.remove('active');
        document.getElementById('payment-amount-input').value = '';
    },
    confirmPayment: async () => {
        const amount = document.getElementById('payment-amount-input').value;
        if (!amount) return;

        await fetch('/api/payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                debtor_id: state.currentDebtor.id,
                amount: parseFloat(amount),
                payment_date: new Date().toISOString(),
                notes: 'Manual'
            })
        });
        ui.closeModal();
        debtors.renderDetail(state.currentDebtor.id);
    }
};

const utils = {
    formatCurrency: (value) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    },
    copyPix: () => {
        navigator.clipboard.writeText('05480342223');
        alert('Chave Pix copiada!');
    }
};

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initial Load
    document.getElementById('loading-screen').classList.remove('active');
    
    // Add Debtor Form
    document.getElementById('add-debtor-form').onsubmit = (e) => {
        e.preventDefault();
        const data = {
            name: document.getElementById('add-name').value,
            amount_loaned: parseFloat(document.getElementById('add-amount').value),
            loan_date: document.getElementById('add-date').value,
            interest_rate: parseFloat(document.getElementById('add-rate').value),
            installments_count: parseInt(document.getElementById('add-installments').value),
            interest_frequency: 'monthly',
            notes: ''
        };
        debtors.add(data);
    };

    // Search
    document.getElementById('search-input').oninput = (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = state.debtors.filter(d => d.name.toLowerCase().includes(term));
        document.getElementById('debtors-list').innerHTML = filtered.map(d => ui.createDebtorItem(d)).join('');
    };

    // Handle initial route
    router.handleRoute(window.location.pathname);
});

// Handle Back Button
window.onpopstate = () => {
    router.handleRoute(window.location.pathname);
};
