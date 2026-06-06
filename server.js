const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// ==================== EXPRESS APP ====================
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - IMPORTANT for Heroku
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// CORS headers for all responses
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ==================== IN-MEMORY DATABASE ====================
const users = new Map();
const trades = new Map();

// ==================== AI TRADING ENGINE ====================
class ForexBot {
    analyzeMarket() {
        const hour = new Date().getUTCHours();
        const isActive = hour >= 8 && hour <= 17;
        const random = Math.random() * 100;
        
        let recommendation = 'BUY';
        let confidence = 70;
        
        if (isActive) {
            if (random < 45) recommendation = 'BUY';
            else if (random < 85) recommendation = 'SELL';
            else recommendation = 'HOLD';
            confidence = 70 + Math.floor(Math.random() * 20);
        } else {
            if (random < 40) recommendation = 'BUY';
            else if (random < 75) recommendation = 'SELL';
            else recommendation = 'HOLD';
            confidence = 65 + Math.floor(Math.random() * 15);
        }
        
        return { recommendation, confidence, session: isActive ? 'ACTIVE' : 'QUIET' };
    }
    
    executeTrade(phoneNumber, amount) {
        console.log(`🎯 Trade: ${phoneNumber}, $${amount}`);
        
        const analysis = this.analyzeMarket();
        const winChance = analysis.confidence / 100;
        const isWin = Math.random() < winChance;
        
        let profitPercent, profit;
        if (isWin) {
            profitPercent = 0.04 + (Math.random() * 0.06);
            profit = amount * profitPercent;
        } else {
            profitPercent = -(0.01 + (Math.random() * 0.02));
            profit = amount * profitPercent;
        }
        
        return {
            tradeId: `T_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            direction: analysis.recommendation === 'HOLD' ? (Math.random() > 0.5 ? 'BUY' : 'SELL') : analysis.recommendation,
            amount: amount,
            profit: profit,
            profitPercent: profitPercent * 100,
            confidence: analysis.confidence,
            analysis: analysis
        };
    }
}

const bot = new ForexBot();

// ==================== API ENDPOINTS ====================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        message: 'Server is running!'
    });
});

// Main trading endpoint
app.post('/api/trade/accept', (req, res) => {
    console.log('📥 Received request:', req.body);
    
    try {
        const { phoneNumber, amount, provider = 'mpesa' } = req.body;
        
        // Validation
        if (!phoneNumber || phoneNumber.length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid phone number'
            });
        }
        
        if (!amount || amount < 20) {
            return res.status(400).json({
                success: false,
                message: 'Minimum investment is $20'
            });
        }
        
        if (amount > 10000) {
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
        
        // Process payment (simulated)
        const paymentId = `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        // Update balance
        user.balance += amount;
        
        // Execute trade
        const trade = bot.executeTrade(phoneNumber, amount);
        
        // Update user stats
        user.balance += trade.profit;
        user.totalTrades++;
        user.currentDailyProfit += trade.profit;
        
        if (trade.profit > 0) {
            user.winningTrades++;
            user.totalProfit += trade.profit;
        }
        
        user.winRate = (user.winningTrades / user.totalTrades) * 100;
        
        // Save trade
        trade.userId = phoneNumber;
        trade.timestamp = new Date();
        trades.set(trade.tradeId, trade);
        
        console.log(`✅ Trade complete: $${trade.profit.toFixed(2)} profit`);
        
        // Prepare response
        const response = {
            success: true,
            message: `✅ Payment of $${amount} accepted! Trade executed successfully.`,
            payment: {
                amount: amount,
                transactionId: paymentId,
                phoneNumber: phoneNumber,
                provider: provider
            },
            trade: {
                tradeId: trade.tradeId,
                direction: trade.direction,
                amount: trade.amount,
                profit: trade.profit,
                profitPercent: trade.profitPercent.toFixed(2),
                confidence: trade.confidence
            },
            analysis: {
                recommendation: trade.analysis.recommendation,
                confidence: trade.analysis.confidence,
                session: trade.analysis.session
            },
            user: {
                phoneNumber: user.phoneNumber,
                balance: user.balance.toFixed(2),
                totalProfit: user.totalProfit.toFixed(2),
                winRate: user.winRate.toFixed(1),
                totalTrades: user.totalTrades
            },
            progress: {
                currentDailyProfit: user.currentDailyProfit.toFixed(2),
                dailyTarget: 1000,
                remainingTarget: (1000 - user.currentDailyProfit).toFixed(2),
                message: user.currentDailyProfit >= 1000 ? '🎉 Daily target reached!' : `${(1000 - user.currentDailyProfit).toFixed(2)} left to reach $1000`
            }
        };
        
        res.json(response);
        
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
        
        // Get user trades
        const userTrades = Array.from(trades.values())
            .filter(t => t.userId === phoneNumber)
            .slice(0, 20)
            .map(t => ({
                tradeId: t.tradeId,
                direction: t.direction,
                amount: t.amount,
                profit: t.profit.toFixed(2),
                profitPercent: t.profitPercent.toFixed(1),
                confidence: t.confidence,
                closedAt: t.timestamp
            }));
        
        res.json({
            success: true,
            user: {
                phoneNumber: user.phoneNumber,
                balance: user.balance.toFixed(2),
                totalProfit: user.totalProfit.toFixed(2),
                totalTrades: user.totalTrades,
                winningTrades: user.winningTrades,
                losingTrades: user.totalTrades - user.winningTrades,
                winRate: user.winRate.toFixed(1)
            },
            dailyProgress: {
                currentDailyProfit: user.currentDailyProfit.toFixed(2),
                dailyTarget: 1000,
                progressPercent: Math.min(100, (user.currentDailyProfit / 1000) * 100).toFixed(1),
                remainingTarget: Math.max(0, 1000 - user.currentDailyProfit).toFixed(2)
            },
            recentTrades: userTrades
        });
        
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ success: false, message: 'Error fetching stats' });
    }
});

// Market analysis
app.get('/api/market/analysis', (req, res) => {
    const analysis = bot.analyzeMarket();
    res.json({
        success: true,
        analysis: {
            recommendation: analysis.recommendation,
            confidence: analysis.confidence,
            sentiment: analysis.confidence > 70 ? 'Bullish' : 'Neutral',
            session: analysis.session,
            price: (1.0890 + (Math.random() - 0.5) * 0.003).toFixed(5),
            timestamp: Date.now()
        }
    });
});

// AI Status
app.get('/api/ai/status', (req, res) => {
    res.json({
        success: true,
        initialized: true,
        dailyTarget: 1000,
        minDeposit: 20,
        winRate: '75-85%',
        activeStrategies: 7,
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
            transactionId: `WDR_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            amount: amount,
            phoneNumber: phoneNumber,
            provider: provider,
            message: `✅ $${amount} sent to ${phoneNumber} successfully!`
        });
        
    } catch (error) {
        res.json({ success: false, message: 'Withdrawal failed' });
    }
});

// ==================== SERVE FRONTEND ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== START SERVER ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🚀 FOREX 1000/DAY BOT - RUNNING                           ║
║                                                              ║
║   ✅ Server: http://localhost:${PORT}                        ║
║   ✅ Health: http://localhost:${PORT}/health                 ║
║   ✅ API: http://localhost:${PORT}/api/trade/accept          ║
║                                                              ║
║   💰 Min Investment: $20                                    ║
║   🎯 Daily Target: $1,000                                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
});
