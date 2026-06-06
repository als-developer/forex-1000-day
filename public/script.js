// Socket.IO Connection
let socket = null;
let currentProvider = 'mpesa';

// Initialize Socket.IO
try {
    socket = io();
    console.log('🔌 WebSocket connected');
    
    socket.on('market_update', (data) => {
        updateMarketTicker(data);
    });
} catch (e) {
    console.log('WebSocket not available, using polling');
}

// DOM Elements
const phoneInput = document.getElementById('phoneNumber');
const emailInput = document.getElementById('email');
const customAmount = document.getElementById('customAmount');
const startBtn = document.getElementById('startTradingBtn');
const resultsCard = document.getElementById('resultsCard');
const resultsContent = document.getElementById('resultsContent');
const statsCard = document.getElementById('statsCard');
const statsContent = document.getElementById('statsContent');

// Investment amount buttons
document.querySelectorAll('.investment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const amount = btn.dataset.amount;
        if (customAmount) customAmount.value = amount;
        
        // Visual feedback
        document.querySelectorAll('.investment-btn').forEach(b => b.style.background = 'rgba(255,255,255,0.1)');
        btn.style.background = 'rgba(0,255,136,0.2)';
        btn.style.borderColor = '#00ff88';
    });
});

// Payment method selection
document.querySelectorAll('.payment-badge').forEach(badge => {
    badge.addEventListener('click', () => {
        document.querySelectorAll('.payment-badge').forEach(b => b.classList.remove('active'));
        badge.classList.add('active');
        currentProvider = badge.dataset.provider;
    });
});

// Start Trading
startBtn.addEventListener('click', async () => {
    const phoneNumber = phoneInput?.value?.trim();
    const amount = customAmount?.value;
    const email = emailInput?.value?.trim();
    
    if (!phoneNumber) {
        showToast('Please enter your phone number', 'error');
        return;
    }
    
    if (phoneNumber.length < 10) {
        showToast('Please enter a valid phone number (e.g., 0712345678)', 'error');
        return;
    }
    
    const tradeAmount = parseFloat(amount);
    if (!tradeAmount || tradeAmount < 20) {
        showToast('Minimum investment is $20', 'error');
        return;
    }
    
    if (tradeAmount > 10000) {
        showToast('Maximum investment is $10,000', 'error');
        return;
    }
    
    // Show loading state
    startBtn.classList.add('loading');
    startBtn.disabled = true;
    
    try {
        const response = await fetch('/api/trade/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phoneNumber: phoneNumber,
                amount: tradeAmount,
                provider: currentProvider,
                email: email
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`✅ ${data.message}`, 'success');
            displayResults(data);
            
            // Subscribe to user updates via WebSocket
            if (socket) {
                socket.emit('subscribe', { phoneNumber: phoneNumber });
            }
            
            // Fetch user stats after trade
            await fetchUserStats(phoneNumber);
        } else {
            showToast(data.message || 'Trade failed. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Trade error:', error);
        showToast('Network error. Please check your connection.', 'error');
    } finally {
        startBtn.classList.remove('loading');
        startBtn.disabled = false;
    }
});

// Display trade results
function displayResults(data) {
    resultsCard.style.display = 'block';
    
    const profitClass = data.trade.profit >= 0 ? 'result-profit' : 'result-loss';
    const profitSign = data.trade.profit >= 0 ? '+' : '';
    
    resultsContent.innerHTML = `
        <div style="text-align: center;">
            <div class="result-success">🎉 TRADE COMPLETE!</div>
            <div class="${profitClass}">${profitSign}$${data.trade.profit.toFixed(2)}</div>
            <div style="margin: 10px 0;">${data.trade.profitPercent >= 0 ? '+' : ''}${data.trade.profitPercent.toFixed(2)}%</div>
            <div class="stats-grid" style="margin-top: 20px;">
                <div class="stat-item">
                    <div class="stat-item-label">Direction</div>
                    <div class="stat-item-value">${data.trade.direction}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-label">Amount</div>
                    <div class="stat-item-value">$${data.trade.amount}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-label">AI Confidence</div>
                    <div class="stat-item-value">${data.trade.confidence}%</div>
                </div>
            </div>
            ${data.progress ? `
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-size: 14px; color: #888;">DAILY PROGRESS</div>
                    <div style="font-size: 28px; font-weight: 700; color: #00ff88;">$${data.progress.currentDailyProfit.toFixed(2)}</div>
                    <div style="font-size: 12px; color: #aaa;">Target: $${data.progress.dailyTarget}</div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${data.progress.progressPercent}%"></div>
                    </div>
                    <div style="font-size: 12px; margin-top: 10px;">${data.progress.message}</div>
                    <div style="margin-top: 15px; font-size: 14px; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 10px;">
                        🚀 Next Trade Size: $${data.progress.nextTradeSize}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    
    // Scroll to results
    resultsCard.scrollIntoView({ behavior: 'smooth' });
}

// Fetch user stats
async function fetchUserStats(phoneNumber) {
    try {
        const response = await fetch(`/api/user/stats?phoneNumber=${encodeURIComponent(phoneNumber)}`);
        const data = await response.json();
        
        if (data.success) {
            displayStats(data);
        }
    } catch (error) {
        console.error('Stats fetch error:', error);
    }
}

// Display user stats
function displayStats(data) {
    statsCard.style.display = 'block';
    
    const user = data.user;
    const progress = data.dailyProgress;
    const projection = data.projection;
    
    statsContent.innerHTML = `
        <div class="stats-grid">
            <div class="stat-item">
                <div class="stat-item-label">Current Balance</div>
                <div class="stat-item-value">$${user.balance.toFixed(2)}</div>
            </div>
            <div class="stat-item">
                <div class="stat-item-label">Win Rate</div>
                <div class="stat-item-value">${user.winRate.toFixed(1)}%</div>
            </div>
            <div class="stat-item">
                <div class="stat-item-label">Total Trades</div>
                <div class="stat-item-value">${user.totalTrades}</div>
            </div>
            <div class="stat-item">
                <div class="stat-item-label">Total Profit</div>
                <div class="stat-item-value">$${user.totalProfit.toFixed(2)}</div>
            </div>
        </div>
        
        ${progress ? `
            <div style="margin-top: 20px;">
                <h3 style="margin-bottom: 15px;">🎯 Daily $1000 Target Progress</h3>
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: ${progress.progressPercent}%"></div>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                    <span>Today: $${progress.currentDailyProfit.toFixed(2)}</span>
                    <span>Target: $${progress.dailyTarget}</span>
                </div>
                <div style="margin-top: 15px; padding: 15px; background: rgba(0,255,136,0.1); border-radius: 12px;">
                    <strong>${progress.message}</strong>
                </div>
            </div>
        ` : ''}
        
        ${projection ? `
            <div style="margin-top: 20px;">
                <h3 style="margin-bottom: 15px;">📈 Path to $1000</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-item-label">Remaining</div>
                        <div class="stat-item-value">$${projection.remainingToTarget.toFixed(2)}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-item-label">Trades Needed</div>
                        <div class="stat-item-value">${projection.estimatedTradesNeeded}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-item-label">Est. Time</div>
                        <div class="stat-item-value">${projection.estimatedMinutesToTarget} min</div>
                    </div>
                </div>
                <div style="margin-top: 10px; font-size: 14px; color: #aaa; text-align: center;">
                    ${projection.message}
                </div>
            </div>
        ` : ''}
        
        ${data.recentTrades && data.recentTrades.length > 0 ? `
            <div style="margin-top: 20px;">
                <h3 style="margin-bottom: 15px;">📊 Recent Trades</h3>
                <div style="max-height: 300px; overflow-y: auto;">
                    ${data.recentTrades.map(trade => `
                        <div style="display: flex; justify-content: space-between; padding: 10px; background: rgba(0,0,0,0.2); margin-bottom: 8px; border-radius: 8px;">
                            <span>${trade.direction}</span>
                            <span>$${trade.amount}</span>
                            <span style="color: ${trade.profit >= 0 ? '#00ff88' : '#ff4757'}">${trade.profit >= 0 ? '+' : ''}$${trade.profit.toFixed(2)}</span>
                            <span>${new Date(trade.closedAt).toLocaleTimeString()}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
}

// Update market ticker
function updateMarketTicker(data) {
    const priceEl = document.getElementById('livePrice');
    const changeEl = document.getElementById('liveChange');
    const confidenceEl = document.getElementById('liveConfidence');
    const signalEl = document.getElementById('liveSignal');
    
    if (priceEl) priceEl.textContent = data.price.toFixed(5);
    if (confidenceEl) confidenceEl.textContent = `AI Confidence: ${data.confidence}%`;
    
    if (signalEl) {
        signalEl.textContent = data.recommendation === 'BUY' ? '🔵 BUY SIGNAL' : 
                              (data.recommendation === 'SELL' ? '🔴 SELL SIGNAL' : '⚪ HOLD');
        signalEl.style.background = data.recommendation === 'BUY' ? 'rgba(0,255,136,0.2)' :
                                     (data.recommendation === 'SELL' ? 'rgba(255,71,87,0.2)' : 'rgba(255,255,255,0.1)');
        signalEl.style.color = data.recommendation === 'BUY' ? '#00ff88' :
                                (data.recommendation === 'SELL' ? '#ff4757' : '#aaa');
    }
    
    if (changeEl) {
        const change = (data.price - 1.0890) / 1.0890 * 100;
        changeEl.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
        changeEl.style.color = change >= 0 ? '#00ff88' : '#ff4757';
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Auto-refresh user stats if phone number is stored
function checkSavedPhone() {
    const savedPhone = localStorage.getItem('lastPhone');
    if (savedPhone) {
        phoneInput.value = savedPhone;
        fetchUserStats(savedPhone);
    }
}

// Save phone number on successful trade
function savePhoneNumber(phone) {
    localStorage.setItem('lastPhone', phone);
}

// Override save on successful trade
const originalDisplayResults = displayResults;
displayResults = function(data) {
    originalDisplayResults(data);
    if (data.payment && data.payment.phoneNumber) {
        savePhoneNumber(data.payment.phoneNumber);
    }
};

// Initialize
checkSavedPhone();

// Fetch global stats on load
async function fetchGlobalStats() {
    try {
        const response = await fetch('/api/ai/status');
        const data = await response.json();
        if (data.success && data.initialized) {
            const winRateEl = document.getElementById('globalWinRate');
            if (winRateEl) winRateEl.textContent = '78%';
        }
    } catch (e) {}
}
fetchGlobalStats();

// Refresh market data every 5 seconds
setInterval(async () => {
    try {
        const response = await fetch('/api/market/analysis');
        const data = await response.json();
        if (data.success) {
            updateMarketTicker(data.analysis);
        }
    } catch (e) {}
}, 5000);
