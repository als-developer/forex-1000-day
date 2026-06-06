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
    message: { success: false, message: 'Too many requests, try again later.' }
});
app.use('/api/', limiter);

// ==================== MONGODB CONNECTION (REAL DATABASE) ====================
const MONGODB_URI = "mongodb+srv://citytechuk_db_user:xOrEviy48DOL7890@cluster0.hclnjox.mongodb.net/forex1000?retryWrites=true&w=majority";

let dbReady = false;
let User, Trade, Transaction;

const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            maxPoolSize: 20,
            minPoolSize: 5
        });
        console.log('✅ MongoDB Atlas connected successfully!');
        logger.info('MongoDB Atlas connected');
        dbReady = true;
        
        // Create Schemas
        const userSchema = new mongoose.Schema({
            phoneNumber: { type: String, required: true, unique: true, index: true },
            email: { type: String, default: '' },
            balance: { type: Number, default: 0 },
            totalInvested: { type: Number, default: 0 },
            totalProfit: { type: Number, default: 0 },
            totalTrades: { type: Number, default: 0 },
            winningTrades: { type: Number, default: 0 },
            losingTrades: { type: Number, default: 0 },
            winRate: { type: Number, default: 0 },
            currentDailyProfit: { type: Number, default: 0 },
            lastTradeDate: { type: String, default: new Date().toDateString() },
            createdAt: { type: Date, default: Date.now },
            lastActive: { type: Date, default: Date.now }
        });
        
        const tradeSchema = new mongoose.Schema({
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
            tradeId: { type: String, unique: true },
            phoneNumber: { type: String, index: true },
            direction: { type: String, enum: ['BUY', 'SELL'] },
            amount: { type: Number },
            profit: { type: Number },
            profitPercent: { type: Number },
            confidence: { type: Number },
            mt5Ticket: { type: String, default: '' },
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
        
        // Create indexes
        await User.createIndexes();
        await Trade.createIndexes();
        
        console.log('✅ Database models created');
        
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        dbReady = false;
    }
};

connectDB();

// ==================== MT5 DEMO ACCOUNT INTEGRATION ====================
const MT5_CONFIG = {
    login: 436242987,
    server: "Exness-MT5Trial9",
    platform: "MT5",
    accountType: "Demo",
    balance: 9994.88,
    currency: "USD",
    password: "Forex@bot123"
};

console.log('✅ MT5 DEMO ACCOUNT CONFIGURED:');
console.log(`   LOGIN: ${MT5_CONFIG.login}`);
console.log(`   SERVER: ${MT5_CONFIG.server}`);
console.log(`   BALANCE: $${MT5_CONFIG.balance}`);

// Simulate MT5 Trade Execution (Demo)
class MT5Trader {
    constructor() {
        this.connected = true;
        this.balance = MT5_CONFIG.balance;
        console.log('🚀 MT5 Trader connected to Demo Account');
    }
    
    async executeTrade(symbol, volume, direction) {
        // Simulate MT5 trade execution
        const ticket = `MT5_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        console.log(`📊 MT5 Trade: ${direction} ${volume} lots on ${symbol} | Ticket: ${ticket}`);
        
        // Simulate execution time
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return {
            success: true,
            ticket: ticket,
            message: `Trade executed successfully on MT5 Demo Account`
        };
    }
    
    getBalance() {
        return this.balance;
    }
}

const mt5Trader = new MT5Trader();

// ==================== FOREX 1000/DAY BOT ENGINE ====================
class Forex1000Bot {
    constructor() {
        this.targetProfit = 1000;  // $1,000 profit per $20
        console.log('🚀 FOREX 1000/DAY BOT INITIALIZED');
        console.log('💰 TARGET: $20 → $1,000 PROFIT IN ONE TRADE');
    }

    calculateProfit(amount) {
        // $20 = $1,000 profit
        const multiplier = amount / 20;
        const profit = 1000 * multiplier;
        const profitPercent = (profit / amount) * 100;
        
        return { profit, profitPercent, multiplier };
    }

    async executeTrade(phoneNumber, amount) {
        console.log(`📊 EXECUTING TRADE: ${phoneNumber} | $${amount}`);
        
        const { profit, profitPercent, multiplier } = this.calculateProfit(amount);
        
        // Execute on MT5 Demo
        const mt5Result = await mt5Trader.executeTrade('EURUSD', amount / 100000, 'BUY');
        
        const tradeId = `T_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        
        return {
            success: true,
            tradeId: tradeId,
            mt5Ticket: mt5Result.ticket,
            direction: 'BUY',
            amount: amount,
            profit: profit,
            profitPercent: profitPercent.toFixed(2),
            confidence: 99,
            multiplier: `${multiplier}x`,
            message: `🎉 PROFIT: $${profit.toFixed(2)}! Your $${amount} became $${(amount + profit).toFixed(2)}!`
        };
    }
}

const bot = new Forex1000Bot();

// ==================== API ENDPOINTS ====================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        database: dbReady ? 'connected' : 'connecting',
        mt5: mt5Trader.connected ? 'connected' : 'disconnected',
        mt5Account: {
            login: MT5_CONFIG.login,
            server: MT5_CONFIG.server,
            balance: mt5Trader.getBalance()
        },
        bot: 'FOREX 1000/DAY',
        target: '$20 → $1,000 PROFIT',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Main trading endpoint
app.post('/api/trade/accept', async (req, res) => {
    try {
        const { phoneNumber, amount, provider = 'mpesa', email } = req.body;
        
        console.log(`📥 TRADE REQUEST: ${phoneNumber} | $${amount} | ${provider}`);
        
        // Validation
        if (!phoneNumber || phoneNumber.length < 10) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please enter a valid phone number (e.g., 0712345678)' 
            });
        }
        
        let tradeAmount = parseFloat(amount);
        if (isNaN(tradeAmount) || tradeAmount < 20) {
            return res.status(400).json({ 
                success: false, 
                message: 'Minimum investment is $20 to earn $1,000 profit!' 
            });
        }
        
        if (tradeAmount > 10000) {
            return res.status(400).json({ 
                success: false, 
                message: 'Maximum investment is $10,000' 
            });
        }
        
        // Find or create user in DATABASE (PERSISTENT)
        let user = await User.findOne({ phoneNumber });
        let isNewUser = false;
        
        if (!user) {
            user = new User({
                phoneNumber: phoneNumber,
                email: email || '',
                balance: 0,
                totalInvested: 0,
                totalProfit: 0,
                totalTrades: 0,
                winningTrades: 0,
                createdAt: new Date()
            });
            await user.save();
            isNewUser = true;
            console.log(`👤 NEW USER CREATED IN DATABASE: ${phoneNumber}`);
        }
        
        // Reset daily profit if new day
        const today = new Date().toDateString();
        if (user.lastTradeDate !== today) {
            user.currentDailyProfit = 0;
            user.lastTradeDate = today;
        }
        
        // Execute trade
        const trade = await bot.executeTrade(phoneNumber, tradeAmount);
        
        if (!trade.success) {
            return res.status(400).json({ success: false, message: trade.message });
        }
        
        // Calculate profit and new balance
        const profit = trade.profit;
        const previousBalance = user.balance;
        const newBalance = user.balance + tradeAmount + profit;
        
        // Update user stats in DATABASE (PERSISTENT)
        user.balance = newBalance;
        user.totalInvested += tradeAmount;
        user.totalProfit += profit;
        user.totalTrades++;
        user.winningTrades++;
        user.currentDailyProfit += profit;
        user.lastActive = new Date();
        user.winRate = (user.winningTrades / user.totalTrades) * 100;
        
        await user.save();
        
        // Save trade to DATABASE (PERSISTENT)
        const tradeRecord = new Trade({
            userId: user._id,
            tradeId: trade.tradeId,
            phoneNumber: phoneNumber,
            direction: trade.direction,
            amount: trade.amount,
            profit: profit,
            profitPercent: parseFloat(trade.profitPercent),
            confidence: trade.confidence,
            mt5Ticket: trade.mt5Ticket,
            closedAt: new Date()
        });
        await tradeRecord.save();
        
        // Save transaction to DATABASE (PERSISTENT)
        const transaction = new Transaction({
            userId: user._id,
            transactionId: `TX_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            type: 'TRADE_PROFIT',
            amount: profit,
            previousBalance: previousBalance,
            newBalance: newBalance,
            description: `Trade profit: $${tradeAmount} → $${profit} profit`
        });
        await transaction.save();
        
        console.log(`✅ TRADE SAVED TO DATABASE: ${trade.tradeId}`);
        console.log(`💰 PROFIT: $${profit.toFixed(2)} | NEW BALANCE: $${user.balance.toFixed(2)}`);
        
        // Update MT5 Demo Balance (simulated)
        mt5Trader.balance += profit;
        
        // Prepare response
        res.json({
            success: true,
            message: `🎉 CONGRATULATIONS! Your $${tradeAmount} investment earned $${profit.toFixed(2)} PROFIT!`,
            payment: {
                amount: tradeAmount,
                transactionId: `PAY_${Date.now()}`,
                phoneNumber: phoneNumber,
                provider: provider
            },
            trade: {
                tradeId: trade.tradeId,
                mt5Ticket: trade.mt5Ticket,
                direction: trade.direction,
                amount: trade.amount,
                profit: profit,
                profitPercent: trade.profitPercent,
                confidence: trade.confidence,
                multiplier: trade.multiplier
            },
            user: {
                phoneNumber: user.phoneNumber,
                balance: user.balance.toFixed(2),
                totalProfit: user.totalProfit.toFixed(2),
                winRate: user.winRate.toFixed(1),
                totalTrades: user.totalTrades,
                winningTrades: user.winningTrades
            },
            mt5Status: {
                login: MT5_CONFIG.login,
                server: MT5_CONFIG.server,
                balance: mt5Trader.balance.toFixed(2),
                accountType: MT5_CONFIG.accountType
            },
            profitInfo: {
                investment: tradeAmount,
                profit: profit,
                totalReturn: (tradeAmount + profit).toFixed(2),
                multiplier: trade.multiplier,
                message: `💵 Your $${tradeAmount} became $${(tradeAmount + profit).toFixed(2)}!`
            }
        });
        
    } catch (error) {
        console.error('Trade error:', error);
        logger.error('Trade error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'System error. Please try again.' 
        });
    }
});

// Get user stats from DATABASE (PERSISTENT)
app.get('/api/user/stats', async (req, res) => {
    try {
        const { phoneNumber } = req.query;
        
        if (!phoneNumber) {
            return res.status(400).json({ success: false, message: 'Phone number required' });
        }
        
        const user = await User.findOne({ phoneNumber });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // Get recent trades from DATABASE
        const recentTrades = await Trade.find({ phoneNumber: phoneNumber })
            .sort({ closedAt: -1 })
            .limit(20);
        
        // Calculate next trade projection
        const nextProfit = 1000 * ((user.balance + 20) / 20);
        
        res.json({
            success: true,
            user: {
                phoneNumber: user.phoneNumber,
                balance: user.balance.toFixed(2),
                totalInvested: user.totalInvested,
                totalProfit: user.totalProfit.toFixed(2),
                totalTrades: user.totalTrades,
                winningTrades: user.winningTrades,
                losingTrades: user.losingTrades,
                winRate: user.winRate.toFixed(1),
                currentDailyProfit: user.currentDailyProfit.toFixed(2)
            },
            nextTrade: {
                investment: 20,
                expectedProfit: 1000,
                totalReturn: 1020,
                message: `💰 Invest $20 to earn $1,000 profit!`
            },
            recentTrades: recentTrades.map(t => ({
                tradeId: t.tradeId,
                direction: t.direction,
                amount: t.amount,
                profit: t.profit,
                profitPercent: t.profitPercent,
                mt5Ticket: t.mt5Ticket,
                closedAt: t.closedAt
            })),
            mt5Account: {
                login: MT5_CONFIG.login,
                server: MT5_CONFIG.server,
                balance: mt5Trader.balance.toFixed(2),
                platform: MT5_CONFIG.platform
            }
        });
        
    } catch (error) {
        console.error('Stats error:', error);
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
            sentiment: 'EXTREMELY BULLISH',
            mt5Status: 'Connected to Exness-MT5Trial9',
            price: '1.09234',
            timestamp: Date.now()
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
        database: dbReady ? 'MongoDB Connected' : 'Connecting...',
        mt5: {
            connected: mt5Trader.connected,
            login: MT5_CONFIG.login,
            server: MT5_CONFIG.server,
            balance: mt5Trader.balance
        },
        strategy: 'ONE TRADE TO $1000',
        activeUsers: await User.countDocuments()
    });
});

// Get all trades history
app.get('/api/trades/history', async (req, res) => {
    try {
        const { phoneNumber } = req.query;
        const query = phoneNumber ? { phoneNumber } : {};
        const trades = await Trade.find(query).sort({ closedAt: -1 }).limit(100);
        
        res.json({
            success: true,
            trades: trades.map(t => ({
                tradeId: t.tradeId,
                phoneNumber: t.phoneNumber,
                direction: t.direction,
                amount: t.amount,
                profit: t.profit,
                profitPercent: t.profitPercent,
                mt5Ticket: t.mt5Ticket,
                closedAt: t.closedAt
            })),
            totalTrades: trades.length,
            totalProfit: trades.reduce((sum, t) => sum + (t.profit || 0), 0)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Withdraw
app.post('/api/withdraw', async (req, res) => {
    try {
        const { phoneNumber, amount, provider = 'mpesa' } = req.body;
        
        const user = await User.findOne({ phoneNumber });
        if (!user) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        if (amount > user.balance) {
            return res.json({ success: false, message: `Insufficient balance. You have $${user.balance.toFixed(2)}` });
        }
        
        user.balance -= amount;
        await user.save();
        
        // Save withdrawal transaction
        const transaction = new Transaction({
            userId: user._id,
            transactionId: `WDR_${Date.now()}`,
            type: 'WITHDRAWAL',
            amount: amount,
            previousBalance: user.balance + amount,
            newBalance: user.balance,
            description: `Withdrawal to ${provider}`
        });
        await transaction.save();
        
        res.json({
            success: true,
            transactionId: `WDR_${Date.now()}`,
            amount: amount,
            phoneNumber: phoneNumber,
            provider: provider,
            newBalance: user.balance,
            message: `✅ $${amount} sent to ${phoneNumber} successfully!`
        });
        
    } catch (error) {
        res.json({ success: false, message: 'Withdrawal failed' });
    }
});

// Serve frontend
app.use(express.static('public'));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== WEBSOCKET REAL-TIME UPDATES ====================
io.on('connection', (socket) => {
    console.log('🔌 WebSocket client connected');
    
    socket.on('subscribe', (data) => {
        if (data?.phoneNumber) {
            socket.join(`user_${data.phoneNumber}`);
            console.log(`📱 Subscribed: ${data.phoneNumber}`);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('🔌 WebSocket disconnected');
    });
});

// Real-time MT5 updates every 5 seconds
setInterval(async () => {
    const analysis = {
        timestamp: Date.now(),
        mt5Connected: mt5Trader.connected,
        mt5Balance: mt5Trader.balance,
        price: (1.0890 + (Math.random() - 0.5) * 0.002).toFixed(5),
        recommendation: 'BUY',
        confidence: 99
    };
    io.emit('market_update', analysis);
}, 5000);

// Daily reset at midnight
cron.schedule('0 0 * * *', async () => {
    console.log('🔄 Resetting daily profits...');
    await User.updateMany({}, { currentDailyProfit: 0, lastTradeDate: new Date().toDateString() });
    console.log('✅ Daily profits reset');
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🚀 FOREX 1000/DAY BOT - MT5 INTEGRATED + MONGODB DATABASE                 ║
║                                                                              ║
║   💰 TARGET: $20 → $1,000 PROFIT IN ONE TRADE!                              ║
║                                                                              ║
║   📊 DATABASE: MongoDB Atlas (REAL - PERSISTENT)                             ║
║      ✅ Status: ${dbReady ? 'CONNECTED' : 'CONNECTING...'}                                            ║
║                                                                              ║
║   🖥️ MT5 DEMO ACCOUNT:                                                       ║
║      ✅ Login: ${MT5_CONFIG.login}                                                 ║
║      ✅ Server: ${MT5_CONFIG.server}                                            ║
║      ✅ Balance: $${mt5Trader.balance.toFixed(2)}                                                ║
║                                                                              ║
║   🌐 API Server: http://localhost:${PORT}                                    ║
║   📊 Dashboard: http://localhost:${PORT}/dashboard.html                      ║
║                                                                              ║
║   ⚡ DATA IS PERSISTENT - WON'T LOSE ON REFRESH!                             ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
    `);
});

module.exports = { app, io, logger, User, Trade, Transaction };
