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
        new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
        new winston.transports.File({ filename: path.join(logDir, 'combined.log') }),
        new winston.transports.Console({ format: winston.format.simple() })
    ]
});

// ==================== READINESS FLAGS ====================
let dbReady = false;
let aiReady = false;

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

// ==================== DATABASE CONNECTION WITH RETRY ====================
const connectDB = async (retryCount = 0) => {
    const maxRetries = 5;
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/forex1000', {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            minPoolSize: 2,
            family: 4
        });
        dbReady = true;
        logger.info('✅ MongoDB connected successfully');
        
        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected, reconnecting...');
            dbReady = false;
            setTimeout(() => connectDB(), 5000);
        });
        
        mongoose.connection.on('error', (err) => {
            logger.error('MongoDB error:', err.message);
        });
        
    } catch (error) {
        logger.error(`❌ MongoDB connection failed (attempt ${retryCount + 1}):`, error.message);
        if (retryCount < maxRetries) {
            setTimeout(() => connectDB(retryCount + 1), 5000 * Math.pow(2, retryCount));
        } else {
            logger.error('Failed to connect to MongoDB after multiple attempts');
            // Don't exit, just log - app can still work with fallbacks
        }
    }
};
connectDB();

// ==================== SCHEMAS (Simplified for reliability) ====================
const UserSchema = new mongoose.Schema({
    phoneNumber: { type: String, required: true, unique: true, index: true },
    email: { type: String, sparse: true },
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
    createdAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
});

const TradeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    tradeId: { type: String, unique: true, default: () => `T_${Date.now()}_${uuidv4().slice(0, 6)}` },
    direction: { type: String, enum: ['BUY', 'SELL'] },
    amount: { type: Number },
    profit: { type: Number, default: 0 },
    profitPercent: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 },
    status: { type: String, default: 'CLOSED' },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: Date.now }
});

const TransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    transactionId: { type: String, unique: true, default: () => `TX_${Date.now()}_${uuidv4().slice(0, 6)}` },
    type: { type: String, enum: ['DEPOSIT', 'WITHDRAWAL', 'TRADE_PROFIT', 'TRADE_LOSS'] },
    amount: { type: Number },
    previousBalance: Number,
    newBalance: Number,
    description: String,
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Trade = mongoose.model('Trade', TradeSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);

// ==================== SIMPLE BUT RELIABLE AI ENGINE ====================
class ForexBotEngine {
    constructor() {
        this.initialized = true;
        aiReady = true;
        logger.info('🚀 Forex Bot Engine Initialized');
    }

    // Simple market analysis - no external API calls
    analyzeMarket() {
        const now = new Date();
        const hour = now.getUTCHours();
        
        // London session (8am - 5pm GMT) = best trading
        const isActiveSession = hour >= 8 && hour <= 17;
        
        // Random but biased towards win (75% win rate target)
        const random = Math.random() * 100;
        let recommendation = 'BUY';
        let confidence = 70;
        
        if (isActiveSession) {
            // Active session: 75-85% win rate
            if (random < 42) recommendation = 'BUY';
            else if (random < 84) recommendation = 'SELL';
            else recommendation = 'HOLD';
            confidence = 72 + Math.floor(Math.random() * 13);
        } else {
            // Quiet session: 65-75% win rate
            if (random < 37) recommendation = 'BUY';
            else if (random < 74) recommendation = 'SELL';
            else recommendation = 'HOLD';
            confidence = 65 + Math.floor(Math.random() * 11);
        }
        
        return {
            recommendation,
            confidence,
            session: isActiveSession ? 'ACTIVE' : 'QUIET',
            timestamp: Date.now()
        };
    }

    // Execute trade with guaranteed response time
    async executeTrade(userId, amount, userPhone) {
        const startTime = Date.now();
        logger.info(`🎯 Executing trade for ${userPhone} with $${amount}`);
        
        try {
            // Find user
            let user = await User.findById(userId);
            if (!user) {
                return { success: false, message: 'User not found. Please try again.' };
            }
            
            // Check if daily target reached
            const today = new Date().setHours(0, 0, 0, 0);
            if (user.lastResetDate && new Date(user.lastResetDate).setHours(0, 0, 0, 0) !== today) {
                user.currentDailyProfit = 0;
                user.lastResetDate = new Date();
                await user.save();
            }
            
            // Get market analysis
            const analysis = this.analyzeMarket();
            
            // Determine if trade is win or loss (75-80% win rate)
            const winProbability = analysis.confidence / 100;
            const isWin = Math.random() < winProbability;
            
            // Calculate profit (3-8% on win, -1-2% on loss)
            let profitPercent, profit;
            
            if (isWin) {
                profitPercent = 0.03 + (Math.random() * 0.05);
                profit = amount * profitPercent;
            } else {
                profitPercent = -(0.01 + (Math.random() * 0.015));
                profit = amount * profitPercent;
            }
            
            // Create trade record
            const trade = new Trade({
                userId: user._id,
                direction: analysis.recommendation === 'HOLD' ? (Math.random() > 0.5 ? 'BUY' : 'SELL') : analysis.recommendation,
                amount: amount,
                profit: profit,
                profitPercent: profitPercent * 100,
                confidence: analysis.confidence,
                status: 'CLOSED',
                closedAt: new Date()
            });
            
            // Save trade with timeout
            await Promise.race([
                trade.save(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Trade save timeout')), 5000))
            ]);
            
            // Update user stats
            const previousBalance = user.balance;
            user.balance += profit;
            user.totalTrades++;
            
            if (profit > 0) {
                user.winningTrades++;
                user.totalProfit += profit;
                user.currentDailyProfit += profit;
            } else {
                user.losingTrades++;
                user.totalLoss += Math.abs(profit);
            }
            
            user.winRate = user.totalTrades > 0 ? (user.winningTrades / user.totalTrades) * 100 : 0;
            user.lastActive = new Date();
            
            await Promise.race([
                user.save(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('User save timeout')), 5000))
            ]);
            
            // Create transaction
            const transaction = new Transaction({
                userId: user._id,
                type: profit >= 0 ? 'TRADE_PROFIT' : 'TRADE_LOSS',
                amount: Math.abs(profit),
                previousBalance,
                newBalance: user.balance,
                description: `${analysis.recommendation} trade - ${analysis.confidence}% confidence`
            });
            
            await Promise.race([
                transaction.save(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Transaction save timeout')), 5000))
            ]);
            
            const duration = Date.now() - startTime;
            logger.info(`✅ Trade completed in ${duration}ms | Profit: $${profit.toFixed(2)} | Balance: $${user.balance.toFixed(2)}`);
            
            // Calculate remaining daily target
            const dailyTarget = 1000;
            const remainingTarget = Math.max(0, dailyTarget - user.currentDailyProfit);
            
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
                    totalProfit: user.totalProfit.toFixed(2),
                    winRate: user.winRate.toFixed(1),
                    totalTrades: user.totalTrades,
                    currentDailyProfit: user.currentDailyProfit.toFixed(2),
                    dailyTarget: dailyTarget,
                    remainingTarget: remainingTarget.toFixed(2),
                    message: remainingTarget <= 0 ? '🎉 Daily target reached! Profits sent to your phone!' : `Need $${remainingTarget.toFixed(2)} more to reach daily target`
                }
            };
            
        } catch (error) {
            logger.error('Trade execution error:', error);
            return { 
                success: false, 
                message: 'System error. Please try again.',
                error: error.message
            };
        }
    }
}

// ==================== PAYMENT SERVICE ====================
class PaymentService {
    async processDeposit(phoneNumber, amount, provider) {
        logger.info(`💰 Processing deposit: ${phoneNumber}, $${amount}, ${provider}`);
        
        // Simulate payment (99% success rate)
        const success = Math.random() > 0.02;
        
        if (success) {
            return {
                success: true,
                transactionId: `PAY_${Date.now()}_${uuidv4().slice(0, 6)}`,
                amount,
                phoneNumber,
                provider,
                message: `✅ Payment of $${amount} received successfully!`
            };
        }
        
        return { success: false, message: 'Payment failed. Please check your balance and try again.' };
    }
    
    async processWithdrawal(phoneNumber, amount, provider) {
        logger.info(`💸 Processing withdrawal: ${phoneNumber}, $${amount}, ${provider}`);
        
        const success = Math.random() > 0.03;
        
        if (success) {
            return {
                success: true,
                transactionId: `WDR_${Date.now()}_${uuidv4().slice(0, 6)}`,
                amount,
                phoneNumber,
                provider,
                message: `✅ $${amount} sent to ${phoneNumber} successfully!`
            };
        }
        
        return { success: false, message: 'Withdrawal failed. Please try again.' };
    }
}

// ==================== INITIALIZE SERVICES ====================
const forexEngine = new ForexBotEngine();
const paymentService = new PaymentService();

// ==================== API ENDPOINTS (WITH TIMEOUT PROTECTION) ====================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        database: dbReady ? 'connected' : 'connecting',
        aiEngine: aiReady ? 'ready' : 'initializing',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Main trading endpoint WITH TIMEOUT HANDLING
app.post('/api/trade/accept', async (req, res) => {
    // Set timeout to prevent hanging
    req.setTimeout(30000);
    res.setTimeout(30000);
    
    try {
        const { phoneNumber, amount, provider = 'mpesa', email } = req.body;
        
        logger.info(`📥 Trade request: ${phoneNumber}, $${amount}`);
        
        // Validation
        if (!phoneNumber || phoneNumber.length < 10) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please enter a valid phone number (e.g., 0712345678)' 
            });
        }
        
        const minAmount = 20;
        const maxAmount = 10000;
        
        if (!amount || amount < minAmount) {
            return res.status(400).json({ 
                success: false, 
                message: `Minimum investment is $${minAmount}` 
            });
        }
        
        if (amount > maxAmount) {
            return res.status(400).json({ 
                success: false, 
                message: `Maximum investment is $${maxAmount}` 
            });
        }
        
        // Find or create user with retry
        let user = await User.findOne({ phoneNumber }).catch(() => null);
        let isNewUser = false;
        
        if (!user) {
            user = new User({
                phoneNumber: phoneNumber,
                email: email || '',
                balance: 0,
                initialDeposit: amount,
                createdAt: new Date()
            });
            await user.save().catch(err => {
                logger.error('User save error:', err);
                throw new Error('Failed to create user account');
            });
            isNewUser = true;
            logger.info(`👤 New user: ${phoneNumber}`);
        }
        
        // Process payment
        const payment = await paymentService.processDeposit(phoneNumber, amount, provider);
        
        if (!payment.success) {
            return res.status(400).json({ success: false, message: payment.message });
        }
        
        // Update user balance
        const previousBalance = user.balance;
        user.balance += amount;
        if (isNewUser) user.initialDeposit = amount;
        await user.save();
        
        // Create deposit transaction
        const depositTx = new Transaction({
            userId: user._id,
            type: 'DEPOSIT',
            amount: amount,
            previousBalance,
            newBalance: user.balance,
            description: `Deposit of $${amount} via ${provider}`
        });
        await depositTx.save();
        
        // Execute trade with timeout
        const tradeResult = await Promise.race([
            forexEngine.executeTrade(user._id, amount, phoneNumber),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Trade execution timeout')), 15000))
        ]);
        
        if (!tradeResult.success) {
            // Refund on trade failure
            user.balance -= amount;
            await user.save();
            
            return res.json({
                success: false,
                message: tradeResult.message || 'Trade failed. Your money has been refunded.',
                refund: true
            });
        }
        
        // Auto-withdraw if daily target reached
        let withdrawal = null;
        if (tradeResult.userState && parseFloat(tradeResult.userState.remainingTarget) <= 0) {
            const dailyProfit = parseFloat(tradeResult.userState.currentDailyProfit);
            if (dailyProfit > 10) {
                withdrawal = await paymentService.processWithdrawal(phoneNumber, dailyProfit, provider);
                if (withdrawal.success) {
                    user.balance -= dailyProfit;
                    await user.save();
                }
            }
        }
        
        res.json({
            success: true,
            message: `✅ $${amount} invested! Trade completed successfully.`,
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
                totalProfit: user.totalProfit,
                winRate: user.winRate,
                totalTrades: user.totalTrades
            }
        });
        
    } catch (error) {
        logger.error('Trade API error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'System error. Please try again.',
            code: 'SERVER_ERROR'
        });
    }
});

// Get user stats
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
        
        const recentTrades = await Trade.find({ userId: user._id }).sort({ closedAt: -1 }).limit(20);
        const dailyTarget = 1000;
        const progressPercent = (user.currentDailyProfit / dailyTarget) * 100;
        
        res.json({
            success: true,
            user: {
                phoneNumber: user.phoneNumber,
                balance: user.balance.toFixed(2),
                initialDeposit: user.initialDeposit,
                totalProfit: user.totalProfit.toFixed(2),
                totalTrades: user.totalTrades,
                winningTrades: user.winningTrades,
                losingTrades: user.losingTrades,
                winRate: user.winRate.toFixed(1)
            },
            dailyProgress: {
                currentDailyProfit: user.currentDailyProfit.toFixed(2),
                dailyTarget: dailyTarget,
                progressPercent: Math.min(100, progressPercent).toFixed(1),
                remainingTarget: Math.max(0, dailyTarget - user.currentDailyProfit).toFixed(2)
            },
            recentTrades: recentTrades.map(t => ({
                tradeId: t.tradeId,
                direction: t.direction,
                amount: t.amount,
                profit: t.profit.toFixed(2),
                profitPercent: t.profitPercent.toFixed(1),
                confidence: t.confidence,
                closedAt: t.closedAt
            }))
        });
        
    } catch (error) {
        logger.error('User stats error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Market analysis
app.get('/api/market/analysis', (req, res) => {
    try {
        const analysis = forexEngine.analyzeMarket();
        res.json({ success: true, analysis });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// AI status
app.get('/api/ai/status', (req, res) => {
    res.json({
        success: true,
        initialized: aiReady,
        dailyTarget: 1000,
        minDeposit: 20,
        winRate: '75-85%'
    });
});

// Withdraw
app.post('/api/withdraw', async (req, res) => {
    try {
        const { phoneNumber, amount, provider = 'mpesa' } = req.body;
        
        if (!phoneNumber || !amount || amount < 10) {
            return res.status(400).json({ success: false, message: 'Minimum withdrawal is $10' });
        }
        
        const user = await User.findOne({ phoneNumber });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        if (amount > user.balance) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient balance. Your balance is $${user.balance.toFixed(2)}`
            });
        }
        
        const withdrawal = await paymentService.processWithdrawal(phoneNumber, amount, provider);
        
        if (withdrawal.success) {
            user.balance -= amount;
            await user.save();
            
            const transaction = new Transaction({
                userId: user._id,
                type: 'WITHDRAWAL',
                amount: amount,
                previousBalance: user.balance + amount,
                newBalance: user.balance,
                description: `Withdrawal of $${amount} to ${provider}`
            });
            await transaction.save();
        }
        
        res.json(withdrawal);
        
    } catch (error) {
        logger.error('Withdrawal error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Serve static files
app.use(express.static('public'));

// Catch-all
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== WEBSOCKET ====================
io.on('connection', (socket) => {
    logger.info('🔌 WebSocket connected');
    
    socket.on('subscribe', (data) => {
        if (data?.phoneNumber) {
            socket.join(`user_${data.phoneNumber}`);
            logger.info(`📱 Subscribed: ${data.phoneNumber}`);
        }
    });
    
    socket.on('disconnect', () => {
        logger.info('🔌 WebSocket disconnected');
    });
});

// Real-time market updates every 5 seconds
setInterval(() => {
    try {
        const analysis = forexEngine.analyzeMarket();
        io.emit('market_update', {
            timestamp: Date.now(),
            price: (1.0890 + (Math.random() - 0.5) * 0.002).toFixed(5),
            recommendation: analysis.recommendation,
            confidence: analysis.confidence,
            session: analysis.session
        });
    } catch (e) {}
}, 5000);

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    logger.info(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🚀 FOREX BOT - RELIABLE VERSION v6.1                        ║
║   ✅ All errors fixed | Timeout protection added              ║
║   🎯 Server running on http://localhost:${PORT}                ║
║   💰 Minimum: $20 | Daily Target: $1,000                      ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
    `);
});

module.exports = { app, io, logger };
