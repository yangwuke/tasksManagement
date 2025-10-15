const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 认证中间件
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: '访问令牌缺失' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: '无效的访问令牌' });
        }
        req.user = user;
        next();
    });
};

// 检查管理员权限中间件
const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
    }
    next();
};

// 认证路由
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // 验证输入
        if (!username || !email || !password) {
            return res.status(400).json({ error: '请填写所有必填字段' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: '密码长度至少6位' });
        }

        // 检查用户是否已存在
        if (db.findUserByEmail(email)) {
            return res.status(400).json({ error: '邮箱已被注册' });
        }

        if (db.findUserByUsername(username)) {
            return res.status(400).json({ error: '用户名已被使用' });
        }

        // 加密密码并创建用户
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = db.createUser({
            username,
            email,
            password_hash: hashedPassword
        });

        res.status(201).json({
            message: '用户注册成功',
            userId: user.id
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: '请提供邮箱和密码' });
        }

        const user = db.findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: '无效的邮箱或密码' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: '无效的邮箱或密码' });
        }

        const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// ==================== 管理员功能 ====================

// 管理员登录（特殊管理员账号）
app.post('/api/auth/admin-login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: '请提供管理员账号和密码' });
        }

        // 硬编码的管理员账号（生产环境中应该使用环境变量）
        const adminAccounts = [
            { username: 'admin', password: 'admin123', role: 'admin' },
            { username: 'supervisor', password: 'super123', role: 'admin' }
        ];

        const adminAccount = adminAccounts.find(acc => acc.username === username);

        if (!adminAccount || adminAccount.password !== password) {
            return res.status(401).json({ error: '无效的管理员账号或密码' });
        }

        const token = jwt.sign(
            { userId: 0, username: adminAccount.username, role: 'admin' },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: 0,
                username: adminAccount.username,
                role: 'admin'
            }
        });

    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: '管理员登录失败' });
    }
});

// 任务路由
app.get('/api/tasks', authenticateToken, (req, res) => {
    try {
        const { status, priority, search } = req.query;

        const tasks = db.getTasksByUserId(req.user.userId, {
            status,
            priority,
            search
        });

        res.json({ data: tasks });

    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({ error: '获取任务失败' });
    }
});

app.post('/api/tasks', authenticateToken, (req, res) => {
    try {
        const { title, description, priority, due_date, estimated_hours, tags } = req.body;

        if (!title || title.trim() === '') {
            return res.status(400).json({ error: '任务标题不能为空' });
        }

        // 处理标签
        let processedTags = [];
        if (tags) {
            if (Array.isArray(tags)) {
                processedTags = tags;
            } else if (typeof tags === 'string') {
                processedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
            }
        }

        const task = db.createTask({
            title: title.trim(),
            description: description ? description.trim() : '',
            priority: priority || 'medium',
            due_date,
            estimated_hours: estimated_hours ? parseFloat(estimated_hours) : null,
            tags: processedTags,
            user_id: req.user.userId
        });

        res.status(201).json(task);

    } catch (error) {
        console.error('Create task error:', error);
        res.status(500).json({ error: '创建任务失败' });
    }
});

app.put('/api/tasks/:id', authenticateToken, (req, res) => {
    try {
        const taskId = parseInt(req.params.id);
        const updates = req.body;

        const updatedTask = db.updateTask(taskId, req.user.userId, updates);
        if (!updatedTask) {
            return res.status(404).json({ error: '任务不存在' });
        }

        res.json(updatedTask);

    } catch (error) {
        console.error('Update task error:', error);
        res.status(500).json({ error: '更新任务失败' });
    }
});

app.delete('/api/tasks/:id', authenticateToken, (req, res) => {
    try {
        const taskId = parseInt(req.params.id);

        const deleted = db.deleteTask(taskId, req.user.userId);
        if (!deleted) {
            return res.status(404).json({ error: '任务不存在' });
        }

        res.json({ message: '任务删除成功' });

    } catch (error) {
        console.error('Delete task error:', error);
        res.status(500).json({ error: '删除任务失败' });
    }
});

// ==================== 管理员数据接口 ====================

// 管理员数据统计
app.get('/api/admin/stats', authenticateToken, requireAdmin, (req, res) => {
    try {
        const stats = {
            totalUsers: db.data.users.length,
            totalTasks: db.data.tasks.length,
            activeUsers: db.data.users.filter(user => {
                const userTasks = db.data.tasks.filter(task => task.user_id === user.id);
                return userTasks.length > 0;
            }).length,
            tasksByStatus: db.data.tasks.reduce((acc, task) => {
                acc[task.status] = (acc[task.status] || 0) + 1;
                return acc;
            }, {}),
            tasksByPriority: db.data.tasks.reduce((acc, task) => {
                acc[task.priority] = (acc[task.priority] || 0) + 1;
                return acc;
            }, {}),
            recentRegistrations: db.data.users
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 5)
                .map(user => {
                    const taskCount = db.data.tasks.filter(task => task.user_id === user.id).length;
                    return {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        created_at: user.created_at,
                        task_count: taskCount
                    };
                }),
            topActiveUsers: db.data.users
                .map(user => {
                    const userTasks = db.data.tasks.filter(task => task.user_id === user.id);
                    return {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        total_tasks: userTasks.length,
                        completed_tasks: userTasks.filter(t => t.status === 'completed').length,
                        completion_rate: userTasks.length > 0 ?
                            (userTasks.filter(t => t.status === 'completed').length / userTasks.length) : 0
                    };
                })
                .sort((a, b) => b.total_tasks - a.total_tasks)
                .slice(0, 10)
        };

        res.json(stats);

    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ error: '获取管理员统计失败' });
    }
});

// 获取所有用户列表
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { search, sort = 'created_at', order = 'desc' } = req.query;

        let users = db.data.users.map(user => {
            const userTasks = db.data.tasks.filter(task => task.user_id === user.id);
            const { password_hash, ...userInfo } = user;

            return {
                ...userInfo,
                task_count: userTasks.length,
                completed_tasks: userTasks.filter(t => t.status === 'completed').length,
                last_active: userTasks.length > 0 ?
                    userTasks.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0]?.updated_at :
                    user.created_at
            };
        });

        // 搜索过滤
        if (search) {
            const searchTerm = search.toLowerCase();
            users = users.filter(user =>
                user.username.toLowerCase().includes(searchTerm) ||
                user.email.toLowerCase().includes(searchTerm)
            );
        }

        // 排序
        users.sort((a, b) => {
            let aValue = a[sort];
            let bValue = b[sort];

            if (sort === 'created_at' || sort === 'last_active') {
                aValue = new Date(aValue);
                bValue = new Date(bValue);
            }

            if (order === 'desc') {
                return bValue - aValue;
            } else {
                return aValue - bValue;
            }
        });

        res.json({ data: users });

    } catch (error) {
        console.error('Admin users error:', error);
        res.status(500).json({ error: '获取用户列表失败' });
    }
});

// 获取用户详细信息
app.get('/api/admin/users/:userId', authenticateToken, requireAdmin, (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const user = db.data.users.find(u => u.id === userId);

        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        const userTasks = db.data.tasks.filter(task => task.user_id === userId);
        const { password_hash, ...userInfo } = user;

        const userDetails = {
            ...userInfo,
            statistics: {
                total_tasks: userTasks.length,
                completed_tasks: userTasks.filter(t => t.status === 'completed').length,
                in_progress_tasks: userTasks.filter(t => t.status === 'in_progress').length,
                pending_tasks: userTasks.filter(t => t.status === 'pending').length,
                completion_rate: userTasks.length > 0 ?
                    (userTasks.filter(t => t.status === 'completed').length / userTasks.length) : 0,
                avg_completion_time: null
            },
            recent_tasks: userTasks
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 10)
        };

        res.json(userDetails);

    } catch (error) {
        console.error('Admin user details error:', error);
        res.status(500).json({ error: '获取用户详情失败' });
    }
});

// 获取所有任务（管理员视角）
app.get('/api/admin/tasks', authenticateToken, requireAdmin, (req, res) => {
    try {
        const {
            userId,
            status,
            priority,
            search,
            sort = 'created_at',
            order = 'desc'
        } = req.query;

        let tasks = db.data.tasks.map(task => {
            const user = db.data.users.find(u => u.id === task.user_id);
            return {
                ...task,
                username: user ? user.username : '未知用户',
                user_email: user ? user.email : '未知邮箱'
            };
        });

        // 过滤
        if (userId) {
            tasks = tasks.filter(task => task.user_id == userId);
        }
        if (status && status !== 'all') {
            tasks = tasks.filter(task => task.status === status);
        }
        if (priority && priority !== 'all') {
            tasks = tasks.filter(task => task.priority === priority);
        }
        if (search) {
            const searchTerm = search.toLowerCase();
            tasks = tasks.filter(task =>
                task.title.toLowerCase().includes(searchTerm) ||
                (task.description && task.description.toLowerCase().includes(searchTerm)) ||
                task.username.toLowerCase().includes(searchTerm)
            );
        }

        // 排序
        tasks.sort((a, b) => {
            let aValue = a[sort];
            let bValue = b[sort];

            if (sort === 'created_at' || sort === 'updated_at' || sort === 'due_date') {
                aValue = new Date(aValue || 0);
                bValue = new Date(bValue || 0);
            }

            if (order === 'desc') {
                return bValue - aValue;
            } else {
                return aValue - aValue;
            }
        });

        res.json({ data: tasks });

    } catch (error) {
        console.error('Admin tasks error:', error);
        res.status(500).json({ error: '获取任务列表失败' });
    }
});

// 管理员删除用户
app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, (req, res) => {
    try {
        const userId = parseInt(req.params.userId);

        // 不能删除自己
        if (userId === req.user.userId) {
            return res.status(400).json({ error: '不能删除自己的账户' });
        }

        const userIndex = db.data.users.findIndex(u => u.id === userId);
        if (userIndex === -1) {
            return res.status(404).json({ error: '用户不存在' });
        }

        // 删除用户的所有任务
        db.data.tasks = db.data.tasks.filter(task => task.user_id !== userId);

        // 删除用户
        const deletedUser = db.data.users.splice(userIndex, 1)[0];
        db.saveData();

        res.json({
            message: '用户删除成功',
            deletedUser: {
                id: deletedUser.id,
                username: deletedUser.username,
                email: deletedUser.email
            }
        });

    } catch (error) {
        console.error('Admin delete user error:', error);
        res.status(500).json({ error: '删除用户失败' });
    }
});

// 管理员删除任务
app.delete('/api/admin/tasks/:taskId', authenticateToken, requireAdmin, (req, res) => {
    try {
        const taskId = parseInt(req.params.taskId);

        const taskIndex = db.data.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) {
            return res.status(404).json({ error: '任务不存在' });
        }

        const deletedTask = db.data.tasks.splice(taskIndex, 1)[0];
        db.saveData();

        res.json({
            message: '任务删除成功',
            deletedTask: {
                id: deletedTask.id,
                title: deletedTask.title,
                user_id: deletedTask.user_id
            }
        });

    } catch (error) {
        console.error('Admin delete task error:', error);
        res.status(500).json({ error: '删除任务失败' });
    }
});

// ==================== 数据库调试接口 ====================

// 获取数据库统计信息
app.get('/api/debug/stats', authenticateToken, (req, res) => {
    try {
        const stats = {
            totalUsers: db.data.users.length,
            totalTasks: db.data.tasks.length,
            users: db.data.users.map(user => {
                const { password_hash, ...userInfo } = user;
                return userInfo;
            }),
            tasksByStatus: db.data.tasks.reduce((acc, task) => {
                acc[task.status] = (acc[task.status] || 0) + 1;
                return acc;
            }, {}),
            tasksByPriority: db.data.tasks.reduce((acc, task) => {
                acc[task.priority] = (acc[task.priority] || 0) + 1;
                return acc;
            }, {}),
            recentTasks: db.data.tasks
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 10)
                .map(task => {
                    const user = db.data.users.find(u => u.id === task.user_id);
                    return {
                        ...task,
                        username: user ? user.username : '未知用户'
                    };
                })
        };

        res.json(stats);
    } catch (error) {
        console.error('Debug stats error:', error);
        res.status(500).json({ error: '获取统计信息失败' });
    }
});

// 获取完整数据库数据（谨慎使用）
app.get('/api/debug/full-db', authenticateToken, (req, res) => {
    try {
        // 隐藏密码哈希
        const usersWithoutPassword = db.data.users.map(user => {
            const { password_hash, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });

        res.json({
            users: usersWithoutPassword,
            tasks: db.data.tasks.map(task => {
                const user = db.data.users.find(u => u.id === task.user_id);
                return {
                    ...task,
                    username: user ? user.username : '未知用户'
                };
            })
        });
    } catch (error) {
        console.error('Full DB access error:', error);
        res.status(500).json({ error: '获取数据库失败' });
    }
});

// 获取特定用户的任务
app.get('/api/debug/user-tasks/:userId', authenticateToken, (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const user = db.data.users.find(u => u.id === userId);

        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        const userTasks = db.data.tasks.filter(task => task.user_id === userId);
        const { password_hash, ...userInfo } = user;

        res.json({
            user: userInfo,
            tasks: userTasks,
            taskCount: userTasks.length,
            completedTasks: userTasks.filter(t => t.status === 'completed').length,
            pendingTasks: userTasks.filter(t => t.status === 'pending').length
        });
    } catch (error) {
        console.error('User tasks error:', error);
        res.status(500).json({ error: '获取用户任务失败' });
    }
});

// 健康检查路由
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: '服务器运行正常' });
});

// 静态文件服务
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 任务管理工具服务器运行在 http://localhost:${PORT}`);
    console.log(`📁 数据文件: ${path.join(__dirname, 'data.json')}`);
    console.log('🔧 数据库调试接口已启用:');
    console.log('   - /api/debug/stats (统计信息)');
    console.log('   - /api/debug/full-db (完整数据库)');
    console.log('   - /api/debug/user-tasks/:userId (用户任务)');
    console.log('👑 管理员功能已启用:');
    console.log('   - /api/auth/admin-login (管理员登录)');
    console.log('   - /api/admin/stats (管理员统计)');
    console.log('   - /api/admin/users (用户管理)');
    console.log('   - /api/admin/tasks (任务管理)');
});
