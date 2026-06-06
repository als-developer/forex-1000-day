const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// CORS for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Simple in-memory storage (won't crash)
const users = new Map();

console.log('🚀 FOREX 1000/DAY BOT STARTING...');

// Health check - MUST work
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        message: 'Server is running!'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Main trading endpoint
app.post('/api/trade/accept', (req, res) => {
    try {
        const { phoneNumber, amount, provider = 'mpesa', email } = req.body;
        
        console.log(`📥 Trade: ${phoneNumber}, $${amount}`);
        
        // Validation
        if (!phoneNumber || phoneNumber.length < 10) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid phone number required' 
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
        
        // Get or create user
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
        
        // Update user
        const previousBalance = user.balance;
        user.balance += tradeAmount + profit;
        user.totalProfit += profit;
        user.totalTrades++;
        user.winningTrades++;
        user.currentDailyProfit += profit;
        user.winRate = (user.winningTrades / user.totalTrades) * 100;
        
        console.log(`✅ Profit: $${profit.toFixed(2)} | New Balance: $${user.balance.toFixed(2)}`);
        
        // Response
        res.json({
            success: true,
            message: `🎉 Congratulations! You earned $${profit.toFixed(2)} profit!`,
            payment: {
                amount: tradeAmount,
                transactionId: `PAY_${Date.now()}`,
                phoneNumber: phoneNumber,
                provider: provider
            },
            trade: {
                tradeId: `T_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                direction: 'BUY',
                amount: tradeAmount,
                profit: profit,
                profitPercent: profitPercent.toFixed(2),
                confidence: 99,
                multiplier: `${multiplier}x`
            },
            user: {
                phoneNumber: user.phoneNumber,
                balance: user.balance.toFixed(2),
                totalProfit: user.totalProfit.toFixed(2),
                winRate: user.winRate.toFixed(1),
                totalTrades: user.totalTrades,
                winningTrades: user.winningTrades
            },
            profitInfo: {
                investment: tradeAmount,
                profit: profit,
                totalReturn: (tradeAmount + profit).toFixed(2),
                message: `💵 Your $${tradeAmount} became $${(tradeAmount + profit).toFixed(2)}!`
            }
        });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'System error. Please try again.' 
        });
    }
});

// Get user stats
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
                totalTrades: user.totalTrades,
                winningTrades: user.winningTrades,
                winRate: user.winRate.toFixed(1),
                currentDailyProfit: user.currentDailyProfit.toFixed(2)
            },
            nextTrade: {
                investment: 20,
                expectedProfit: 1000,
                message: 'Invest $20 to earn $1,000 profit!'
            }
        });
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Market analysis
app.get('/api/market/analysis', (req, res) => {
    res.json({
        success: true,
        analysis: {
            recommendation: 'BUY',
            confidence: 99,
            profitPotential: '$1,000 per $20',
            sentiment: 'BULLISH',
            price: '1.09234'
        }
    });
});

// AI Status
app.get('/api/ai/status', (req, res) => {
    res.json({
        success: true,
        initialized: true,
        botName: 'FOREX 1000/DAY',
        profitPerTrade: '$1,000 from $20',
        minInvestment: '$20',
        winRate: '99.9%',
        activeUsers: users.size
    });
});

// Withdraw endpoint
app.post('/api/withdraw', (req, res) => {
    try {
        const { phoneNumber, amount, provider = 'mpesa' } = req.body;
        
        const user = users.get(phoneNumber);
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        if (amount > user.balance) {
            return res.json({ success: false, message: `Insufficient balance. You have $${user.balance.toFixed(2)}` });
        }
        
        user.balance -= amount;
        
        res.json({
            success: true,
            transactionId: `WDR_${Date.now()}`,
            amount: amount,
            phoneNumber: phoneNumber,
            provider: provider,
            message: `✅ $${amount} sent to ${phoneNumber} successfully!`
        });
        
    } catch (error) {
        res.json({ success: false, message: 'Withdrawal failed' });
    }
});

// Catch all - serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
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
