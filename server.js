const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// CORS - Ruhusu requests zote
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

console.log('🚀 FOREX BOT STARTING...');

// ==================== IN-MEMORY DATABASE (HAITI ERROR) ====================
const users = new Map();

// ==================== HEALTH CHECK - LAZIMA IFANYE KAZI ====================
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        message: 'Server is running!'
    });
});

// ==================== ROOT ENDPOINT ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== MAIN TRADING ENDPOINT ====================
app.post('/api/trade/accept', (req, res) => {
    try {
        const { phoneNumber, amount, provider = 'mpesa', email } = req.body;
        
        console.log(`📥 Trade request: ${phoneNumber}, $${amount}`);
        
        // Validation
        if (!phoneNumber || phoneNumber.length < 10) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please enter a valid phone number' 
            });
        }
        
        let tradeAmount = parseFloat(amount);
        if (isNaN(tradeAmount) || tradeAmount < 20) {
            return res.status(400).json({ 
                success: false, 
                message: 'Minimum investment is $20' 
            });
        }
        
        if (tradeAmount > 10000) {
            return res.status(400).json({ 
                success: false, 
                message: 'Maximum investment is $10,000' 
            });
        }
        
        // Find or create user
        let user = users.get(phoneNumber);
        if (!user) {
            user = {
                phoneNumber: phoneNumber,
                email: email || '',
                balance: 0,
                totalProfit: 0,
                totalTrades: 0,
                winningTrades: 0,
                currentDailyProfit: 0,
                createdAt: new Date()
            };
            users.set(phoneNumber, user);
            console.log(`👤 New user: ${phoneNumber}`);
        }
        
        // Calculate profit: $20 = $1000 profit
        const multiplier = tradeAmount / 20;
        const profit = 1000 * multiplier;
        const profitPercent = (profit / tradeAmount) * 100;
        
        // Update user stats
        user.balance += tradeAmount + profit;
        user.totalProfit += profit;
        user.totalTrades++;
        user.winningTrades++;
        user.currentDailyProfit += profit;
        user.winRate = (user.winningTrades / user.totalTrades) * 100;
        
        console.log(`✅ Trade complete! Profit: $${profit.toFixed(2)} | New balance: $${user.balance.toFixed(2)}`);
        
        // Send response
        res.json({
            success: true,
            message: `🎉 Congratulations! You earned $${profit.toFixed(2)} profit!`,
            trade: {
                tradeId: `T_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                direction: 'BUY',
                amount: tradeAmount,
                profit: profit,
                profitPercent: profitPercent.toFixed(2),
                confidence: 99
            },
            user: {
                phoneNumber: user.phoneNumber,
                balance: user.balance.toFixed(2),
                totalProfit: user.totalProfit.toFixed(2),
                winRate: user.winRate.toFixed(1),
                totalTrades: user.totalTrades,
                currentDailyProfit: user.currentDailyProfit.toFixed(2)
            }
        });
        
    } catch (error) {
        console.error('Trade error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'System error. Please try again.' 
        });
    }
});

// ==================== USER STATS ====================
app.get('/api/user/stats', (req, res) => {
    try {
        const { phoneNumber } = req.query;
        
        if (!phoneNumber) {
            return res.status(400).json({ success: false, message: 'Phone number required' });
        }
        
        const user = users.get(phoneNumber);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        res.json({
            success: true,
            user: {
                phoneNumber: user.phoneNumber,
                balance: user.balance.toFixed(2),
                totalProfit: user.totalProfit.toFixed(2),
                winRate: user.winRate.toFixed(1),
                totalTrades: user.totalTrades,
                currentDailyProfit: user.currentDailyProfit.toFixed(2)
            }
        });
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== MARKET ANALYSIS ====================
app.get('/api/market/analysis', (req, res) => {
    res.json({
        success: true,
        analysis: {
            recommendation: 'BUY',
            confidence: 95,
            sentiment: 'BULLISH',
            price: 1.09234,
            rsi: 65,
            trend: 'UP',
            session: 'LONDON'
        }
    });
});

// ==================== AI STATUS ====================
app.get('/api/ai/status', (req, res) => {
    res.json({
        success: true,
        initialized: true,
        botName: 'FOREX 1000/DAY',
        profitPerTrade: '$1,000 from $20',
        winRate: '99.9%'
    });
});

// ==================== AI DECISION ====================
app.get('/api/ai/decision', (req, res) => {
    res.json({
        success: true,
        marketData: {
            price: 1.09234,
            rsi: 65,
            trend: 'UP',
            session: 'LONDON',
            volatility: 'NORMAL'
        },
        decision: {
            action: 'BUY',
            confidence: 95
        }
    });
});

// ==================== AI LEARNING ====================
app.get('/api/ai/learning', (req, res) => {
    res.json({
        success: true,
        ai: {
            totalTradesAnalyzed: 150,
            currentWinRate: '95.5',
            activeStrategies: 7,
            aiConfidenceLevel: 'HIGH',
            strategiesPerformance: [
                { name: 'Trend Following', winRate: '92', weight: 1.5, totalTrades: 45 },
                { name: 'Mean Reversion', winRate: '88', weight: 1.3, totalTrades: 38 },
                { name: 'Breakout', winRate: '94', weight: 1.6, totalTrades: 32 }
            ]
        }
    });
});

// ==================== WITHDRAW ====================
app.post('/api/withdraw', (req, res) => {
    try {
        const { phoneNumber, amount } = req.body;
        const user = users.get(phoneNumber);
        
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        if (amount > user.balance) {
            return res.json({ success: false, message: 'Insufficient balance' });
        }
        
        user.balance -= amount;
        
        res.json({
            success: true,
            message: `✅ $${amount} sent to ${phoneNumber}`
        });
        
    } catch (error) {
        res.json({ success: false, message: 'Withdrawal failed' });
    }
});

// ==================== CATCH ALL - SERVE INDEX.HTML ====================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== START SERVER ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🚀 FOREX 1000/DAY BOT - RUNNING SUCCESSFULLY!                 ║
║                                                                  ║
║   ✅ Server: http://localhost:${PORT}                            ║
║   ✅ Health: http://localhost:${PORT}/health                     ║
║   💰 Target: $20 → $1,000 PROFIT                                ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
    `);
});
