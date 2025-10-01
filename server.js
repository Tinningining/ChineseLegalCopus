// 首先加载环境变量
require('dotenv').config();

const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const app = express();
const port = process.env.PORT;

// 编码验证函数
function ensureUtf8(text) {
    // 如果已经是字符串，确保是有效的UTF-8
    if (typeof text === 'string') {
        // 尝试重新编码确保UTF-8格式
        return Buffer.from(text, 'utf8').toString('utf8');
    }
    return text;
}

// 确定适当的cookie域，基于请求来源
function getCookieDomain(req) {
    const origin = req.headers.origin || '';
    if (origin.includes('lawcorpus.online')) {
        return '.lawcorpus.online';
    }
    return undefined; // 本地环境不设置域名
}

// JWT密钥 - 从环境变量中读取
const JWT_SECRET = process.env.JWT_SECRET;

// 导入 OpenAI SDK
const { OpenAI } = require('openai');

// 创建 OpenAI 客户端实例，配置 DeepSeek 参数
const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY
});

// 连接 SQLite 数据库
const userDbPath = path.join(__dirname, 'users.db');
const db = new sqlite3.Database(path.join(__dirname, 'laws.db'));
const db_l = new sqlite3.Database(path.join(__dirname, 'laws_dependency.db'));
let userDb;


// 初始化数据库
async function initDatabase() {
    try {
        // 打开用户数据库连接
        userDb = await open({
            filename: userDbPath,
            driver: sqlite3.Database
        });
        
        // 启用外键约束
        await userDb.run('PRAGMA foreign_keys = ON');
        
        // 创建用户表
        await userDb.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                email TEXT UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 创建聊天会话表 - 包含ai_type字段
        await userDb.exec(`
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                ai_type TEXT DEFAULT 'general',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        
        // 创建消息表
        await userDb.exec(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            )
        `);
        
        console.log('数据库连接和初始化成功');
    } catch (error) {
        console.error('数据库初始化失败:', error);
        throw error;
    }
}

// // 更新 CORS 配置
// app.use(cors({
//     origin: function(origin, callback) {
//         // 允许的域名列表
//         const allowedOrigins = [
//             'http://lawcorpus.online', 
//             'http://www.lawcorpus.online',
//             'http://lawcorpus.online:8080',
//             'https://lawcorpus.online', 
//             'https://www.lawcorpus.online',
//             'http://localhost:3000',
//             'http://127.0.0.1:3000',
//             'http://0.0.0.0:3000'
//         ];
        
//         // 允许无Origin的请求通过（例如本地文件访问或Postman）
//         if (!origin) return callback(null, true);
        
//         if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
//             callback(null, true);
//         } else {
//             console.log('CORS blocked for origin:', origin);
//             callback(new Error('Not allowed by CORS'));
//         }
//     },
//     credentials: true,
//     exposedHeaders: ['Set-Cookie']
// }));

// 更新 CORS 配置 - 允许所有源访问
app.use(cors({
    origin: true, // 允许任何源
    credentials: true,
    exposedHeaders: ['Set-Cookie']
}));

// Express设置
app.use(express.json({ limit: '10mb' })); // 增加限制并默认使用UTF-8
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// 配置静态文件夹
app.use(express.static(path.join(__dirname, 'public')));

// 添加编码中间件在其他中间件之后，路由之前
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
});

// 认证中间件
const authenticateUser = (req, res, next) => {
    // 尝试从多个来源获取token
    const token = 
        req.cookies.token || 
        req.headers.authorization?.split(' ')[1] ||
        req.query.token ||  // 允许在查询中使用token（用于调试）
        req.body.token;     // 允许在请求体中使用token（用于调试）
    
    if (!token) {
        console.log('认证失败: 未提供令牌');
        return res.status(401).json({ error: '未授权，请先登录' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.log('认证失败: 令牌验证错误', error.message);
        return res.status(401).json({ error: '无效的令牌，请重新登录' });
    }
};

// 添加一个调试端点来测试认证
app.get('/api/auth/check', authenticateUser, (req, res) => {
    res.json({ 
        authenticated: true, 
        user: req.user,
        message: '认证成功'
    });
});

app.get('/api/debug/db', async (req, res) => {
    try {
        const users = await userDb.all("SELECT * FROM users");
        const sessions = await userDb.all("SELECT * FROM chat_sessions");
        const messages = await userDb.all("SELECT * FROM messages");

        res.json({
            users,
            chat_sessions: sessions,
            messages
        });
    } catch (error) {
        console.error("查询数据库内容失败:", error);
        res.status(500).json({ error: "数据库查询失败" });
    }
});

// 注册路由
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码为必填项' });
        }
        
        // 检查用户名是否已存在
        const existingUser = await userDb.get(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        
        if (existingUser) {
            return res.status(409).json({ error: '用户名已存在' });
        }
        
        // 加密密码
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 插入新用户
        const result = await userDb.run(
            'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
            [ensureUtf8(username), hashedPassword, email || null]
        );
        
        const userId = result.lastID;
        
        // 创建一个默认的聊天会话
        const sessionResult = await userDb.run(
            'INSERT INTO chat_sessions (user_id, title) VALUES (?, ?)',
            [userId, ensureUtf8('新对话')]
        );
        
        const sessionId = sessionResult.lastID;
        
        // 添加欢迎消息
        const welcomeMessage = '您好！我是法律助手，请输入您的法律问题，我会尽力帮助您。';
        await userDb.run(
            'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)',
            [sessionId, 'assistant', ensureUtf8(welcomeMessage)]
        );
        
        // 生成JWT令牌
        const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '24h' });
        
        // 设置cookie - 根据请求来源自适应域名设置
        const cookieDomain = getCookieDomain(req);
        const cookieOptions = { 
            httpOnly: true, 
            maxAge: 24 * 60 * 60 * 1000,
            secure: req.secure || req.headers['x-forwarded-proto'] === 'https', // 在生产环境使用HTTPS
            sameSite: cookieDomain ? 'none' : 'lax' // 对外部域名使用 none, 本地开发用 lax
        };
        
        // 只在非本地环境下设置domain
        if (cookieDomain) {
            cookieOptions.domain = cookieDomain;
        }
        
        res.cookie('token', token, cookieOptions);
        
        res.status(201).json({ 
            message: '注册成功',
            user: { id: userId, username },
            token
        });
    } catch (error) {
        console.error('注册错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 登录路由
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码为必填项' });
        }
        
        // 查找用户
        const user = await userDb.get(
            'SELECT * FROM users WHERE username = ?',
            [ensureUtf8(username)]
        );
        
        if (!user) {
            return res.status(401).json({ error: '用户名或密码不正确' });
        }
        
        // 验证密码
        const isValid = await bcrypt.compare(password, user.password);
        
        if (!isValid) {
            return res.status(401).json({ error: '用户名或密码不正确' });
        }
        
        // 生成JWT令牌
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        
        // 设置cookie - 根据请求来源自适应域名设置
        const cookieDomain = getCookieDomain(req);
        const cookieOptions = { 
            httpOnly: true, 
            maxAge: 24 * 60 * 60 * 1000,
            secure: req.secure || req.headers['x-forwarded-proto'] === 'https', // 在生产环境使用HTTPS
            sameSite: cookieDomain ? 'none' : 'lax' // 对外部域名使用 none, 本地开发用 lax
        };
        
        // 只在非本地环境下设置domain
        if (cookieDomain) {
            cookieOptions.domain = cookieDomain;
        }
        
        res.cookie('token', token, cookieOptions);
        
        res.json({ 
            message: '登录成功',
            user: { id: user.id, username: user.username },
            token
        });
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 登出路由
app.post('/api/auth/logout', (req, res) => {
    const cookieDomain = getCookieDomain(req);
    const cookieOptions = { 
        httpOnly: true,
        secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
        sameSite: cookieDomain ? 'none' : 'lax'
    };
    
    if (cookieDomain) {
        cookieOptions.domain = cookieDomain;
    }
    
    res.clearCookie('token', cookieOptions);
    res.json({ message: '已成功登出' });
});

// 获取当前用户信息
app.get('/api/user', authenticateUser, (req, res) => {
    res.json({ 
        user: { id: req.user.id, username: req.user.username },
        token: req.cookies.token || req.headers.authorization?.split(' ')[1] // 返回token让客户端保存
    });
});

// 获取用户的聊天会话列表
app.get('/api/chat/sessions', authenticateUser, async (req, res) => {
    try {
        const sessions = await userDb.all(
            'SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY created_at DESC',
            [req.user.id]
        );
        
        res.json({ sessions });
    } catch (error) {
        console.error('获取会话列表错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 创建新的聊天会话
app.post('/api/chat/sessions', authenticateUser, async (req, res) => {
    try {
        const { title = '新对话', aiType = 'general' } = req.body;
        
        // 创建新会话，增加aiType字段
        const result = await userDb.run(
            'INSERT INTO chat_sessions (user_id, title, ai_type) VALUES (?, ?, ?)',
            [req.user.id, ensureUtf8(title), aiType]
        );
        
        const sessionId = result.lastID;
        
        // 根据AI类型选择不同的欢迎消息
        let welcomeMessage;
        switch (aiType) {
            case 'research':
                welcomeMessage = '您好！我是法律语言学研究助手。我专注于法律文本分析、法律术语研究和法律语篇结构探讨。您可以向我咨询法律语言的特征、修辞结构、术语演变以及跨法系的语言比较等学术问题。请提出您的研究问题，我将提供学术性的分析和见解。';
                break;
            case 'profession':
                welcomeMessage = '您好！我是专业法律顾问。我提供精准的法条引用、司法解释分析和专业法律意见。您可以向我咨询复杂案例分析、法律文书起草建议、立法动态以及疑难法律问题的解决思路。请描述您需要处理的法律问题，我将为您提供专业的法律分析和建议。';
                break;
            default: // public
                welcomeMessage = '您好！我是面向公众的法律助手。我使用通俗易懂的语言解释复杂的法律概念和流程。您可以向我咨询日常生活中的法律问题，如消费者权益、劳动关系、婚姻家庭等。请直接提出您的问题，我会尽量用简单明了的语言为您解答。';
        }
        
        // 添加欢迎消息
        await userDb.run(
            'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)',
            [sessionId, 'assistant', ensureUtf8(welcomeMessage)]
        );
        
        const session = await userDb.get(
            'SELECT * FROM chat_sessions WHERE id = ?',
            [sessionId]
        );
        
        res.status(201).json({ session });
    } catch (error) {
        console.error('创建会话错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取特定会话的消息
app.get('/api/chat/sessions/:sessionId/messages', authenticateUser, async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // 验证会话归属
        const session = await userDb.get(
            'SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?',
            [sessionId, req.user.id]
        );
        
        if (!session) {
            return res.status(404).json({ error: '会话不存在或无权访问' });
        }
        
        // 获取消息
        const messages = await userDb.all(
            'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC',
            [sessionId]
        );
        
        res.json({ messages });
    } catch (error) {
        console.error('获取消息错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取会话信息
app.get('/api/chat/sessions/:sessionId', authenticateUser, async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // 验证会话归属
        const session = await userDb.get(
            'SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?',
            [sessionId, req.user.id]
        );
        
        if (!session) {
            return res.status(404).json({ error: '会话不存在或无权访问' });
        }
        
        // 返回会话信息，包括AI类型
        res.json({ 
            session: {
                id: session.id,
                title: session.title,
                aiType: session.ai_type,
                created_at: session.created_at,
                // 其他可能需要的会话信息
            } 
        });
    } catch (error) {
        console.error('获取会话信息错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 更新会话标题
app.put('/api/chat/sessions/:sessionId', authenticateUser, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { title } = req.body;
        
        if (!title) {
            return res.status(400).json({ error: '标题为必填项' });
        }
        
        // 验证会话归属
        const session = await userDb.get(
            'SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?',
            [sessionId, req.user.id]
        );
        
        if (!session) {
            return res.status(404).json({ error: '会话不存在或无权访问' });
        }
        
        // 更新标题
        await userDb.run(
            'UPDATE chat_sessions SET title = ? WHERE id = ?',
            [ensureUtf8(title), sessionId]
        );
        
        res.json({ message: '标题已更新' });
    } catch (error) {
        console.error('更新标题错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 删除会话
app.delete('/api/chat/sessions/:sessionId', authenticateUser, async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        // 验证会话归属
        const session = await userDb.get(
            'SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?',
            [sessionId, req.user.id]
        );
        
        if (!session) {
            return res.status(404).json({ error: '会话不存在或无权访问' });
        }
        
        // 删除会话 (需要先删除关联的消息，因为SQLite对级联删除的支持有限)
        await userDb.run('BEGIN TRANSACTION');
        
        try {
            // 删除会话相关的消息
            await userDb.run(
                'DELETE FROM messages WHERE session_id = ?',
                [sessionId]
            );
            
            // 删除会话
            await userDb.run(
                'DELETE FROM chat_sessions WHERE id = ?',
                [sessionId]
            );
            
            await userDb.run('COMMIT');
        } catch (error) {
            await userDb.run('ROLLBACK');
            throw error;
        }
        
        res.json({ message: '会话已删除' });
    } catch (error) {
        console.error('删除会话错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// AI聊天 API 路由 - 修改以支持不同AI类型
app.post('/api/chat', authenticateUser, async (req, res) => {
    try {
        const { messages, sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ error: '会话ID为必填项' });
        }
        
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: '请提供有效的消息数组' });
        }
        
        // 验证会话归属，同时获取AI类型
        const session = await userDb.get(
            'SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?',
            [sessionId, req.user.id]
        );
        
        if (!session) {
            return res.status(404).json({ error: '会话不存在或无权访问' });
        }
        
        // 获取会话的AI类型
        const aiType = session.ai_type || 'general';
        
        // 保存用户消息到数据库
        const userMessage = messages[messages.length - 1];
        if (userMessage.role === 'user') {
            await userDb.run(
                'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)',
                [sessionId, 'user', ensureUtf8(userMessage.content)]
            );
        }
        
        // 根据AI类型选择不同的系统提示
        let systemPrompt;
        switch (aiType) {
            case 'research':
                systemPrompt = "您是一位专注于法律语言学研究的学术助手，精通法律术语、法律文本分析和法律语篇研究。您能够：1）分析法律文本的语言特征和修辞结构；2）探讨法律术语的词源和语义演变；3）比较不同法系和地区的法律语言差异；4）解读法律文本中的模糊性和歧义；5）分析判决书和立法文本的语篇结构和论证模式。请使用学术规范的表达方式，提供深入的法律语言学分析，并在回答中引用相关理论框架和研究方法。";
                break;
            case 'profession':
                systemPrompt = "您是一位面向法律专业人士的高级法律顾问，熟悉各类法律实务工作的专业需求。您能够：1）提供精准的法条引用和司法解释分析；2）协助起草和审核法律文书；3）分析复杂案例的法律适用问题；4）提供最新立法动态和司法实践趋势；5）探讨疑难法律问题的不同解决思路和风险防范策略。请使用专业法律术语和规范表述，提供具有实操价值的专业法律分析，支持法律从业者的日常工作需求。";
                break;
            default: // 'public'
                systemPrompt = "您是一位面向普通公众的亲民法律助手，专注于用通俗易懂的语言解释复杂的法律概念和流程。您能够：1）将法律专业术语转化为日常用语；2）解释与日常生活相关的法律问题（如消费者权益、劳动关系、婚姻家庭等）；3）提供基础法律流程指导；4）解答公众关心的常见法律疑问；5）帮助用户识别可能需要专业法律帮助的情况。请使用生活化的例子和通俗的表述，避免过多专业术语，确保普通用户能够理解您的回答。";
        }
        
        // 调用 DeepSeek API
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                ...messages
            ],
            model: "deepseek-chat",
        });
        
        const botMessage = completion.choices[0].message.content;
        
        // 保存助手回复到数据库
        await userDb.run(
            'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)',
            [sessionId, 'assistant', ensureUtf8(botMessage)]
        );
        
        // 明确设置Content-Type
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        
        // 返回结果
        res.json({
            message: botMessage,
            usage: completion.usage
        });
    } catch (error) {
        console.error('DeepSeek API 调用错误:', error);
        res.status(500).json({
            error: '服务器错误',
            message: error.message
        });
    }
});

// 流式聊天 API 路由 - 修改以支持不同AI类型
app.post('/api/chat/stream', authenticateUser, async (req, res) => {
    try {
        const { messages, sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ error: '会话ID为必填项' });
        }
        
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: '请提供有效的消息数组' });
        }
        
        // 验证会话归属，同时获取AI类型
        const session = await userDb.get(
            'SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?',
            [sessionId, req.user.id]
        );
        
        if (!session) {
            return res.status(404).json({ error: '会话不存在或无权访问' });
        }
        
        // 获取会话的AI类型
        const aiType = session.ai_type || 'general';
        
        // 保存用户消息到数据库
        const userMessage = messages[messages.length - 1];
        if (userMessage.role === 'user') {
            await userDb.run(
                'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)',
                [sessionId, 'user', ensureUtf8(userMessage.content)]
            );
        }
        
        // 根据AI类型选择不同的系统提示
        let systemPrompt;
        switch (aiType) {
            case 'research':
                systemPrompt = "您是一位专注于法律语言学研究的学术助手，精通法律术语、法律文本分析和法律语篇研究。您能够：1）分析法律文本的语言特征和修辞结构；2）探讨法律术语的词源和语义演变；3）比较不同法系和地区的法律语言差异；4）解读法律文本中的模糊性和歧义；5）分析判决书和立法文本的语篇结构和论证模式。请使用学术规范的表达方式，提供深入的法律语言学分析，并在回答中引用相关理论框架和研究方法。";
                break;
            case 'profession':
                systemPrompt = "您是一位面向法律专业人士的高级法律顾问，熟悉各类法律实务工作的专业需求。您能够：1）提供精准的法条引用和司法解释分析；2）协助起草和审核法律文书；3）分析复杂案例的法律适用问题；4）提供最新立法动态和司法实践趋势；5）探讨疑难法律问题的不同解决思路和风险防范策略。请使用专业法律术语和规范表述，提供具有实操价值的专业法律分析，支持法律从业者的日常工作需求。";
                break;
            default: // 'public'
                systemPrompt = "您是一位面向普通公众的亲民法律助手，专注于用通俗易懂的语言解释复杂的法律概念和流程。您能够：1）将法律专业术语转化为日常用语；2）解释与日常生活相关的法律问题（如消费者权益、劳动关系、婚姻家庭等）；3）提供基础法律流程指导；4）解答公众关心的常见法律疑问；5）帮助用户识别可能需要专业法律帮助的情况。请使用生活化的例子和通俗的表述，避免过多专业术语，确保普通用户能够理解您的回答。";
        }
        
        // 设置 SSE 响应头
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // 调用 DeepSeek API 流式响应
        const stream = await openai.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                ...messages
            ],
            model: "deepseek-chat",
            stream: true,
        });
        
        let completeResponse = '';
        
        // 处理流式响应
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            completeResponse += content;
            
            if (content) {
                // 确保发送的内容是有效的UTF-8
                res.write(`data: ${JSON.stringify({ content: ensureUtf8(content) })}\n\n`);
            }
        }
        
        // 保存完整响应到数据库
        await userDb.run(
            'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)',
            [sessionId, 'assistant', ensureUtf8(completeResponse)]
        );
        
        res.write('data: [DONE]\n\n');
        res.end();
    } catch (error) {
        console.error('DeepSeek API 流式调用错误:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});


// 定义存储文件的本地目录
const lawsDirectory = path.join(__dirname, 'law_categories'); // 确保目录存在
const filesDirectory= path.join(__dirname, 'law_txt'); // 确保目录存在

app.post('/law-content', (req, res) => {
    const { category, fileName } = req.body;
    
    let filePath;
    if (category) {
        // Construct the path to the file within the specific category
        filePath = path.join(lawsDirectory, category, `${fileName}.txt`);
    } else {
        // Construct the path to the file directly from law_txt directory
        filePath = path.join(filesDirectory, `${fileName}.txt`);
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('读取文件时出错:', err);
            return res.status(404).json({ error: '文件未找到或无法读取' });
        }

        // Send the file content back to the client
        res.json({ content: data });

    });
});

// Additional endpoint to list files by category
app.get('/list-files', (req, res) => {
    const { category } = req.query;

    let categoryDir;
    if (category) {
        // 构建类别目录路径
        categoryDir = path.join(lawsDirectory, category);
    } else {
        // 默认使用 law_txt 目录
        categoryDir = path.join(filesDirectory);
    }

    // 检查目录是否存在
    if (!fs.existsSync(categoryDir)) {
        console.error('目录不存在:', categoryDir);
        return res.status(404).json({ error: '目录不存在' });
    }

    fs.readdir(categoryDir, (err, files) => {
        if (err) {
            console.error('读取目录时出错:', err);
            return res.status(500).json({ error: '目录读取失败', details: err.message });
        }

        // 过滤出.txt文件并去掉扩展名
        const txtFiles = files.filter(file => file.endsWith('.txt')).map(file => file.slice(0, -4));
        res.json({ files: txtFiles });
    });
});

// 获取特定类别的表名
function getTableNamesByCategory(category, callback) {
    const sql = 'SELECT file_name FROM table_categories WHERE category_name = ?';
    db.all(sql, [category], (err, rows) => {
        if (err) {
            callback(err);
            return;
        }
        const tableNames = rows.map(row => row.file_name);
        callback(null, tableNames);
    });
}

// 获取所有表名的辅助函数
function getAllTableNames(callback) {
    const sql = `SELECT name FROM sqlite_master WHERE type='table' AND name <> 'sqlite_sequence' AND name <> 'table_categories'`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            callback(err);
            return;
        }
        const tableNames = rows.map(row => row.name);
        callback(null, tableNames);
    });
}

app.post('/search', (req, res) => {
    const { query, page = 1, limit = 100 } = req.body;
    const offset = (page - 1) * limit;

    // 解析查询字符串并确定格式
    const parts = query.split('+');

    // 判断是否为短语搜索（包含空格的词语）
    const isPhrase = parts[0].includes(' ');
    
    // 获取所有表名
    getAllTableNames((err, tableNames) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('获取表名失败');
            return;
        }

        let sqlParts = [];
        let paramsParts = [];
        let countSqlParts = [];
        let countParamsParts = [];

        tableNames.forEach((tableName) => {
            let sql, params, countSql, countParams;

            if (isPhrase) {
                // 处理短语搜索 - 例如 "民事 责任"
                const words = parts[0].split(' ');
                if (words.length === 2) {
                    // 两个词的短语
                    sql = `
                        SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos
                        FROM "${tableName}" a
                        JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                        WHERE a.word = ? AND b.word = ?
                    `;
                    params = [words[0], words[1]];
                    countSql = `
                        SELECT COUNT(*) as count
                        FROM "${tableName}" a
                        JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                        WHERE a.word = ? AND b.word = ?
                    `;
                    countParams = [words[0], words[1]];
                } else if (words.length === 3) {
                    // 三个词的短语
                    sql = `
                        SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos, c.word AS next_next_word, c.pos AS next_next_pos
                        FROM "${tableName}" a
                        JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                        JOIN "${tableName}" c ON b.rowid + 1 = c.rowid
                        WHERE a.word = ? AND b.word = ? AND c.word = ?
                    `;
                    params = [words[0], words[1], words[2]];
                    countSql = `
                        SELECT COUNT(*) as count
                        FROM "${tableName}" a
                        JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                        JOIN "${tableName}" c ON b.rowid + 1 = c.rowid
                        WHERE a.word = ? AND b.word = ? AND c.word = ?
                    `;
                    countParams = [words[0], words[1], words[2]];
                } else {
                    // 对于更长的短语，可以扩展这个模式
                    // 默认为简单词语搜索
                    const wordCondition = parts[0] ? `word LIKE ?` : '1=1';
                    // const wordCondition = word ? `word = ?` : '1=1';
                    sql = `
                        SELECT "${tableName}" AS tableName, rowid AS id, word
                        FROM "${tableName}"
                        WHERE ${wordCondition}
                    `;
                    params = parts[0] ? [`%${parts[0]}%`] : [];
                    countSql = `
                        SELECT COUNT(*) as count 
                        FROM "${tableName}"
                        WHERE ${wordCondition}
                    `;
                    countParams = parts[0] ? [`%${parts[0]}%`] : [];
                }
            } else if (parts.length === 2 && isPos(parts[0]) && !isPos(parts[1])) {
                // 格式：词性 + 词语
                const [pos, word] = parts;
                sql = `
                    SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                    WHERE a.pos = ? AND b.word = ?
                `;
                params = [pos, word];
                countSql = `
                    SELECT COUNT(*) as count
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                    WHERE a.pos = ? AND b.word = ?
                `;
                countParams = [pos, word];
            } else if (parts.length === 3) {
                if (isPos(parts[1]) && isPos(parts[2])) {
                    // 格式：词语 + 词性 + 词性
                    const [word, pos1, pos2] = parts;
                    sql = `
                        SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos, c.word AS next_next_word, c.pos AS next_next_pos
                        FROM "${tableName}" a
                        JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                        JOIN "${tableName}" c ON b.rowid + 1 = c.rowid
                        WHERE a.word = ? AND b.pos = ? AND c.pos = ?
                    `;
                    params = [word, pos1, pos2];
                    countSql = `
                        SELECT COUNT(*) as count
                        FROM "${tableName}" a
                        JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                        JOIN "${tableName}" c ON b.rowid + 1 = c.rowid
                        WHERE a.word = ? AND b.pos = ? AND c.pos = ?
                    `;
                    countParams = [word, pos1, pos2];
                }
            } else if (parts.length === 1 && isPos(parts[0])) {
                // 格式：单个词性
                const pos = parts[0];
                sql = `
                    SELECT "${tableName}" AS tableName, rowid AS id, word, pos 
                    FROM "${tableName}"
                    WHERE pos = ?
                `;
                params = [pos];
                countSql = `
                    SELECT COUNT(*) as count 
                    FROM "${tableName}"
                    WHERE pos = ?
                `;
                countParams = [pos];
            } else {
                // 默认格式：词语或词语 + 词性
                const [word, pos] = parts;
                if (pos) {
                    sql = `
                        SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos
                        FROM "${tableName}" a
                        JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                        WHERE a.word = ? AND b.pos = ?
                    `;
                    params = [word, pos];
                    countSql = `
                        SELECT COUNT(*) as count
                        FROM "${tableName}" a
                        JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                        WHERE a.word = ? AND b.pos = ?
                    `;
                    countParams = [word, pos];
                } else {
                    // const wordCondition = word ? `word LIKE ?` : '1=1';
                    const wordCondition = word ? `word = ?` : '1=1';
                    sql = `
                        SELECT "${tableName}" AS tableName, rowid AS id, word
                        FROM "${tableName}"
                        WHERE ${wordCondition}
                    `;
                    // params = word ? [`%${word}%`] : [];
                    params = word ? [word] : [];
                    countSql = `
                        SELECT COUNT(*) as count 
                        FROM "${tableName}"
                        WHERE ${wordCondition}
                    `;
                    // countParams = word ? [`%${word}%`] : [];
                    countParams = word ? [word] : [];
                }
            }

            sqlParts.push(sql);
            paramsParts.push(params);
            countSqlParts.push(countSql);
            countParamsParts.push(countParams);
        });

        // 剩余代码保持不变
        // 总的查询 SQL
        const totalSql = countSqlParts.join(' UNION ALL ');
        const totalParams = [].concat(...countParamsParts);

        // 执行总的计数查询
        db.all(totalSql, totalParams, (err, countRows) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('查询失败');
                return;
            }

            const totalCount = countRows.reduce((sum, row) => sum + row.count, 0);

            // 分页查询 SQL
            const unionSql = sqlParts.join(' UNION ALL ');

            // 在最终的 UNION ALL 查询上添加 LIMIT 和 OFFSET
            const finalSql = `
                ${unionSql}
                LIMIT ? OFFSET ?
            `;
            const finalParams = [].concat(...paramsParts, [limit, offset]);

            db.all(finalSql, finalParams, (err, rows) => {
                if (err) {
                    console.error(err.message);
                    res.status(500).send('查询失败');
                    return;
                }

                if (rows.length === 0) {
                    // 如果没有匹配结果
                    res.json({
                        results: [],
                        totalResults: 0,
                        currentPage: page,
                        totalPages: 0
                    });
                    return;
                }

                const contexts = [];

                const getContext = (tableName, id, targetWord, queryType, matchInfo, callback) => {
                    const contextSql = `
                        SELECT rowid AS id, word, pos 
                        FROM "${tableName}"
                        WHERE rowid >= ? AND rowid <= ?
                    `;
                    const contextParams = [id - 50, id + 50];

                    db.all(contextSql, contextParams, (err, contextRows) => {
                        if (err) {
                            console.error(err.message);
                            res.status(500).send('查询失败');
                            return;
                        }

                        // 初始化上下文字符串和高亮上下文
                        let context = '';
                        let highlightedContext = '';
                        let highlightedWords = '';

                        // 遍历 contextRows，将上下文拼接成字符串
                        for (let i = 0; i < contextRows.length; i++) {
                            const wordObj = contextRows[i];
                            let highlight = false;

                            // 判断是否需要高亮当前词语（精确到 ID）
                            switch (queryType) {
                                case 'word+pos':
                                    if ((wordObj.word === targetWord && wordObj.id === id) ||
                                        (wordObj.pos === matchInfo.pos && wordObj.id === id + 1)) {
                                        highlight = true;
                                    }
                                    break;
                                case 'pos+word':
                                    if ((wordObj.pos === matchInfo.pos && wordObj.id === id) ||
                                        (wordObj.id === id + 1)) {
                                        highlight = true;
                                    }
                                    break;
                                case 'word+pos+pos':
                                    if ((wordObj.word === targetWord && wordObj.id === id) ||
                                        (wordObj.pos === matchInfo.pos1 && wordObj.id === id + 1) ||
                                        (wordObj.pos === matchInfo.pos2 && wordObj.id === id + 2)) {
                                        highlight = true;
                                    }
                                    break;
                                case 'pos':
                                    if (wordObj.pos === matchInfo.pos && wordObj.id === id) {
                                        highlight = true;
                                    }
                                    break;
                                case 'phrase':
                                    // 处理短语高亮
                                    const phraseLength = matchInfo.words.length;
                                    for (let j = 0; j < phraseLength; j++) {
                                        if (wordObj.id === id + j) {
                                            highlight = true;
                                            break;
                                        }
                                    }
                                    break;
                                default:
                                    if (wordObj.word === targetWord && wordObj.id === id) {
                                        highlight = true;
                                    }
                            }

                            // 根据是否高亮拼接上下文
                            if (highlight) {
                                highlightedContext += `<mark>${wordObj.word}</mark> `;
                                highlightedWords += `${wordObj.word}`;
                            } else {
                                highlightedContext += `${wordObj.word}`;
                            }
                            context += `${wordObj.word}`;
                        }

                        callback(highlightedContext.trim(), highlightedWords);
                    });
                };

                let completed = 0;
                rows.forEach(row => {
                    let matchInfo = {};
                    let queryType = '';

                    if (isPhrase) {
                        const words = parts[0].split(' ');
                        matchInfo = { words: words };
                        queryType = 'phrase';
                    } else if (parts.length === 2 && isPos(parts[0])) {
                        matchInfo = { pos: parts[0] };
                        queryType = 'pos+word';
                    } else if (parts.length === 2) {
                        matchInfo = { pos: parts[1] };
                        queryType = 'word+pos';
                    } else if (parts.length === 3) {
                        matchInfo = { pos1: parts[1], pos2: parts[2] };
                        queryType = 'word+pos+pos';
                    } else if (parts.length === 1 && isPos(parts[0])) {
                        matchInfo = { pos: parts[0] };
                        queryType = 'pos';
                    } else {
                        queryType = 'word';
                    }

                    getContext(row.tableName, row.id, row.word, queryType, matchInfo, (highlightedContext, highlightedWords) => {
                        const result = {
                            word: row.word,
                            context: highlightedContext,
                            file: row.tableName,
                            highlightedWords: highlightedWords
                        };

                        if (queryType === 'word+pos' || queryType === 'word+pos+pos' || queryType === 'pos' || queryType === 'phrase'){
                            result.next_word = row.next_word;
                            result.next_pos = row.next_pos;
                        }

                        if (queryType === 'word+pos+pos') {
                            result.next_next_word = row.next_next_word;
                            result.next_next_pos = row.next_next_pos;
                        }

                        contexts.push(result);

                        completed += 1;
                        if (completed === rows.length) {
                            res.json({
                                results: contexts,
                                totalResults: totalCount,
                                currentPage: page,
                                totalPages: Math.ceil(totalCount / limit)
                            });
                        }
                    });
                });
            });
        });
    });
});

// app.post('/search-file', (req, res) => {
//     const { query, file, page = 1, limit = 100 } = req.body;
//     const offset = (page - 1) * limit;

//     // 解析查询字符串并确定格式
//     const parts = query.split('+');

//     // 如果没有指定文件名，返回错误
//     if (!file) {
//         res.status(400).send('请指定文件名');
//         return;
//     }

//     // 检查文件名是否存在
//     checkTableExists(file, (err, exists) => {
//         if (err) {
//             console.error(err.message);
//             res.status(500).send('检查表名失败');
//             return;
//         }

//         if (!exists) {
//             res.status(404).send(`文件 "${file}" 不存在`);
//             return;
//         }

//         let sql, params, countSql, countParams;
//         const tableName = file;

//         if (parts.length === 2 && isPos(parts[0]) && !isPos(parts[1])) {
//             // 格式：词性 + 词语
//             const [pos, word] = parts;
//             sql = `
//                 SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos
//                 FROM "${tableName}" a
//                 JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
//                 WHERE a.pos = ? AND b.word = ?
//             `;
//             params = [pos, word];
//             countSql = `
//                 SELECT COUNT(*) as count
//                 FROM "${tableName}" a
//                 JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
//                 WHERE a.pos = ? AND b.word = ?
//             `;
//             countParams = [pos, word];
//         } else if (parts.length === 3) {
//             if (isPos(parts[1]) && isPos(parts[2])) {
//                 // 格式：词语 + 词性 + 词性
//                 const [word, pos1, pos2] = parts;
//                 sql = `
//                     SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos, c.word AS next_next_word, c.pos AS next_next_pos
//                     FROM "${tableName}" a
//                     JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
//                     JOIN "${tableName}" c ON b.rowid + 1 = c.rowid
//                     WHERE a.word = ? AND b.pos = ? AND c.pos = ?
//                 `;
//                 params = [word, pos1, pos2];
//                 countSql = `
//                     SELECT COUNT(*) as count
//                     FROM "${tableName}" a
//                     JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
//                     JOIN "${tableName}" c ON b.rowid + 1 = c.rowid
//                     WHERE a.word = ? AND b.pos = ? AND c.pos = ?
//                 `;
//                 countParams = [word, pos1, pos2];
//             }
//         } else if (parts.length === 1 && isPos(parts[0])) {
//             // 格式：单个词性
//             const pos = parts[0];
//             sql = `
//                 SELECT "${tableName}" AS tableName, rowid AS id, word, pos 
//                 FROM "${tableName}"
//                 WHERE pos = ?
//             `;
//             params = [pos];
//             countSql = `
//                 SELECT COUNT(*) as count 
//                 FROM "${tableName}"
//                 WHERE pos = ?
//             `;
//             countParams = [pos];
//         } else {
//             // 默认格式：词语或词语 + 词性
//             const [word, pos] = parts;
//             if (pos) {
//                 sql = `
//                     SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos
//                     FROM "${tableName}" a
//                     JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
//                     WHERE a.word = ? AND b.pos = ?
//                 `;
//                 params = [word, pos];
//                 countSql = `
//                     SELECT COUNT(*) as count
//                     FROM "${tableName}" a
//                     JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
//                     WHERE a.word = ? AND b.pos = ?
//                 `;
//                 countParams = [word, pos];
//             } else {
//                 const wordCondition = word ? `word LIKE ?` : '1=1';
//                 sql = `
//                     SELECT "${tableName}" AS tableName, rowid AS id, word
//                     FROM "${tableName}"
//                     WHERE ${wordCondition}
//                 `;
//                 params = word ? [`%${word}%`] : [];
//                 countSql = `
//                     SELECT COUNT(*) as count 
//                     FROM "${tableName}"
//                     WHERE ${wordCondition}
//                 `;
//                 countParams = word ? [`%${word}%`] : [];
//             }
//         }

//         // 首先执行计数查询
//         db.get(countSql, countParams, (err, countRow) => {
//             if (err) {
//                 console.error(err.message);
//                 res.status(500).send('查询计数失败');
//                 return;
//             }

//             const totalCount = countRow.count;

//             // 添加分页限制
//             const paginatedSql = `
//                 ${sql}
//                 LIMIT ? OFFSET ?
//             `;
//             const paginatedParams = [...params, limit, offset];

//             // 执行主查询
//             db.all(paginatedSql, paginatedParams, (err, rows) => {
//                 if (err) {
//                     console.error(err.message);
//                     res.status(500).send('查询失败');
//                     return;
//                 }

//                 if (rows.length === 0) {
//                     // 如果没有匹配结果
//                     res.json({
//                         results: [],
//                         totalResults: 0,
//                         currentPage: page,
//                         totalPages: 0,
//                         file: tableName
//                     });
//                     return;
//                 }

//                 const contexts = [];
//                 let completed = 0;

//                 const getContext = (tableName, id, targetWord, queryType, matchInfo, callback) => {
//                     const contextSql = `
//                         SELECT rowid AS id, word, pos 
//                         FROM "${tableName}"
//                         WHERE rowid >= ? AND rowid <= ?
//                     `;
//                     const contextParams = [id - 50, id + 50];

//                     db.all(contextSql, contextParams, (err, contextRows) => {
//                         if (err) {
//                             console.error(err.message);
//                             res.status(500).send('查询失败');
//                             return;
//                         }

//                         // 初始化上下文字符串和高亮上下文
//                         let context = '';
//                         let highlightedContext = '';
//                         let highlightedWords = '';

//                         // 遍历 contextRows，将上下文拼接成字符串
//                         for (let i = 0; i < contextRows.length; i++) {
//                             const wordObj = contextRows[i];
//                             let highlight = false;

//                             // 判断是否需要高亮当前词语（精确到 ID）
//                             switch (queryType) {
//                                 case 'word+pos':
//                                     if ((wordObj.word === targetWord && wordObj.id === id) ||
//                                         (wordObj.pos === matchInfo.pos && wordObj.id === id + 1)) {
//                                         highlight = true;
//                                     }
//                                     break;
//                                 case 'pos+word':
//                                     if ((wordObj.pos === matchInfo.pos && wordObj.id === id) ||
//                                         (wordObj.id === id + 1)) {
//                                         highlight = true;
//                                     }
//                                     break;
//                                 case 'word+pos+pos':
//                                     if ((wordObj.word === targetWord && wordObj.id === id) ||
//                                         (wordObj.pos === matchInfo.pos1 && wordObj.id === id + 1) ||
//                                         (wordObj.pos === matchInfo.pos2 && wordObj.id === id + 2)) {
//                                         highlight = true;
//                                     }
//                                     break;
//                                 case 'pos':
//                                     if (wordObj.pos === matchInfo.pos && wordObj.id === id) {
//                                         highlight = true;
//                                     }
//                                     break;
//                                 default:
//                                     if (wordObj.word === targetWord && wordObj.id === id) {
//                                         highlight = true;
//                                     }
//                             }

//                             // 根据是否高亮拼接上下文
//                             if (highlight) {
//                                 highlightedContext += `<mark>${wordObj.word}</mark> `;
//                                 highlightedWords += `${wordObj.word}`;
//                             } else {
//                                 highlightedContext += `${wordObj.word}`;
//                             }
//                             context += `${wordObj.word}`;
//                         }

//                         callback(highlightedContext.trim(), highlightedWords);
//                     });
//                 };

//                 rows.forEach(row => {
//                     let matchInfo = {};
//                     let queryType = '';

//                     if (parts.length === 2 && isPos(parts[0])) {
//                         matchInfo = { pos: parts[0] };
//                         queryType = 'pos+word';
//                     } else if (parts.length === 2) {
//                         matchInfo = { pos: parts[1] };
//                         queryType = 'word+pos';
//                     } else if (parts.length === 3) {
//                         matchInfo = { pos1: parts[1], pos2: parts[2] };
//                         queryType = 'word+pos+pos';
//                     } else if (parts.length === 1 && isPos(parts[0])) {
//                         matchInfo = { pos: parts[0] };
//                         queryType = 'pos';
//                     } else {
//                         queryType = 'word';
//                     }

//                     getContext(row.tableName, row.id, row.word, queryType, matchInfo, (highlightedContext, highlightedWords) => {
//                         const result = {
//                             word: row.word,
//                             context: highlightedContext,
//                             file: row.tableName,
//                             highlightedWords: highlightedWords
//                         };

//                         if (queryType === 'word+pos' || queryType === 'word+pos+pos' || queryType === 'pos'){
//                             result.next_word = row.next_word;
//                             result.next_pos = row.next_pos;
//                         }

//                         if (queryType === 'word+pos+pos') {
//                             result.next_next_word = row.next_next_word;
//                             result.next_next_pos = row.next_next_pos;
//                         }

//                         contexts.push(result);

//                         completed += 1;
//                         if (completed === rows.length) {
//                             res.json({
//                                 results: contexts,
//                                 totalResults: totalCount,
//                                 currentPage: page,
//                                 totalPages: Math.ceil(totalCount / limit),
//                                 file: tableName
//                             });
//                         }
//                     });
//                 });
//             });
//         });
//     });
// });

app.post('/search-file', (req, res) => {
    const { query, file, page = 1, limit = 100 } = req.body;
    const offset = (page - 1) * limit;

    // 解析查询字符串并确定格式
    const parts = query.split('+');

    // 判断是否为短语搜索（包含空格的词语）
    const isPhrase = parts[0].includes(' ');

    // 如果没有指定文件名，返回错误
    if (!file) {
        res.status(400).send('请指定文件名');
        return;
    }

    // 检查文件名是否存在
    checkTableExists(file, (err, exists) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('检查表名失败');
            return;
        }

        if (!exists) {
            res.status(404).send(`文件 "${file}" 不存在`);
            return;
        }

        const tableName = file;
        let sql, params, countSql, countParams;

        if (isPhrase) {
            // 处理短语搜索 - 例如 "民事 责任"
            const words = parts[0].split(' ');
            if (words.length === 2) {
                // 两个词的短语
                sql = `
                    SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                    WHERE a.word = ? AND b.word = ?
                `;
                params = [words[0], words[1]];
                countSql = `
                    SELECT COUNT(*) as count
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                    WHERE a.word = ? AND b.word = ?
                `;
                countParams = [words[0], words[1]];
            } else if (words.length === 3) {
                // 三个词的短语
                sql = `
                    SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos, c.word AS next_next_word, c.pos AS next_next_pos
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                    JOIN "${tableName}" c ON b.rowid + 1 = c.rowid
                    WHERE a.word = ? AND b.word = ? AND c.word = ?
                `;
                params = [words[0], words[1], words[2]];
                countSql = `
                    SELECT COUNT(*) as count
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                    JOIN "${tableName}" c ON b.rowid + 1 = c.rowid
                    WHERE a.word = ? AND b.word = ? AND c.word = ?
                `;
                countParams = [words[0], words[1], words[2]];
            } else {
                // 默认为简单词语搜索 
                const wordCondition = parts[0] ? `word LIKE ?` : '1=1';
                sql = `
                    SELECT "${tableName}" AS tableName, rowid AS id, word
                    FROM "${tableName}"
                    WHERE ${wordCondition}
                `;
                params = parts[0] ? [`%${parts[0]}%`] : [];
                countSql = `
                    SELECT COUNT(*) as count 
                    FROM "${tableName}"
                    WHERE ${wordCondition}
                `;
                countParams = parts[0] ? [`%${parts[0]}%`] : [];
            }
        } else if (parts.length === 2 && isPos(parts[0]) && !isPos(parts[1])) {
            // 格式：词性 + 词语
            const [pos, word] = parts;
            sql = `
                SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos
                FROM "${tableName}" a
                JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                WHERE a.pos = ? AND b.word = ?
            `;
            params = [pos, word];
            countSql = `
                SELECT COUNT(*) as count
                FROM "${tableName}" a
                JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                WHERE a.pos = ? AND b.word = ?
            `;
            countParams = [pos, word];
        } else if (parts.length === 3) {
            if (isPos(parts[1]) && isPos(parts[2])) {
                // 格式：词语 + 词性 + 词性
                const [word, pos1, pos2] = parts;
                sql = `
                    SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos, c.word AS next_next_word, c.pos AS next_next_pos
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                    JOIN "${tableName}" c ON b.rowid + 1 = c.rowid
                    WHERE a.word = ? AND b.pos = ? AND c.pos = ?
                `;
                params = [word, pos1, pos2];
                countSql = `
                    SELECT COUNT(*) as count
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                    JOIN "${tableName}" c ON b.rowid + 1 = c.rowid
                    WHERE a.word = ? AND b.pos = ? AND c.pos = ?
                `;
                countParams = [word, pos1, pos2];
            }
        } else if (parts.length === 1 && isPos(parts[0])) {
            // 格式：单个词性
            const pos = parts[0];
            sql = `
                SELECT "${tableName}" AS tableName, rowid AS id, word, pos 
                FROM "${tableName}"
                WHERE pos = ?
            `;
            params = [pos];
            countSql = `
                SELECT COUNT(*) as count 
                FROM "${tableName}"
                WHERE pos = ?
            `;
            countParams = [pos];
        } else {
            // 默认格式：词语或词语 + 词性
            const [word, pos] = parts;
            if (pos) {
                sql = `
                    SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                    WHERE a.word = ? AND b.pos = ?
                `;
                params = [word, pos];
                countSql = `
                    SELECT COUNT(*) as count
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                    WHERE a.word = ? AND b.pos = ?
                `;
                countParams = [word, pos];
            } else {
                const wordCondition = word ? `word = ?` : '1=1';
                sql = `
                    SELECT "${tableName}" AS tableName, rowid AS id, word
                    FROM "${tableName}"
                    WHERE ${wordCondition}
                `;
                params = word ? [word] : [];
                countSql = `
                    SELECT COUNT(*) as count 
                    FROM "${tableName}"
                    WHERE ${wordCondition}
                `;
                countParams = word ? [word] : [];
            }
        }

        // 首先执行计数查询
        db.get(countSql, countParams, (err, countRow) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('查询计数失败');
                return;
            }

            const totalCount = countRow.count;

            // 添加分页限制
            const paginatedSql = `
                ${sql}
                LIMIT ? OFFSET ?
            `;
            const paginatedParams = [...params, limit, offset];

            // 执行主查询
            db.all(paginatedSql, paginatedParams, (err, rows) => {
                if (err) {
                    console.error(err.message);
                    res.status(500).send('查询失败');
                    return;
                }

                if (rows.length === 0) {
                    // 如果没有匹配结果
                    res.json({
                        results: [],
                        totalResults: 0,
                        currentPage: page,
                        totalPages: 0,
                        file: tableName
                    });
                    return;
                }

                const contexts = [];
                let completed = 0;

                const getContext = (tableName, id, targetWord, queryType, matchInfo, callback) => {
                    const contextSql = `
                        SELECT rowid AS id, word, pos 
                        FROM "${tableName}"
                        WHERE rowid >= ? AND rowid <= ?
                    `;
                    const contextParams = [id - 50, id + 50];

                    db.all(contextSql, contextParams, (err, contextRows) => {
                        if (err) {
                            console.error(err.message);
                            res.status(500).send('查询失败');
                            return;
                        }

                        // 初始化上下文字符串和高亮上下文
                        let context = '';
                        let highlightedContext = '';
                        let highlightedWords = '';

                        // 遍历 contextRows，将上下文拼接成字符串
                        for (let i = 0; i < contextRows.length; i++) {
                            const wordObj = contextRows[i];
                            let highlight = false;

                            // 判断是否需要高亮当前词语（精确到 ID）
                            switch (queryType) {
                                case 'word+pos':
                                    if ((wordObj.word === targetWord && wordObj.id === id) ||
                                        (wordObj.pos === matchInfo.pos && wordObj.id === id + 1)) {
                                        highlight = true;
                                    }
                                    break;
                                case 'pos+word':
                                    if ((wordObj.pos === matchInfo.pos && wordObj.id === id) ||
                                        (wordObj.id === id + 1)) {
                                        highlight = true;
                                    }
                                    break;
                                case 'word+pos+pos':
                                    if ((wordObj.word === targetWord && wordObj.id === id) ||
                                        (wordObj.pos === matchInfo.pos1 && wordObj.id === id + 1) ||
                                        (wordObj.pos === matchInfo.pos2 && wordObj.id === id + 2)) {
                                        highlight = true;
                                    }
                                    break;
                                case 'pos':
                                    if (wordObj.pos === matchInfo.pos && wordObj.id === id) {
                                        highlight = true;
                                    }
                                    break;
                                case 'phrase':
                                    // 处理短语高亮
                                    const phraseLength = matchInfo.words.length;
                                    for (let j = 0; j < phraseLength; j++) {
                                        if (wordObj.id === id + j) {
                                            highlight = true;
                                            break;
                                        }
                                    }
                                    break;
                                default:
                                    if (wordObj.word === targetWord && wordObj.id === id) {
                                        highlight = true;
                                    }
                            }

                            // 根据是否高亮拼接上下文
                            if (highlight) {
                                highlightedContext += `<mark>${wordObj.word}</mark> `;
                                highlightedWords += `${wordObj.word}`;
                            } else {
                                highlightedContext += `${wordObj.word}`;
                            }
                            context += `${wordObj.word}`;
                        }

                        callback(highlightedContext.trim(), highlightedWords);
                    });
                };

                rows.forEach(row => {
                    let matchInfo = {};
                    let queryType = '';

                    if (isPhrase) {
                        const words = parts[0].split(' ');
                        matchInfo = { words: words };
                        queryType = 'phrase';
                    } else if (parts.length === 2 && isPos(parts[0])) {
                        matchInfo = { pos: parts[0] };
                        queryType = 'pos+word';
                    } else if (parts.length === 2) {
                        matchInfo = { pos: parts[1] };
                        queryType = 'word+pos';
                    } else if (parts.length === 3) {
                        matchInfo = { pos1: parts[1], pos2: parts[2] };
                        queryType = 'word+pos+pos';
                    } else if (parts.length === 1 && isPos(parts[0])) {
                        matchInfo = { pos: parts[0] };
                        queryType = 'pos';
                    } else {
                        queryType = 'word';
                    }

                    getContext(row.tableName, row.id, row.word, queryType, matchInfo, (highlightedContext, highlightedWords) => {
                        const result = {
                            word: row.word,
                            context: highlightedContext,
                            file: row.tableName,
                            highlightedWords: highlightedWords
                        };

                        if (queryType === 'word+pos' || queryType === 'word+pos+pos' || queryType === 'pos' || queryType === 'phrase'){
                            result.next_word = row.next_word;
                            result.next_pos = row.next_pos;
                        }

                        if (queryType === 'word+pos+pos') {
                            result.next_next_word = row.next_next_word;
                            result.next_next_pos = row.next_next_pos;
                        }

                        contexts.push(result);

                        completed += 1;
                        if (completed === rows.length) {
                            res.json({
                                results: contexts,
                                totalResults: totalCount,
                                currentPage: page,
                                totalPages: Math.ceil(totalCount / limit),
                                file: tableName
                            });
                        }
                    });
                });
            });
        });
    });
});

// 辅助函数：检查表是否存在
function checkTableExists(tableName, callback) {
    const sql = `SELECT name FROM sqlite_master WHERE type='table' AND name=?`;
    db.get(sql, [tableName], (err, row) => {
        if (err) {
            callback(err, false);
            return;
        }
        callback(null, !!row);
    });
}

app.post('/fetchAllResults', (req, res) => {
    const { query } = req.body;

    // 解析查询字符串并确定格式
    const parts = query.split('+');

    // 获取所有表名
    getAllTableNames((err, tableNames) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('获取表名失败');
            return;
        }

        let sqlParts = [];
        let paramsParts = [];
        let countSqlParts = [];
        let countParamsParts = [];

        tableNames.forEach((tableName) => {
            let sql, params, countSql, countParams;

            if (parts.length === 2 && isPos(parts[0]) && !isPos(parts[1])) {
                // 格式：词性 + 词语
                const [pos, word] = parts;
                sql = `
                    SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                    WHERE a.pos = ? AND b.word = ?
                `;
                params = [pos, word];
                countSql = `
                    SELECT COUNT(*) as count
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                    WHERE a.pos = ? AND b.word = ?
                `;
                countParams = [pos, word];
            } else if (parts.length === 3) {
                if (isPos(parts[1]) && isPos(parts[2])) {
                    // 格式：词语 + 词性 + 词性
                    const [word, pos1, pos2] = parts;
                    sql = `
                        SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos, c.word AS next_next_word, c.pos AS next_next_pos
                        FROM "${tableName}" a
                        JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                        JOIN "${tableName}" c ON b.rowid + 1 = c.rowid
                        WHERE a.word = ? AND b.pos = ? AND c.pos = ?
                    `;
                    params = [word, pos1, pos2];
                    countSql = `
                        SELECT COUNT(*) as count
                        FROM "${tableName}" a
                        JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                        JOIN "${tableName}" c ON b.rowid + 1 = c.rowid
                        WHERE a.word = ? AND b.pos = ? AND c.pos = ?
                    `;
                    countParams = [word, pos1, pos2];
                }
            } else if (parts.length === 1 && isPos(parts[0])) {
                // 格式：单个词性
                const pos = parts[0];
                sql = `
                    SELECT "${tableName}" AS tableName, rowid AS id, word, pos 
                    FROM "${tableName}"
                    WHERE pos = ?
                `;
                params = [pos];
                countSql = `
                    SELECT COUNT(*) as count 
                    FROM "${tableName}"
                    WHERE pos = ?
                `;
                countParams = [pos];
            } else {
                // 默认格式：词语或词语 + 词性
                const [word, pos] = parts;
                if (pos) {
                    sql = `
                        SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos
                        FROM "${tableName}" a
                        JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                        WHERE a.word = ? AND b.pos = ?
                    `;
                    params = [word, pos];
                    countSql = `
                        SELECT COUNT(*) as count
                        FROM "${tableName}" a
                        JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                        WHERE a.word = ? AND b.pos = ?
                    `;
                    countParams = [word, pos];
                } else {
                    const wordCondition = word ? `word LIKE ?` : '1=1';
                    sql = `
                        SELECT "${tableName}" AS tableName, rowid AS id, word
                        FROM "${tableName}"
                        WHERE ${wordCondition}
                    `;
                    params = word ? [`%${word}%`] : [];
                    countSql = `
                        SELECT COUNT(*) as count 
                        FROM "${tableName}"
                        WHERE ${wordCondition}
                    `;
                    countParams = word ? [`%${word}%`] : [];
                }
            }

            sqlParts.push(sql);
            paramsParts.push(params);
            countSqlParts.push(countSql);
            countParamsParts.push(countParams);
        });

        // 总的查询 SQL
        const totalSql = countSqlParts.join(' UNION ALL ');
        const totalParams = [].concat(...countParamsParts);

        // 执行总的计数查询
        db.all(totalSql, totalParams, (err, countRows) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('查询失败');
                return;
            }

            const totalCount = countRows.reduce((sum, row) => sum + row.count, 0);

            // 因为我们要获取所有结果，所以这里不使用分页
            const unionSql = sqlParts.join(' UNION ALL ');

            const finalSql = `${unionSql}`;
            const finalParams = [].concat(...paramsParts);

            db.all(finalSql, finalParams, (err, rows) => {
                if (err) {
                    console.error(err.message);
                    res.status(500).send('查询失败');
                    return;
                }

                if (rows.length === 0) {
                    // 如果没有匹配结果
                    res.json({
                        results: [],
                        totalResults: 0
                    });
                    return;
                }

                const contexts = [];

                const getContext = (tableName, id, targetWord, queryType, matchInfo, callback) => {
                    const contextSql = `
                        SELECT rowid AS id, word, pos 
                        FROM "${tableName}"
                        WHERE rowid >= ? AND rowid <= ?
                    `;
                    const contextParams = [id - 50, id + 50];

                    db.all(contextSql, contextParams, (err, contextRows) => {
                        if (err) {
                            console.error(err.message);
                            res.status(500).send('查询失败');
                            return;
                        }

                        // 初始化上下文字符串和高亮上下文
                        let highlightedWords = '';
                        let marked = false;
                        // 遍历 contextRows，将上下文拼接成字符串
                        for (let i = 0; i < contextRows.length; i++) {
                            const wordObj = contextRows[i];
                            let highlight = false;

                            // 判断是否需要高亮当前词语（精确到 ID）
                            switch (queryType) {
                                case 'word+pos':
                                    if ((wordObj.word === targetWord && wordObj.id === id) ||
                                        (wordObj.pos === matchInfo.pos && wordObj.id === id + 1)) {
                                        highlight = true;
                                        marked = true;
                                    }
                                    break;
                                case 'pos+word':
                                    if ((wordObj.pos === matchInfo.pos && wordObj.id === id) ||
                                        (wordObj.id === id + 1)) {
                                        highlight = true;
                                        marked = true;
                                    }
                                    break;
                                case 'word+pos+pos':
                                    if ((wordObj.word === targetWord && wordObj.id === id) ||
                                        (wordObj.pos === matchInfo.pos1 && wordObj.id === id + 1) ||
                                        (wordObj.pos === matchInfo.pos2 && wordObj.id === id + 2)) {
                                        highlight = true;
                                        marked = true;
                                    }
                                    break;
                                case 'pos':
                                    if (wordObj.pos === matchInfo.pos && wordObj.id === id) {
                                        highlight = true;
                                        marked = true;
                                    }
                                    break;
                                default:
                                    if (wordObj.word === targetWord && wordObj.id === id) {
                                        highlight = true;
                                        marked = true;
                                    }
                            }

                            // 根据是否高亮拼接上下文
                            if (highlight) {
                                highlightedWords += `${wordObj.word}`;
                            } else {
                                if(marked) break;
                            }
                        }

                        callback(highlightedWords);
                    });
                };

                let completed = 0;
                rows.forEach(row => {
                    let matchInfo = {};
                    let queryType = '';

                    if (parts.length === 2 && isPos(parts[0])) {
                        matchInfo = { pos: parts[0] };
                        queryType = 'pos+word';
                    } else if (parts.length === 2) {
                        matchInfo = { pos: parts[1] };
                        queryType = 'word+pos';
                    } else if (parts.length === 3) {
                        matchInfo = { pos1: parts[1], pos2: parts[2] };
                        queryType = 'word+pos+pos';
                    } else if (parts.length === 1 && isPos(parts[0])) {
                        matchInfo = { pos: parts[0] };
                        queryType = 'pos';
                    } else {
                        queryType = 'word';
                    }

                    getContext(row.tableName, row.id, row.word, queryType, matchInfo, (highlightedWords) => {
                        const result = {
                            word: row.word,
                            file: row.tableName,
                            highlightedWords: highlightedWords
                        };

                        if (queryType === 'word+pos' || queryType === 'word+pos+pos' || queryType === 'pos') {
                            result.next_word = row.next_word;
                            result.next_pos = row.next_pos;
                        }

                        if (queryType === 'word+pos+pos') {
                            result.next_next_word = row.next_next_word;
                            result.next_next_pos = row.next_next_pos;
                        }

                        contexts.push(result);

                        completed += 1;
                        if (completed === rows.length) {
                            res.json({
                                results: contexts,
                                totalResults: totalCount
                            });
                        }
                    });
                });
            });
        });
    });
});

app.post('/fetchSomeResults', (req, res) => {
    const { query, category } = req.body; // 包括类别参数

    // 解析查询字符串并确定格式
    const parts = query.split('+');

    // 获取特定类别的表名
    getTableNamesByCategory(category, (err, tableNames) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('获取表名失败');
            return;
        }

        if (tableNames.length === 0) {
            res.json({ results: [], totalResults: 0 });
            return;
        }

        let sqlParts = [];
        let paramsParts = [];
        let countSqlParts = [];
        let countParamsParts = [];

        tableNames.forEach((tableName) => {
            let sql, params, countSql, countParams;

            if (parts.length === 2 && isPos(parts[0]) && !isPos(parts[1])) {
                // 格式：词性 + 词语
                const [pos, word] = parts;
                sql = `
                    SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                    WHERE a.pos = ? AND b.word = ?
                `;
                params = [pos, word];
                countSql = `
                    SELECT COUNT(*) as count
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                    WHERE a.pos = ? AND b.word = ?
                `;
                countParams = [pos, word];
            } else if (parts.length === 3) {
                if (isPos(parts[1]) && isPos(parts[2])) {
                    // 格式：词语 + 词性 + 词性
                    const [word, pos1, pos2] = parts;
                    sql = `
                        SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos, c.word AS next_next_word, c.pos AS next_next_pos
                        FROM "${tableName}" a
                        JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                        JOIN "${tableName}" c ON b.rowid + 1 = c.rowid
                        WHERE a.word = ? AND b.pos = ? AND c.pos = ?
                    `;
                    params = [word, pos1, pos2];
                    countSql = `
                        SELECT COUNT(*) as count
                        FROM "${tableName}" a
                        JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                        JOIN "${tableName}" c ON b.rowid + 1 = c.rowid
                        WHERE a.word = ? AND b.pos = ? AND c.pos = ?
                    `;
                    countParams = [word, pos1, pos2];
                }
            } else if (parts.length === 1 && isPos(parts[0])) {
                // 格式：单个词性
                const pos = parts[0];
                sql = `
                    SELECT "${tableName}" AS tableName, rowid AS id, word, pos 
                    FROM "${tableName}"
                    WHERE pos = ?
                `;
                params = [pos];
                countSql = `
                    SELECT COUNT(*) as count 
                    FROM "${tableName}"
                    WHERE pos = ?
                `;
                countParams = [pos];
            } else {
                // 默认格式：词语或词语 + 词性
                const [word, pos] = parts;
                if (pos) {
                    sql = `
                        SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos
                        FROM "${tableName}" a
                        JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                        WHERE a.word = ? AND b.pos = ?
                    `;
                    params = [word, pos];
                    countSql = `
                        SELECT COUNT(*) as count
                        FROM "${tableName}" a
                        JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                        WHERE a.word = ? AND b.pos = ?
                    `;
                    countParams = [word, pos];
                } else {
                    const wordCondition = word ? `word LIKE ?` : '1=1';
                    sql = `
                        SELECT "${tableName}" AS tableName, rowid AS id, word
                        FROM "${tableName}"
                        WHERE ${wordCondition}
                    `;
                    params = word ? [`%${word}%`] : [];
                    countSql = `
                        SELECT COUNT(*) as count 
                        FROM "${tableName}"
                        WHERE ${wordCondition}
                    `;
                    countParams = word ? [`%${word}%`] : [];
                }
            }

            sqlParts.push(sql);
            paramsParts.push(params);
            countSqlParts.push(countSql);
            countParamsParts.push(countParams);
        });

        // 总的查询 SQL
        const totalSql = countSqlParts.join(' UNION ALL ');
        const totalParams = [].concat(...countParamsParts);

        // 执行总的计数查询
        db.all(totalSql, totalParams, (err, countRows) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('查询失败');
                return;
            }

            const totalCount = countRows.reduce((sum, row) => sum + row.count, 0);

            // 因为我们要获取所有结果，所以这里不使用分页
            const unionSql = sqlParts.join(' UNION ALL ');

            const finalSql = `${unionSql}`;
            const finalParams = [].concat(...paramsParts);

            db.all(finalSql, finalParams, (err, rows) => {
                if (err) {
                    console.error(err.message);
                    res.status(500).send('查询失败');
                    return;
                }

                if (rows.length === 0) {
                    // 如果没有匹配结果
                    res.json({
                        results: [],
                        totalResults: 0
                    });
                    return;
                }

                const contexts = [];

                const getContext = (tableName, id, targetWord, queryType, matchInfo, callback) => {
                    const contextSql = `
                        SELECT rowid AS id, word, pos 
                        FROM "${tableName}"
                        WHERE rowid >= ? AND rowid <= ?
                    `;
                    const contextParams = [id - 50, id + 50];

                    db.all(contextSql, contextParams, (err, contextRows) => {
                        if (err) {
                            console.error(err.message);
                            res.status(500).send('查询失败');
                            return;
                        }

                        // 初始化上下文字符串和高亮上下文
                        let highlightedWords = '';
                        let marked = false;
                        // 遍历 contextRows，将上下文拼接成字符串
                        for (let i = 0; i < contextRows.length; i++) {
                            const wordObj = contextRows[i];
                            let highlight = false;

                            // 判断是否需要高亮当前词语（精确到 ID）
                            switch (queryType) {
                                case 'word+pos':
                                    if ((wordObj.word === targetWord && wordObj.id === id) ||
                                        (wordObj.pos === matchInfo.pos && wordObj.id === id + 1)) {
                                        highlight = true;
                                        marked = true;
                                    }
                                    break;
                                case 'pos+word':
                                    if ((wordObj.pos === matchInfo.pos && wordObj.id === id) ||
                                        (wordObj.id === id + 1)) {
                                        highlight = true;
                                        marked = true;
                                    }
                                    break;
                                case 'word+pos+pos':
                                    if ((wordObj.word === targetWord && wordObj.id === id) ||
                                        (wordObj.pos === matchInfo.pos1 && wordObj.id === id + 1) ||
                                        (wordObj.pos === matchInfo.pos2 && wordObj.id === id + 2)) {
                                        highlight = true;
                                        marked = true;
                                    }
                                    break;
                                case 'pos':
                                    if (wordObj.pos === matchInfo.pos && wordObj.id === id) {
                                        highlight = true;
                                        marked = true;
                                    }
                                    break;
                                default:
                                    if (wordObj.word === targetWord && wordObj.id === id) {
                                        highlight = true;
                                        marked = true;
                                    }
                            }

                            // 根据是否高亮拼接上下文
                            if (highlight) {
                                highlightedWords += `${wordObj.word}`;
                            } else {
                                if(marked) break;
                            }
                        }

                        callback(highlightedWords);
                    });
                };

                let completed = 0;
                rows.forEach(row => {
                    let matchInfo = {};
                    let queryType = '';

                    if (parts.length === 2 && isPos(parts[0])) {
                        matchInfo = { pos: parts[0] };
                        queryType = 'pos+word';
                    } else if (parts.length === 2) {
                        matchInfo = { pos: parts[1] };
                        queryType = 'word+pos';
                    } else if (parts.length === 3) {
                        matchInfo = { pos1: parts[1], pos2: parts[2] };
                        queryType = 'word+pos+pos';
                    } else if (parts.length === 1 && isPos(parts[0])) {
                        matchInfo = { pos: parts[0] };
                        queryType = 'pos';
                    } else {
                        queryType = 'word';
                    }

                    getContext(row.tableName, row.id, row.word, queryType, matchInfo, (highlightedWords) => {
                        const result = {
                            word: row.word,
                            file: row.tableName,
                            highlightedWords: highlightedWords
                        };

                        if (queryType === 'word+pos' || queryType === 'word+pos+pos' || queryType === 'pos') {
                            result.next_word = row.next_word;
                            result.next_pos = row.next_pos;
                        }

                        if (queryType === 'word+pos+pos') {
                            result.next_next_word = row.next_next_word;
                            result.next_next_pos = row.next_next_pos;
                        }

                        contexts.push(result);

                        completed += 1;
                        if (completed === rows.length) {
                            res.json({
                                results: contexts,
                                totalResults: totalCount
                            });
                        }
                    });
                });

            });
        });
    });
});

app.post('/fetchSingleResults', (req, res) => {
    const { query, file } = req.body;

    // 检查是否提供了文件名
    if (!file) {
        res.status(400).send('请指定文件名');
        return;
    }

    // 解析查询字符串并确定格式
    const parts = query.split('+');

    // 只使用指定的文件名作为表名
    const tableName = file;

    let sql, params, countSql, countParams;

    if (parts.length === 2 && isPos(parts[0]) && !isPos(parts[1])) {
        // 格式：词性 + 词语
        const [pos, word] = parts;
        sql = `
            SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos
            FROM "${tableName}" a
            JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
            WHERE a.pos = ? AND b.word = ?
        `;
        params = [pos, word];
        countSql = `
            SELECT COUNT(*) as count
            FROM "${tableName}" a
            JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
            WHERE a.pos = ? AND b.word = ?
        `;
        countParams = [pos, word];
    } else if (parts.length === 3) {
        if (isPos(parts[1]) && isPos(parts[2])) {
            // 格式：词语 + 词性 + 词性
            const [word, pos1, pos2] = parts;
            sql = `
                SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos, c.word AS next_next_word, c.pos AS next_next_pos
                FROM "${tableName}" a
                JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                JOIN "${tableName}" c ON b.rowid + 1 = c.rowid
                WHERE a.word = ? AND b.pos = ? AND c.pos = ?
            `;
            params = [word, pos1, pos2];
            countSql = `
                SELECT COUNT(*) as count
                FROM "${tableName}" a
                JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                JOIN "${tableName}" c ON b.rowid + 1 = c.rowid
                WHERE a.word = ? AND b.pos = ? AND c.pos = ?
            `;
            countParams = [word, pos1, pos2];
        }
    } else if (parts.length === 1 && isPos(parts[0])) {
        // 格式：单个词性
        const pos = parts[0];
        sql = `
            SELECT "${tableName}" AS tableName, rowid AS id, word, pos 
            FROM "${tableName}"
            WHERE pos = ?
        `;
        params = [pos];
        countSql = `
            SELECT COUNT(*) as count 
            FROM "${tableName}"
            WHERE pos = ?
        `;
        countParams = [pos];
    } else {
        // 默认格式：词语或词语 + 词性
        const [word, pos] = parts;
        if (pos) {
            sql = `
                SELECT "${tableName}" AS tableName, a.rowid AS id, a.word, a.pos, b.word AS next_word, b.pos AS next_pos
                FROM "${tableName}" a
                JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                WHERE a.word = ? AND b.pos = ?
            `;
            params = [word, pos];
            countSql = `
                SELECT COUNT(*) as count
                FROM "${tableName}" a
                JOIN "${tableName}" b ON a.rowid + 1 = b.rowid
                WHERE a.word = ? AND b.pos = ?
            `;
            countParams = [word, pos];
        } else {
            const wordCondition = word ? `word LIKE ?` : '1=1';
            sql = `
                SELECT "${tableName}" AS tableName, rowid AS id, word, pos
                FROM "${tableName}"
                WHERE ${wordCondition}
            `;
            params = word ? [`%${word}%`] : [];
            countSql = `
                SELECT COUNT(*) as count 
                FROM "${tableName}"
                WHERE ${wordCondition}
            `;
            countParams = word ? [`%${word}%`] : [];
        }
    }

    // 执行计数查询
    db.get(countSql, countParams, (err, countRow) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('查询失败');
            return;
        }

        const totalCount = countRow ? countRow.count : 0;

        // 执行主查询
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('查询失败');
                return;
            }

            if (rows.length === 0) {
                // 如果没有匹配结果
                res.json({
                    results: [],
                    totalResults: 0
                });
                return;
            }

            const contexts = [];

            const getContext = (tableName, id, targetWord, queryType, matchInfo, callback) => {
                const contextSql = `
                    SELECT rowid AS id, word, pos 
                    FROM "${tableName}"
                    WHERE rowid >= ? AND rowid <= ?
                `;
                const contextParams = [id - 50, id + 50];

                db.all(contextSql, contextParams, (err, contextRows) => {
                    if (err) {
                        console.error(err.message);
                        res.status(500).send('查询失败');
                        return;
                    }

                    // 初始化上下文字符串和高亮上下文
                    let highlightedWords = '';
                    let marked = false;
                    // 遍历 contextRows，将上下文拼接成字符串
                    for (let i = 0; i < contextRows.length; i++) {
                        const wordObj = contextRows[i];
                        let highlight = false;

                        // 判断是否需要高亮当前词语（精确到 ID）
                        switch (queryType) {
                            case 'word+pos':
                                if ((wordObj.word === targetWord && wordObj.id === id) ||
                                    (wordObj.pos === matchInfo.pos && wordObj.id === id + 1)) {
                                    highlight = true;
                                    marked = true;
                                }
                                break;
                            case 'pos+word':
                                if ((wordObj.pos === matchInfo.pos && wordObj.id === id) ||
                                    (wordObj.id === id + 1)) {
                                    highlight = true;
                                    marked = true;
                                }
                                break;
                            case 'word+pos+pos':
                                if ((wordObj.word === targetWord && wordObj.id === id) ||
                                    (wordObj.pos === matchInfo.pos1 && wordObj.id === id + 1) ||
                                    (wordObj.pos === matchInfo.pos2 && wordObj.id === id + 2)) {
                                    highlight = true;
                                    marked = true;
                                }
                                break;
                            case 'pos':
                                if (wordObj.pos === matchInfo.pos && wordObj.id === id) {
                                    highlight = true;
                                    marked = true;
                                }
                                break;
                            default:
                                if (wordObj.word === targetWord && wordObj.id === id) {
                                    highlight = true;
                                    marked = true;
                                }
                        }

                        // 根据是否高亮拼接上下文
                        if (highlight) {
                            highlightedWords += `${wordObj.word}`;
                        } else {
                            if(marked) break;
                        }
                    }

                    callback(highlightedWords);
                });
            };

            let completed = 0;
            rows.forEach(row => {
                let matchInfo = {};
                let queryType = '';

                if (parts.length === 2 && isPos(parts[0])) {
                    matchInfo = { pos: parts[0] };
                    queryType = 'pos+word';
                } else if (parts.length === 2) {
                    matchInfo = { pos: parts[1] };
                    queryType = 'word+pos';
                } else if (parts.length === 3) {
                    matchInfo = { pos1: parts[1], pos2: parts[2] };
                    queryType = 'word+pos+pos';
                } else if (parts.length === 1 && isPos(parts[0])) {
                    matchInfo = { pos: parts[0] };
                    queryType = 'pos';
                } else {
                    queryType = 'word';
                }

                getContext(row.tableName, row.id, row.word, queryType, matchInfo, (highlightedWords) => {
                    const result = {
                        word: row.word,
                        file: row.tableName,
                        highlightedWords: highlightedWords
                    };

                    if (queryType === 'word+pos' || queryType === 'word+pos+pos' || queryType === 'pos') {
                        result.next_word = row.next_word;
                        result.next_pos = row.next_pos;
                    }

                    if (queryType === 'word+pos+pos') {
                        result.next_next_word = row.next_next_word;
                        result.next_next_pos = row.next_next_pos;
                    }

                    contexts.push(result);

                    completed += 1;
                    if (completed === rows.length) {
                        res.json({
                            results: contexts,
                            totalResults: totalCount
                        });
                    }
                });
            });
        });
    });
});

// 辅助函数，判断输入是否为词性
function isPos(input) {
    // 这里定义你的词性列表，根据需求修改
    const posList = ['ns', 'n', 'wp', 'nt', 'v', 'j', 'm', 'q', 'b', 'a', 'p', 'u', 'c', 'r', 'ni', 'd', 'i', 'nd', 'nl', 'nz', 'nh', 'h', 'z', 'k'];
    return posList.includes(input);
}



// 获取所有表名的辅助函数2
function getAllTableNames2(callback) {
    const sql = `SELECT name FROM sqlite_master WHERE type='table' AND name <> 'sqlite_sequence' AND name <> 'table_categories'`;
    db_l.all(sql, [], (err, rows) => {
        if (err) {
            callback(err);
            return;
        }
        const tableNames = rows.map(row => row.name);
        callback(null, tableNames);
    });
}

app.post('/search-dependency', (req, res) => {
    const { query, page = 1, limit = 100 } = req.body;
    const offset = (page - 1) * limit;

    // 解析查询字符串
    const parts = query.split('+');
    
    // 获取所有表名
    getAllTableNames2((err, tableNames) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('获取表名失败');
            return;
        }

        let sqlParts = [];
        let paramsParts = [];
        let countSqlParts = [];
        let countParamsParts = [];

        tableNames.forEach((tableName) => {
            let sql, params, countSql, countParams;

            if (parts.length === 2) {
                // 处理词语+依存关系格式（如"实施+VOB"）
                const [word, depRelation] = parts;
                
                // 查询指定词语作为依存关系的头词
                sql = `
                    SELECT 
                        "${tableName}" AS tableName, 
                        a.article_index,
                        a.sentence_index,
                        a.position AS head_position,
                        a.word AS head_word,
                        a.pos_tag AS head_pos,
                        b.position AS dependent_position,
                        b.word AS dependent_word,
                        b.pos_tag AS dependent_pos,
                        b.dep_relation
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
                    WHERE a.word = ? AND b.dep_relation = ?
                `;
                params = [word, depRelation];
                
                countSql = `
                    SELECT COUNT(*) as count
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
                    WHERE a.word = ? AND b.dep_relation = ?
                `;
                countParams = [word, depRelation];
            } else if (parts.length === 3 && parts[1] === 'as') {
                // 处理词语+as+依存关系格式（如"实施+as+VOB"） - 词语作为依存项
                const [word, _, depRelation] = parts;
                
                // 查询指定词语作为依存关系的依存项
                sql = `
                    SELECT 
                        "${tableName}" AS tableName, 
                        b.article_index,
                        b.sentence_index,
                        a.position AS head_position,
                        a.word AS head_word,
                        a.pos_tag AS head_pos,
                        b.position AS dependent_position,
                        b.word AS dependent_word,
                        b.pos_tag AS dependent_pos,
                        b.dep_relation
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
                    WHERE b.word = ? AND b.dep_relation = ?
                `;
                params = [word, depRelation];
                
                countSql = `
                    SELECT COUNT(*) as count
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
                    WHERE b.word = ? AND b.dep_relation = ?
                `;
                countParams = [word, depRelation];
            } else if (parts.length === 1) {
                // 只有依存关系（如"VOB"）
                const depRelation = parts[0];
                
                sql = `
                    SELECT 
                        "${tableName}" AS tableName, 
                        a.article_index,
                        a.sentence_index,
                        a.position AS head_position,
                        a.word AS head_word,
                        a.pos_tag AS head_pos,
                        b.position AS dependent_position,
                        b.word AS dependent_word,
                        b.pos_tag AS dependent_pos,
                        b.dep_relation
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
                    WHERE b.dep_relation = ?
                `;
                params = [depRelation];
                
                countSql = `
                    SELECT COUNT(*) as count
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
                    WHERE b.dep_relation = ?
                `;
                countParams = [depRelation];
            } else {
                // 无效查询格式，跳过此表
                return;
            }

            sqlParts.push(sql);
            paramsParts.push(params);
            countSqlParts.push(countSql);
            countParamsParts.push(countParams);
        });

        // 执行总的计数查询
        const totalSql = countSqlParts.join(' UNION ALL ');
        const totalParams = [].concat(...countParamsParts);

        db_l.all(totalSql, totalParams, (err, countRows) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('查询失败');
                return;
            }

            const totalCount = countRows.reduce((sum, row) => sum + row.count, 0);

            // 分页查询 SQL
            const unionSql = sqlParts.join(' UNION ALL ');
            const finalSql = `${unionSql} LIMIT ? OFFSET ?`;
            const finalParams = [].concat(...paramsParts, [limit, offset]);

            db_l.all(finalSql, finalParams, (err, rows) => {
                if (err) {
                    console.error(err.message);
                    res.status(500).send('Query failed');
                    return;
                }

                if (rows.length === 0) {
                    res.json({
                        results: [],
                        totalResults: 0,
                        currentPage: page,
                        totalPages: 0
                    });
                    return;
                }

                const results = [];
                let completed = 0;

                // 为每个匹配结果获取句子上下文
                rows.forEach(row => {
                    getSentenceContext(row.tableName, row.article_index, row.sentence_index, (err, sentenceContext) => {
                        if (err) {
                            console.error(err.message);
                            completed += 1;
                            if (completed === rows.length) {
                                sendResults();
                            }
                            return;
                        }

                        // 创建高亮版本的上下文
                        const headWord = row.head_word || '';
                        const dependentWord = row.dependent_word || '';
                        
                        let highlightedContext = sentenceContext;
                        if (headWord && dependentWord) {
                            highlightedContext = highlightedContext
                                .replace(headWord, `<mark class="head">${headWord}</mark>`)
                                .replace(dependentWord, `<mark class="dependent">${dependentWord}</mark>`);
                        }

                        // 整理查询结果
                        const result = {
                            file: row.tableName,
                            articleIndex: row.article_index,
                            sentenceIndex: row.sentence_index,
                            context: highlightedContext,
                            dependencyRelation: row.dep_relation || 'N/A',
                            headWord: row.head_word,
                            headPos: row.head_pos,
                            dependentWord: row.dependent_word,
                            dependentPos: row.dependent_pos
                        };

                        results.push(result);

                        completed += 1;
                        if (completed === rows.length) {
                            sendResults();
                        }
                    });
                });

                function sendResults() {
                    res.json({
                        results,
                        totalResults: totalCount,
                        currentPage: page,
                        totalPages: Math.ceil(totalCount / limit)
                    });
                }
            });
        });
    });
});

app.post('/search-dependency-file', (req, res) => {
    const { query, file, page = 1, limit = 100 } = req.body;
    const offset = (page - 1) * limit;

    // 解析查询字符串
    const parts = query.split('+');

    // 如果没有指定文件名，返回错误
    if (!file) {
        res.status(400).send('请指定文件名');
        return;
    }

    // 检查文件名是否存在
    checkTableExists2(file, (err, exists) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('检查表名失败');
            return;
        }

        if (!exists) {
            res.status(404).send(`文件 "${file}" 不存在`);
            return;
        }

        let sql, params, countSql, countParams;

        if (parts.length === 2) {
            // 处理词语+依存关系格式（如"实施+VOB"）
            const [word, depRelation] = parts;
            
            // 查询指定词语作为依存关系的头词
            sql = `
                SELECT 
                    "${file}" AS tableName, 
                    a.article_index,
                    a.sentence_index,
                    a.position AS head_position,
                    a.word AS head_word,
                    a.pos_tag AS head_pos,
                    b.position AS dependent_position,
                    b.word AS dependent_word,
                    b.pos_tag AS dependent_pos,
                    b.dep_relation
                FROM "${file}" a
                JOIN "${file}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
                WHERE a.word = ? AND b.dep_relation = ?
                LIMIT ? OFFSET ?
            `;
            params = [word, depRelation, limit, offset];
            
            countSql = `
                SELECT COUNT(*) as count
                FROM "${file}" a
                JOIN "${file}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
                WHERE a.word = ? AND b.dep_relation = ?
            `;
            countParams = [word, depRelation];
        } else if (parts.length === 3 && parts[1] === 'as') {
            // 处理词语+as+依存关系格式（如"实施+as+VOB"） - 词语作为依存项
            const [word, _, depRelation] = parts;
            
            // 查询指定词语作为依存关系的依存项
            sql = `
                SELECT 
                    "${file}" AS tableName, 
                    b.article_index,
                    b.sentence_index,
                    a.position AS head_position,
                    a.word AS head_word,
                    a.pos_tag AS head_pos,
                    b.position AS dependent_position,
                    b.word AS dependent_word,
                    b.pos_tag AS dependent_pos,
                    b.dep_relation
                FROM "${file}" a
                JOIN "${file}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
                WHERE b.word = ? AND b.dep_relation = ?
                LIMIT ? OFFSET ?
            `;
            params = [word, depRelation, limit, offset];
            
            countSql = `
                SELECT COUNT(*) as count
                FROM "${file}" a
                JOIN "${file}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
                WHERE b.word = ? AND b.dep_relation = ?
            `;
            countParams = [word, depRelation];
        } else if (parts.length === 1) {
            // 只有依存关系（如"VOB"）
            const depRelation = parts[0];
            
            sql = `
                SELECT 
                    "${file}" AS tableName, 
                    a.article_index,
                    a.sentence_index,
                    a.position AS head_position,
                    a.word AS head_word,
                    a.pos_tag AS head_pos,
                    b.position AS dependent_position,
                    b.word AS dependent_word,
                    b.pos_tag AS dependent_pos,
                    b.dep_relation
                FROM "${file}" a
                JOIN "${file}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
                WHERE b.dep_relation = ?
                LIMIT ? OFFSET ?
            `;
            params = [depRelation, limit, offset];
            
            countSql = `
                SELECT COUNT(*) as count
                FROM "${file}" a
                JOIN "${file}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
                WHERE b.dep_relation = ?
            `;
            countParams = [depRelation];
        } else {
            // 无效查询格式
            res.status(400).send('无效的查询格式');
            return;
        }

        // 执行总的计数查询
        db_l.get(countSql, countParams, (err, countRow) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('查询失败');
                return;
            }

            const totalCount = countRow ? countRow.count : 0;

            // 执行主查询
            db_l.all(sql, params, (err, rows) => {
                if (err) {
                    console.error(err.message);
                    res.status(500).send('查询失败');
                    return;
                }

                if (rows.length === 0) {
                    res.json({
                        results: [],
                        totalResults: 0,
                        currentPage: page,
                        totalPages: 0
                    });
                    return;
                }

                const results = [];
                let completed = 0;

                // 为每个匹配结果获取句子上下文
                rows.forEach(row => {
                    getSentenceContext(file, row.article_index, row.sentence_index, (err, sentenceContext) => {
                        if (err) {
                            console.error(err.message);
                            completed += 1;
                            if (completed === rows.length) {
                                sendResults();
                            }
                            return;
                        }

                        // 创建高亮版本的上下文
                        const headWord = row.head_word || '';
                        const dependentWord = row.dependent_word || '';
                        
                        let highlightedContext = sentenceContext;
                        if (headWord && dependentWord) {
                            highlightedContext = highlightedContext
                                .replace(headWord, `<mark class="head">${headWord}</mark>`)
                                .replace(dependentWord, `<mark class="dependent">${dependentWord}</mark>`);
                        }

                        // 整理查询结果
                        const result = {
                            file: row.tableName,
                            articleIndex: row.article_index,
                            sentenceIndex: row.sentence_index,
                            context: highlightedContext,
                            dependencyRelation: row.dep_relation || 'N/A',
                            headWord: row.head_word,
                            headPos: row.head_pos,
                            dependentWord: row.dependent_word,
                            dependentPos: row.dependent_pos
                        };

                        results.push(result);

                        completed += 1;
                        if (completed === rows.length) {
                            sendResults();
                        }
                    });
                });

                function sendResults() {
                    res.json({
                        results,
                        totalResults: totalCount,
                        currentPage: page,
                        totalPages: Math.ceil(totalCount / limit)
                    });
                }
            });
        });
    });
});

// 辅助函数：检查表是否存在
function checkTableExists2(tableName, callback) {
    const sql = `SELECT name FROM sqlite_master WHERE type='table' AND name=?`;
    db_l.get(sql, [tableName], (err, row) => {
        if (err) {
            callback(err, false);
            return;
        }
        callback(null, !!row);
    });
}

app.post('/dependency-stat', (req, res) => {
    const { query } = req.body;

    // 解析查询字符串
    const parts = query.split('+');
    
    // 获取所有表名
    getAllTableNames2((err, tableNames) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('获取表名失败');
            return;
        }

        let sqlParts = [];
        let paramsParts = [];

        tableNames.forEach((tableName) => {
            let sql, params;

            if (parts.length === 2) {
                // 处理词语+依存关系格式（如"实施+VOB"）
                const [word, depRelation] = parts;
                
                // 查询指定词语作为依存关系的头词
                sql = `
                    SELECT 
                        "${tableName}" AS tableName, 
                        a.word AS head_word,
                        a.pos_tag AS head_pos,
                        b.word AS dependent_word,
                        b.pos_tag AS dependent_pos,
                        b.dep_relation AS dependency_relation
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
                    WHERE a.word = ? AND b.dep_relation = ?
                `;
                params = [word, depRelation];
            } else if (parts.length === 3 && parts[1] === 'as') {
                // 处理词语+as+依存关系格式（如"实施+as+VOB"） - 词语作为依存项
                const [word, _, depRelation] = parts;
                
                // 查询指定词语作为依存关系的依存项
                sql = `
                    SELECT 
                        "${tableName}" AS tableName, 
                        a.word AS head_word,
                        a.pos_tag AS head_pos,
                        b.word AS dependent_word,
                        b.pos_tag AS dependent_pos,
                        b.dep_relation AS dependency_relation
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
                    WHERE b.word = ? AND b.dep_relation = ?
                `;
                params = [word, depRelation];
            } else if (parts.length === 1) {
                // 只有依存关系（如"VOB"）
                const depRelation = parts[0];
                
                sql = `
                    SELECT 
                        "${tableName}" AS tableName, 
                        a.word AS head_word,
                        a.pos_tag AS head_pos,
                        b.word AS dependent_word,
                        b.pos_tag AS dependent_pos,
                        b.dep_relation AS dependency_relation
                    FROM "${tableName}" a
                    JOIN "${tableName}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
                    WHERE b.dep_relation = ?
                `;
                params = [depRelation];
            } else {
                // 无效查询格式，跳过此表
                return;
            }

            sqlParts.push(sql);
            paramsParts.push(params);
        });

        // 合并所有表的查询
        const unionSql = sqlParts.join(' UNION ALL ');
        const finalParams = [].concat(...paramsParts);

        db_l.all(unionSql, finalParams, (err, rows) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('查询失败');
                return;
            }

            if (rows.length === 0) {
                // 如果没有匹配结果
                res.json({
                    results: [],
                    totalResults: 0
                });
                return;
            }

            // 直接返回简化的结果
            const results = rows.map(row => ({
                file: row.tableName,
                headPos: row.head_pos || 'N/A',
                headWord: row.head_word || 'N/A',
                dependentPos: row.dependent_pos || 'N/A',
                dependentWord: row.dependent_word || 'N/A',
                dependencyRelation: row.dependency_relation || 'N/A'
            }));

            res.json({
                results: results,
                totalResults: rows.length
            });
        });
    });
});

app.post('/dependency-file-stat', (req, res) => {
    const { query, file } = req.body;

    // 检查是否提供了文件名
    if (!file) {
        res.status(400).send('请指定文件名');
        return;
    }

    // 解析查询字符串
    const parts = query.split('+');

    // 只使用指定的文件名作为表名
    const tableName = file;
    
    let sql, params;

    if (parts.length === 2) {
        // 处理词语+依存关系格式（如"实施+VOB"）
        const [word, depRelation] = parts;
        
        // 查询指定词语作为依存关系的头词
        sql = `
            SELECT 
                "${tableName}" AS tableName, 
                a.word AS head_word,
                a.pos_tag AS head_pos,
                b.word AS dependent_word,
                b.pos_tag AS dependent_pos,
                b.dep_relation AS dependency_relation
            FROM "${tableName}" a
            JOIN "${tableName}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
            WHERE a.word = ? AND b.dep_relation = ?
        `;
        params = [word, depRelation];
    } else if (parts.length === 3 && parts[1] === 'as') {
        // 处理词语+as+依存关系格式（如"实施+as+VOB"） - 词语作为依存项
        const [word, _, depRelation] = parts;
        
        // 查询指定词语作为依存关系的依存项
        sql = `
            SELECT 
                "${tableName}" AS tableName, 
                a.word AS head_word,
                a.pos_tag AS head_pos,
                b.word AS dependent_word,
                b.pos_tag AS dependent_pos,
                b.dep_relation AS dependency_relation
            FROM "${tableName}" a
            JOIN "${tableName}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
            WHERE b.word = ? AND b.dep_relation = ?
        `;
        params = [word, depRelation];
    } else if (parts.length === 1) {
        // 只有依存关系（如"VOB"）
        const depRelation = parts[0];
        
        sql = `
            SELECT 
                "${tableName}" AS tableName, 
                a.word AS head_word,
                a.pos_tag AS head_pos,
                b.word AS dependent_word,
                b.pos_tag AS dependent_pos,
                b.dep_relation AS dependency_relation
            FROM "${tableName}" a
            JOIN "${tableName}" b ON a.sentence_index = b.sentence_index AND a.position = b.head_position AND a.article_index = b.article_index
            WHERE b.dep_relation = ?
        `;
        params = [depRelation];
    } else {
        // 无效查询格式
        res.status(400).send('无效的查询格式');
        return;
    }

    db_l.all(sql, params, (err, rows) => {
        if (err) {
            console.error(err.message);
            res.status(500).send('查询失败');
            return;
        }

        if (rows.length === 0) {
            // 如果没有匹配结果
            res.json({
                results: [],
                totalResults: 0
            });
            return;
        }

        // 直接返回简化的结果
        const results = rows.map(row => ({
            file: row.tableName,
            headPos: row.head_pos || 'N/A',
            headWord: row.head_word || 'N/A',
            dependentPos: row.dependent_pos || 'N/A',
            dependentWord: row.dependent_word || 'N/A',
            dependencyRelation: row.dependency_relation || 'N/A'
        }));

        res.json({
            results: results,
            totalResults: rows.length
        });
    });
});

// 辅助函数：获取句子上下文
function getSentenceContext(tableName, articleIndex, sentenceIndex, callback) {
    // 从词语重建句子
    const wordsSql = `
        SELECT word, position 
        FROM "${tableName}" 
        WHERE article_index = ? AND sentence_index = ? 
        ORDER BY position
    `;
    
    db_l.all(wordsSql, [articleIndex, sentenceIndex], (err, rows) => {
        if (err) {
            callback(err);
            return;
        }
        
        if (rows && rows.length > 0) {
            // 将所有词语按位置顺序连接起来
            const sentenceText = rows.map(row => row.word).join('');
            callback(null, sentenceText);
        } else {
            callback(new Error('无法找到句子'));
        }
    });
}

// 判断是否为依存关系标签
function isDependencyRelation(str) {
    // 常见的依存关系标签
    const depRelations = ['SBV', 'VOB', 'IOB', 'FOB', 'DBL', 'ATT', 'ADV', 'CMP', 'COO', 'POB', 'LAD', 'RAD', 'IS', 'WP', 'HED'];
    return depRelations.includes(str);
}

// 通配符路由 - 放在所有API路由后面
app.get('*', (req, res, next) => {
    // 如果是API请求，跳过这个中间件
    if (req.path.startsWith('/api/')) {
        return next();
    }

    res.header('Content-Type', 'text/html; charset=utf-8');
    // 否则发送index.html
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ error: '服务器内部错误', message: process.env.NODE_ENV === 'development' ? err.message : undefined });
});

// 启动应用 - 监听所有接口
initDatabase().then(() => {
    app.listen(port, '0.0.0.0', () => {
        console.log(`服务器运行在 http://0.0.0.0:${port}`);
        console.log(`请通过 http://lawcorpus.online 访问`);
    });
}).catch(err => {
    console.error('启动服务器失败:', err);
    process.exit(1);
});