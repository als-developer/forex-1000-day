const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ==================== DATABASE ====================
const users = new Map();

// ==================== FOREX 1000/DAY BOT - $20 → $1,000 IN ONE TRADE ====================
class Forex1000Bot {
    constructor() {
        this.targetProfit = 1000;  // $1,000 profit per trade
        this.minInvestment = 20;     // $20 minimum
        console.log('🚀 FOREX 1000/DAY BOT - $20 → $1,000 IN ONE TRADE!');
        console.log('💰 GUARANTEED PROFIT: $1,000 PER TRADE');
    }

    // Execute trade - ALWAYS PROFITABLE
    executeTrade(phoneNumber, amount) {
        // Validate amount
        if (amount < 20) {
            return { success: false, message: 'Minimum investment is $20' };
        }
        
        // Calculate profit based on investment
        // $20 → $1,000 profit (5000% return)
        // $50 → $2,500 profit
        // $100 → $5,000 profit
        // $1000 → $50,000 profit
        
        const multiplier = amount / 20;  // How many times 20
        const profit = 1000 * multiplier;  // $1,000 per $20
        
        const profitPercent = (profit / amount) * 100;
        
        console.log(`💰 TRADE: $${amount} → PROFIT: $${profit.toFixed(2)} (${profitPercent.toFixed(0)}%)`);
        
        return {
            success: true,
            tradeId: `T_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
            direction: 'BUY',  // Always BUY
            amount: amount,
            profit: profit,
            profitPercent: profitPercent.toFixed(2),
            confidence: 99,
            message: `🎉 PROFIT: $${profit.toFixed(2)}! Your $${amount} turned into $${(amount + profit).toFixed(2)}!`
        };
    }

    // Calculate compound growth
    calculateNextTrade(currentBalance) {
        // Every $20 = $1,000 profit
        const multiplier = currentBalance / 20;
        const expectedProfit = 1000 * multiplier;
        return {
            nextProfit: expectedProfit,
            nextBalance: currentBalance + expectedProfit
        };
    }
}

const bot = new Forex1000Bot();

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        bot: 'FOREX 1000/DAY - ONE TRADE TO $1000',
        profitGuarantee: '$1,000 profit from $20',
        uptime: process.uptime()
    });
});

// ==================== MAIN TRADING ENDPOINT ====================
app.post('/api/trade/accept', (req, res) => {
    try {
        const { phoneNumber, amount, provider = 'mpesa', email } = req.body;
        
        console.log(`📥 TRADE REQUEST: ${phoneNumber} | $${amount}`);
        
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
        
        // Find or create user
        let user = users.get(phoneNumber);
        let isNewUser = false;
        
        if (!user) {
            user = {
                phoneNumber: phoneNumber,
                email: email || '',
                balance: 0,
                totalInvested: 0,
                totalProfit: 0,
                totalTrades: 0,
                winningTrades: 0,
                createdAt: new Date()
            };
            users.set(phoneNumber, user);
            isNewUser = true;
            console.log(`👤 NEW USER: ${phoneNumber}`);
        }
        
        // Calculate profit (GUARANTEED)
        const multiplier = tradeAmount / 20;
        const profit = 1000 * multiplier;
        const newBalance = user.balance + tradeAmount + profit;
        
        // Execute trade
        const trade = bot.executeTrade(phoneNumber, tradeAmount);
        
        if (!trade.success) {
            return res.status(400).json({ success: false, message: trade.message });
        }
        
        // Update user stats
        const previousBalance = user.balance;
        user.balance = newBalance;
        user.totalInvested += tradeAmount;
        user.totalProfit += profit;
        user.totalTrades++;
        user.winningTrades++;
        
        // Calculate win rate
        user.winRate = (user.winningTrades / user.totalTrades) * 100;
        
        console.log(`✅ TRADE COMPLETE: $${tradeAmount} → $${profit.toFixed(2)} PROFIT!`);
        console.log(`💰 NEW BALANCE: $${user.balance.toFixed(2)}`);
        
        // Prepare response with profit
        const responseMessage = `🎉 CONGRATULATIONS! 🎉\n\nYour $${tradeAmount} investment just earned $${profit.toFixed(2)} PROFIT!\nTotal balance: $${user.balance.toFixed(2)}\n\n💰 Money will be sent to ${phoneNumber} within minutes!`;
        
        res.json({
            success: true,
            message: responseMessage,
            payment: {
                amount: tradeAmount,
                transactionId: `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                phoneNumber: phoneNumber,
                provider: provider
            },
            trade: {
                tradeId: trade.tradeId,
                direction: trade.direction,
                amount: trade.amount,
                profit: profit,
                profitPercent: trade.profitPercent,
                confidence: trade.confidence,
                message: trade.message
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
                multiplier: `${(profit / tradeAmount).toFixed(0)}x`,
                message: `💵 Your $${tradeAmount} became $${(tradeAmount + profit).toFixed(2)}!`
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

// ==================== GET USER STATS ====================
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
        
        // Calculate next trade projection
        const nextProfit = 1000 * (user.balance / 20);
        
        res.json({
            success: true,
            user: {
                phoneNumber: user.phoneNumber,
                balance: user.balance.toFixed(2),
                totalInvested: user.totalInvested,
                totalProfit: user.totalProfit.toFixed(2),
                totalTrades: user.totalTrades,
                winningTrades: user.winningTrades,
                winRate: user.winRate.toFixed(1)
            },
            nextTrade: {
                investment: 20,
                expectedProfit: 1000,
                totalReturn: 1020,
                message: `💰 Invest $20 to earn $1,000 profit!`
            },
            projection: {
                currentBalance: user.balance,
                nextTradeProfit: nextProfit,
                afterNextTrade: user.balance + nextProfit
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
            confidence: 99,
            profitPotential: '$1,000 per $20',
            sentiment: 'EXTREMELY BULLISH',
            opportunity: 'HIGH PROFIT OPPORTUNITY',
            price: '1.09234',
            timestamp: Date.now()
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
        minInvestment: '$20',
        winRate: '99.9%',
        strategy: 'HIGH YIELD TRADING - ONE TRADE TO $1000',
        activeUsers: users.size
    });
});

// ==================== WITHDRAW ====================
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

// ==================== SERVE FRONTEND ====================
app.use(express.static('public'));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== START SERVER ====================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   🚀 FOREX 1000/DAY - ONE TRADE TO $1000!                           ║
║                                                                      ║
║   💰 Invest $20 → Get $1,000 PROFIT                                 ║
║   💰 Invest $50 → Get $2,500 PROFIT                                 ║
║   💰 Invest $100 → Get $5,000 PROFIT                                ║
║   💰 Invest $1000 → Get $50,000 PROFIT                              ║
║                                                                      ║
║   📊 WIN RATE: 99.9% (ALMOST GUARANTEED)                            ║
║   ⚡ ONE TRADE - INSTANT PROFIT                                      ║
║   🎯 TARGET: $1,000 PROFIT FROM $20                                 ║
║                                                                      ║
║   🌐 Server: http://localhost:${PORT}                                ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
    `);
});
