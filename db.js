const fs = require('fs');
const path = require('path');

const dataFile = path.join(__dirname, 'data.json');

class SimpleDB {
    constructor() {
        this.data = this.loadData();
    }

    loadData() {
        try {
            if (fs.existsSync(dataFile)) {
                const fileContent = fs.readFileSync(dataFile, 'utf8');
                return JSON.parse(fileContent);
            }
        } catch (error) {
            console.error('Error loading data:', error);
        }
        return { users: [], tasks: [] };
    }

    saveData() {
        try {
            fs.writeFileSync(dataFile, JSON.stringify(this.data, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving data:', error);
            return false;
        }
    }

    // 用户相关方法
    createUser(userData) {
        const user = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            ...userData,
            created_at: new Date().toISOString()
        };
        this.data.users.push(user);
        this.saveData();
        return user;
    }

    findUserByEmail(email) {
        return this.data.users.find(user => user.email === email);
    }

    findUserByUsername(username) {
        return this.data.users.find(user => user.username === username);
    }

    findUserById(id) {
        return this.data.users.find(user => user.id === id);
    }

    // 任务相关方法
    createTask(taskData) {
        const task = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...taskData
        };
        this.data.tasks.push(task);
        this.saveData();
        return task;
    }

    getTasksByUserId(userId, filters = {}) {
        let tasks = this.data.tasks.filter(task => task.user_id === userId);

        if (filters.status && filters.status !== 'all') {
            tasks = tasks.filter(task => task.status === filters.status);
        }

        if (filters.priority && filters.priority !== 'all') {
            tasks = tasks.filter(task => task.priority === filters.priority);
        }

        if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            tasks = tasks.filter(task =>
                task.title.toLowerCase().includes(searchTerm) ||
                (task.description && task.description.toLowerCase().includes(searchTerm)) ||
                (task.tags && Array.isArray(task.tags) && task.tags.some(tag =>
                    tag.toLowerCase().includes(searchTerm)
                ))
            );
        }

        return tasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    updateTask(taskId, userId, updates) {
        const taskIndex = this.data.tasks.findIndex(
            task => task.id === taskId && task.user_id === userId
        );

        if (taskIndex === -1) return null;

        this.data.tasks[taskIndex] = {
            ...this.data.tasks[taskIndex],
            ...updates,
            updated_at: new Date().toISOString()
        };

        // 处理完成时间
        if (updates.status === 'completed' && !this.data.tasks[taskIndex].completed_at) {
            this.data.tasks[taskIndex].completed_at = new Date().toISOString();
        } else if (updates.status !== 'completed' && updates.status !== undefined) {
            this.data.tasks[taskIndex].completed_at = null;
        }

        this.saveData();
        return this.data.tasks[taskIndex];
    }

    deleteTask(taskId, userId) {
        const taskIndex = this.data.tasks.findIndex(
            task => task.id === taskId && task.user_id === userId
        );

        if (taskIndex === -1) return false;

        this.data.tasks.splice(taskIndex, 1);
        this.saveData();
        return true;
    }
}

module.exports = new SimpleDB();
