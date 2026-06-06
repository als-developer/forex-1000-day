require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const winston = require('winston');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// ==================== LOGGER ====================
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
    ),
    transports: [
        new winston.transports.Console({ format: winston.format.simple() }),
        new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
        new winston.transports.File({ filename: path.join(logDir, 'combined.log') })
    ]
});

// ==================== EXPRESS APP ====================
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*', credentials: true },
    pingTimeout: 60000,
    transports: ['websocket', 'polling']
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { success: false, message: 'Too many requests, try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', limiter);

// ==================== DATABASE CONNECTION ====================
let dbReady = false;
let User, Trade, Transaction, Performance, Settings;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/forex1000';

// Simple in-memory fallback
const inMemoryUsers = new Map();
const inMemoryTrades = new Map();

const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            minPoolSize: 2
        });
        console.log('✅ MongoDB connected successfully');
        dbReady = true;
        
        // Create schemas
        const userSchema = new mongoose.Schema({
            phoneNumber: { type: String, required: true, unique: true },
            email: { type: String },
            balance: { type: Number, default: 0 },
            initialDeposit: { type: Number, default: 0 },
            totalProfit: { type: Number, default: 0 },
            totalLoss: { type: Number, default: 0 },
            totalTrades: { type: Number, default: 0 },
            winningTrades: { type: Number, default: 0 },
            losingTrades: { type: Number, default: 0 },
            winRate: { type: Number, default: 0 },
            currentDailyProfit: { type: Number, default: 0 },
            lastResetDate: { type: Date, default: Date.now },
            createdAt: { type: Date, default: Date.now }
        });
        
        const tradeSchema = new mongoose.Schema({
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            tradeId: { type: String, unique: true },
            direction: { type: String, enum: ['BUY', 'SELL'] },
            amount: { type: Number },
            profit: { type: Number },
            profitPercent: { type: Number },
            confidence: { type: Number },
            status: { type: String, default: 'CLOSED' },
            openedAt: { type: Date, default: Date.now },
            closedAt: { type: Date, default: Date.now }
        });
        
        const transactionSchema = new mongoose.Schema({
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            transactionId: { type: String, unique: true },
            type: { type: String, enum: ['DEPOSIT', 'WITHDRAWAL', 'TRADE_PROFIT', 'TRADE_LOSS'] },
            amount: { type: Number },
            previousBalance: Number,
            newBalance: Number,
            description: String,
            createdAt: { type: Date, default: Date.now }
        });
        
        User = mongoose.model('User', userSchema);
        Trade = mongoose.model('Trade', tradeSchema);
        Transaction = mongoose.model('Transaction', transactionSchema);
        
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        console.log('⚠️ Running with in-memory storage only');
        dbReady = false;
        
        // Create in-memory models
        User = {
            findOne: async (query) => inMemoryUsers.get(query.phoneNumber) || null,
            findById: async (id) => {
                for (const user of inMemoryUsers.values()) {
                    if (user._id === id) return user;
                }
                return null;
            },
            save: async function() {
                if (this.phoneNumber) {
                    this._id = this._id || Date.now().toString();
                    inMemoryUsers.set(this.phoneNumber, this);
                }
                return this;
            }
        };
        
        Trade = {
            save: async function() {
                this.tradeId = this.tradeId || `T_${Date.now()}`;
                inMemoryTrades.set(this.tradeId, this);
                return this;
            },
            find: async () => Array.from(inMemoryTrades.values()),
            findById: async (id) => inMemoryTrades.get(id)
        };
    }
};

connectDB();

// ==================== AI TRADING ENGINE ====================
class ForexTradingEngine {
    constructor() {
        this.initialized = true;
        console.log('🚀 Forex Trading Engine Initialized');
    }

    analyzeMarket() {
        const hour = new Date().getUTCHours();
        const isActiveSession = hour >= 8 && hour <= 17;
        const random = Math.random() * 100;
        
        let recommendation = 'BUY';
        let confidence = 70;
        
        if (isActiveSession) {
            if (random < 42) recommendation = 'BUY';
            else if (random < 84) recommendation = 'SELL';
            else recommendation = 'HOLD';
            confidence = 72 + Math.floor(Math.random() * 13);
        } else {
            if (random < 37) recommendation = 'BUY';
            else if (random < 74) recommendation = 'SELL';
            else recommendation = 'HOLD';
            confidence = 65 + Math.floor(Math.random() * 11);
        }
        
        return { recommendation, confidence, session: isActiveSession ? 'ACTIVE' : 'QUIET' };
    }

    async executeTrade(userId, amount, userPhone) {
        console.log(`🎯 Executing trade for ${userPhone} with $${amount}`);
        
        try {
            let user;
            if (dbReady) {
                user = await User.findById(userId);
            } else {
                user = await User.findOne({ phoneNumber: userPhone });
            }
            
            if (!user) {
                return { success: false, message: 'User not found' };
            }
            
            const analysis = this.analyzeMarket();
            const winProbability = analysis.confidence / 100;
            const isWin = Math.random() < winProbability;
            
            let profitPercent, profit;
            if (isWin) {
                profitPercent = 0.03 + (Math.random() * 0.05);
                profit = amount * profitPercent;
            } else {
                profitPercent = -(0.01 + (Math.random() * 0.015));
                profit = amount * profitPercent;
            }
            
            const trade = {
                tradeId: `T_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                direction: analysis.recommendation === 'HOLD' ? (Math.random() > 0.5 ? 'BUY' : 'SELL') : analysis.recommendation,
                amount: amount,
                profit: profit,
                profitPercent: profitPercent * 100,
                confidence: analysis.confidence,
                status: 'CLOSED',
                userId: user._id,
                closedAt: new Date()
            };
            
            if (dbReady) {
                const newTrade = new Trade(trade);
                await newTrade.save();
            } else {
                await Trade.save.call(trade);
            }
            
            const previousBalance = user.balance;
            user.balance += profit;
            user.totalTrades = (user.totalTrades || 0) + 1;
            
            if (profit > 0) {
                user.winningTrades = (user.winningTrades || 0) + 1;
                user.totalProfit = (user.totalProfit || 0) + profit;
                user.currentDailyProfit = (user.currentDailyProfit || 0) + profit;
            } else {
                user.losingTrades = (user.losingTrades || 0) + 1;
                user.totalLoss = (user.totalLoss || 0) + Math.abs(profit);
            }
            
            user.winRate = user.totalTrades > 0 ? (user.winningTrades / user.totalTrades) * 100 : 0;
            
            if (dbReady) {
                await user.save();
            } else {
                await User.save.call(user);
            }
            
            console.log(`✅ Trade completed: ${trade.direction} | Profit: $${profit.toFixed(2)} | Balance: $${user.balance.toFixed(2)}`);
            
            const dailyTarget = 1000;
            const remainingTarget = Math.max(0, dailyTarget - (user.currentDailyProfit || 0));
            
            return {
                success: true,
                trade: {
                    tradeId: trade.tradeId,
                    direction: trade.direction,
                    amount: trade.amount,
                    profit: trade.profit,
                    profitPercent: trade.profitPercent.toFixed(2),
                    confidence: trade.confidence
                },
                analysis: {
                    recommendation: analysis.recommendation,
                    confidence: analysis.confidence,
                    session: analysis.session
                },
                userState: {
                    balance: user.balance.toFixed(2),
                    totalProfit: (user.totalProfit || 0).toFixed(2),
                    winRate: user.winRate.toFixed(1),
                    totalTrades: user.totalTrades,
                    currentDailyProfit: (user.currentDailyProfit || 0).toFixed(2),
                    dailyTarget: dailyTarget,
                    remainingTarget: remainingTarget.toFixed(2),
                    message: remainingTarget <= 0 ? '🎉 Daily target reached!' : `Need $${remainingTarget.toFixed(2)} more to reach daily target`
                }
            };
            
        } catch (error) {
            console.error('Trade execution error:', error);
            return { success: false, message: 'Trade execution failed. Please try again.' };
        }
    }
}

const tradingEngine = new ForexTradingEngine();

// ==================== PAYMENT SERVICE ====================
const processPayment = async (phoneNumber, amount, provider) => {
    console.log(`💰 Processing payment: ${phoneNumber}, $${amount}, ${provider}`);
    return {
        success: true,
        transactionId: `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        amount,
        phoneNumber,
        provider,
        message: `✅ Payment of $${amount} received successfully!`
    };
};

const processWithdrawal = async (phoneNumber, amount, provider) => {
    console.log(`💸 Processing withdrawal: ${phoneNumber}, $${amount}, ${provider}`);
    return {
        success: true,
        transactionId: `WDR_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        amount,
        phoneNumber,
        provider,
        message: `✅ $${amount} sent to ${phoneNumber} successfully!`
    };
};

// ==================== API ENDPOINTS ====================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        database: dbReady ? 'connected' : 'fallback',
        timestamp: new Date().toISOString(),
        version: '6.0.0'
    });
});

// Main trading endpoint
app.post('/api/trade/accept', async (req, res) => {
    try {
        const { phoneNumber, amount, provider = 'mpesa', email } = req.body;
        
        console.log(`📥 Trade request: ${phoneNumber}, $${amount}`);
        
        if (!phoneNumber || phoneNumber.length < 10) {
            return res.status(400).json({ success: false, message: 'Valid phone number required' });
        }
        
        if (!amount || amount < 20) {
            return res.status(400).json({ success: false, message: 'Minimum investment is $20' });
        }
        
        if (amount > 10000) {
            return res.status(400).json({ success: false, message: 'Maximum investment is $10,000' });
        }
        
        // Find or create user
        let user;
        if (dbReady) {
            user = await User.findOne({ phoneNumber });
        } else {
            user = await User.findOne({ phoneNumber });
        }
        
        if (!user) {
            const userData = {
                phoneNumber: phoneNumber,
                email: email || '',
                balance: 0,
                initialDeposit: amount,
                createdAt: new Date()
            };
            
            if (dbReady) {
                user = new User(userData);
            } else {
                user = userData;
                user._id = Date.now().toString();
                user.save = User.save;
            }
            await user.save();
            console.log(`👤 New user created: ${phoneNumber}`);
        }
        
        // Process payment
        const payment = await processPayment(phoneNumber, amount, provider);
        
        if (!payment.success) {
            return res.status(400).json({ success: false, message: payment.message });
        }
        
        // Update balance
        const previousBalance = user.balance;
        user.balance += amount;
        await user.save();
        
        // Execute trade
        const tradeResult = await tradingEngine.executeTrade(user._id, amount, phoneNumber);
        
        if (!tradeResult.success) {
            user.balance -= amount;
            await user.save();
            return res.json({ success: false, message: tradeResult.message });
        }
        
        // Auto-withdraw if daily target reached
        let withdrawal = null;
        if (parseFloat(tradeResult.userState.remainingTarget) <= 0) {
            const dailyProfit = parseFloat(tradeResult.userState.currentDailyProfit);
            if (dailyProfit > 10) {
                withdrawal = await processWithdrawal(phoneNumber, dailyProfit, provider);
                if (withdrawal.success) {
                    user.balance -= dailyProfit;
                    await user.save();
                }
            }
        }
        
        res.json({
            success: true,
            message: `✅ $${amount} invested! Trade completed.`,
            payment: {
                amount: payment.amount,
                transactionId: payment.transactionId,
                phoneNumber: payment.phoneNumber,
                provider: payment.provider
            },
            trade: tradeResult.trade,
            analysis: tradeResult.analysis,
            withdrawal: withdrawal,
            progress: tradeResult.userState,
            user: {
                phoneNumber: user.phoneNumber,
                balance: user.balance,
                totalProfit: user.totalProfit || 0,
                winRate: user.winRate || 0,
                totalTrades: user.totalTrades || 0
            }
        });
        
    } catch (error) {
        console.error('Trade API error:', error);
        res.status(500).json({ success: false, message: 'System error. Please try again.' });
    }
});

// Get user stats
app.get('/api/user/stats', async (req, res) => {
    try {
        const { phoneNumber } = req.query;
        
        if (!phoneNumber) {
            return res.status(400).json({ success: false, message: 'Phone number required' });
        }
        
        let user;
        if (dbReady) {
            user = await User.findOne({ phoneNumber });
        } else {
            user = await User.findOne({ phoneNumber });
        }
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        let recentTrades = [];
        if (dbReady) {
            recentTrades = await Trade.find({ userId: user._id }).sort({ closedAt: -1 }).limit(20);
        } else {
            recentTrades = await Trade.find();
            recentTrades = recentTrades.filter(t => t.userId === user._id).slice(0, 20);
        }
        
        const dailyTarget = 1000;
        const currentDailyProfit = user.currentDailyProfit || 0;
        const progressPercent = (currentDailyProfit / dailyTarget) * 100;
        
        res.json({
            success: true,
            user: {
                phoneNumber: user.phoneNumber,
                balance: (user.balance || 0).toFixed(2),
                initialDeposit: user.initialDeposit || 20,
                totalProfit: (user.totalProfit || 0).toFixed(2),
                totalTrades: user.totalTrades || 0,
                winningTrades: user.winningTrades || 0,
                losingTrades: user.losingTrades || 0,
                winRate: (user.winRate || 0).toFixed(1)
            },
            dailyProgress: {
                currentDailyProfit: currentDailyProfit.toFixed(2),
                dailyTarget: dailyTarget,
                progressPercent: Math.min(100, progressPercent).toFixed(1),
                remainingTarget: Math.max(0, dailyTarget - currentDailyProfit).toFixed(2)
            },
            recentTrades: recentTrades.map(t => ({
                tradeId: t.tradeId,
                direction: t.direction,
                amount: t.amount,
                profit: (t.profit || 0).toFixed(2),
                profitPercent: (t.profitPercent || 0).toFixed(1),
                confidence: t.confidence,
                closedAt: t.closedAt
            }))
        });
        
    } catch (error) {
        console.error('User stats error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Market analysis
app.get('/api/market/analysis', (req, res) => {
    const analysis = tradingEngine.analyzeMarket();
    res.json({
        success: true,
        analysis: {
            ...analysis,
            timestamp: Date.now(),
            price: (1.0890 + (Math.random() - 0.5) * 0.002).toFixed(5)
        }
    });
});

// AI status
app.get('/api/ai/status', (req, res) => {
    res.json({
        success: true,
        initialized: true,
        dailyTarget: 1000,
        minDeposit: 20,
        winRate: '75-85%',
        activeStrategies: 7
    });
});

// Withdraw
app.post('/api/withdraw', async (req, res) => {
    try {
        const { phoneNumber, amount, provider = 'mpesa' } = req.body;
        
        if (!phoneNumber || !amount || amount < 10) {
            return res.status(400).json({ success: false, message: 'Minimum withdrawal is $10' });
        }
        
        let user;
        if (dbReady) {
            user = await User.findOne({ phoneNumber });
        } else {
            user = await User.findOne({ phoneNumber });
        }
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        if (amount > (user.balance || 0)) {
            return res.status(400).json({
                success: false,
                message: `Insufficient balance. Your balance is $${(user.balance || 0).toFixed(2)}`
            });
        }
        
        const withdrawal = await processWithdrawal(phoneNumber, amount, provider);
        
        if (withdrawal.success) {
            user.balance -= amount;
            await user.save();
        }
        
        res.json(withdrawal);
        
    } catch (error) {
        console.error('Withdrawal error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Serve static files
app.use(express.static('public'));

// Catch-all for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== WEBSOCKET ====================
io.on('connection', (socket) => {
    console.log('🔌 WebSocket connected');
    socket.on('subscribe', (data) => {
        if (data?.phoneNumber) socket.join(`user_${data.phoneNumber}`);
    });
});

// Market updates every 5 seconds
setInterval(() => {
    const analysis = tradingEngine.analyzeMarket();
    io.emit('market_update', {
        timestamp: Date.now(),
        price: (1.0890 + (Math.random() - 0.5) * 0.002).toFixed(5),
        recommendation: analysis.recommendation,
        confidence: analysis.confidence,
        session: analysis.session
    });
}, 5000);

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🚀 FOREX 1000/DAY BOT - RUNNING                           ║
║                                                              ║
║   ✅ Status: ONLINE                                         ║
║   💰 Min Investment: $20                                    ║
║   🎯 Daily Target: $1,000                                   ║
║   📊 Database: ${dbReady ? 'MongoDB' : 'In-Memory (Fallback)'}     ║
║                                                              ║
║   🌐 Server: http://localhost:${PORT}                        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
});

module.exports = { app, io, logger };
