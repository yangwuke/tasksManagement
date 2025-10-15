// 任务管理工具 - 前端主应用逻辑
class TaskManager {
    constructor() {
        this.tasks = [];
        this.currentFilter = 'all';
        this.currentUser = null;
        this.apiBaseUrl = 'http://localhost:3000/api';

        this.initializeEventListeners();
        this.loadTasks();
        this.checkAuthStatus();
    }

    // 初始化事件监听器
    initializeEventListeners() {
        // 任务表单提交
        const taskForm = document.getElementById('taskForm');
        if (taskForm) {
            taskForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createTask();
            });
        }

        // 筛选按钮
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.applyFilters();
            });
        });

        // 搜索功能
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.applyFilters();
            });
        }

        // 登录表单
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.login();
            });
        }

        // 注册表单
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.register();
            });
        }

        // 管理员登录表单
        const adminLoginForm = document.getElementById('adminLoginForm');
        if (adminLoginForm) {
            adminLoginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.adminLogin();
            });
        }
    }

    // API 请求封装
    async makeRequest(endpoint, options = {}) {
        const url = `${this.apiBaseUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
            },
            ...options
        };

        // 添加认证token
        const token = localStorage.getItem('authToken');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(url, config);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API request failed:', error);
            this.showNotification('操作失败，请重试', 'error');
            throw error;
        }
    }

    // 加载任务列表
    async loadTasks() {
        try {
            const data = await this.makeRequest('/tasks');
            this.tasks = data.data || data;
            this.renderTasks();
            this.updateStatistics();
        } catch (error) {
            console.error('Failed to load tasks:', error);
        }
    }

    // 创建新任务
    async createTask() {
        const formData = new FormData(document.getElementById('taskForm'));
        const taskData = {
            title: formData.get('title'),
            description: formData.get('description'),
            priority: formData.get('priority'),
            due_date: formData.get('due_date'),
            estimated_hours: parseFloat(formData.get('estimated_hours')) || null,
            tags: formData.get('tags') ? formData.get('tags').split(',').map(tag => tag.trim()) : []
        };

        try {
            await this.makeRequest('/tasks', {
                method: 'POST',
                body: JSON.stringify(taskData)
            });

            document.getElementById('taskForm').reset();
            this.closeModal('taskModal');
            this.loadTasks();
            this.showNotification('任务创建成功', 'success');
        } catch (error) {
            console.error('Failed to create task:', error);
        }
    }

    // 更新任务状态
    async updateTaskStatus(taskId, newStatus) {
        try {
            await this.makeRequest(`/tasks/${taskId}`, {
                method: 'PUT',
                body: JSON.stringify({ status: newStatus })
            });

            this.loadTasks();
            this.showNotification('任务状态已更新', 'success');
        } catch (error) {
            console.error('Failed to update task:', error);
        }
    }

    // 删除任务
    async deleteTask(taskId) {
        if (!confirm('确定要删除这个任务吗？')) return;

        try {
            await this.makeRequest(`/tasks/${taskId}`, {
                method: 'DELETE'
            });

            this.loadTasks();
            this.showNotification('任务已删除', 'success');
        } catch (error) {
            console.error('Failed to delete task:', error);
        }
    }

    // 渲染任务列表
    renderTasks() {
        const taskList = document.getElementById('taskList');
        const filteredTasks = this.getFilteredTasks();

        if (filteredTasks.length === 0) {
            taskList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-tasks"></i>
                    <p>暂无任务</p>
                </div>
            `;
            return;
        }

        taskList.innerHTML = filteredTasks.map(task => `
            <div class="task-item ${task.status} priority-${task.priority}" data-task-id="${task.id}">
                <div class="task-checkbox">
                    <input type="checkbox" 
                           ${task.status === 'completed' ? 'checked' : ''}
                           onchange="taskManager.updateTaskStatus(${task.id}, this.checked ? 'completed' : 'pending')">
                </div>
                <div class="task-content">
                    <div class="task-header">
                        <h3 class="task-title">${this.escapeHtml(task.title)}</h3>
                        <div class="task-actions">
                            <button class="btn-icon" onclick="taskManager.editTask(${task.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon" onclick="taskManager.deleteTask(${task.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    ${task.description ? `<p class="task-description">${this.escapeHtml(task.description)}</p>` : ''}
                    <div class="task-meta">
                        ${task.due_date ? `
                            <span class="due-date ${this.isOverdue(task.due_date) ? 'overdue' : ''}">
                                <i class="fas fa-calendar"></i>
                                ${this.formatDate(task.due_date)}
                            </span>
                        ` : ''}
                        <span class="priority-badge ${task.priority}">
                            ${this.getPriorityText(task.priority)}
                        </span>
                        ${task.tags && task.tags.length > 0 ? `
                            <div class="task-tags">
                                ${task.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }

    // 应用筛选条件
    getFilteredTasks() {
        let filteredTasks = this.tasks;
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();

        // 状态筛选
        if (this.currentFilter !== 'all') {
            filteredTasks = filteredTasks.filter(task => task.status === this.currentFilter);
        }

        // 搜索筛选
        if (searchTerm) {
            filteredTasks = filteredTasks.filter(task =>
                task.title.toLowerCase().includes(searchTerm) ||
                (task.description && task.description.toLowerCase().includes(searchTerm)) ||
                (task.tags && task.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
            );
        }

        return filteredTasks;
    }

    // 应用筛选
    applyFilters() {
        this.renderTasks();
    }

    // 更新统计信息
    updateStatistics() {
        const totalTasks = this.tasks.length;
        const completedTasks = this.tasks.filter(task => task.status === 'completed').length;
        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        const totalTasksEl = document.getElementById('totalTasks');
        const completedTasksEl = document.getElementById('completedTasks');
        const completionRateEl = document.getElementById('completionRate');
        const progressBar = document.getElementById('completionProgress');

        if (totalTasksEl) totalTasksEl.textContent = totalTasks;
        if (completedTasksEl) completedTasksEl.textContent = completedTasks;
        if (completionRateEl) completionRateEl.textContent = `${completionRate}%`;
        if (progressBar) progressBar.style.width = `${completionRate}%`;
    }

    // 用户认证相关方法
    async login() {
        const formData = new FormData(document.getElementById('loginForm'));
        const credentials = {
            email: formData.get('email'),
            password: formData.get('password')
        };

        try {
            const data = await this.makeRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify(credentials)
            });

            localStorage.setItem('authToken', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            this.currentUser = data.user;

            this.showNotification('登录成功', 'success');
            this.closeModal('loginModal');
            this.loadTasks();
            this.updateUserInterface();
        } catch (error) {
            console.error('Login failed:', error);
            this.showNotification('登录失败，请检查邮箱和密码', 'error');
        }
    }

    async register() {
        const formData = new FormData(document.getElementById('registerForm'));
        const userData = {
            username: formData.get('username'),
            email: formData.get('email'),
            password: formData.get('password')
        };

        try {
            await this.makeRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify(userData)
            });

            this.showNotification('注册成功，请登录', 'success');
            this.closeModal('registerModal');
            this.openModal('loginModal');
        } catch (error) {
            console.error('Registration failed:', error);
            this.showNotification('注册失败，用户名或邮箱可能已被使用', 'error');
        }
    }

    // 管理员登录
    async adminLogin() {
        const formData = new FormData(document.getElementById('adminLoginForm'));
        const credentials = {
            username: formData.get('username'),
            password: formData.get('password')
        };

        try {
            const response = await fetch(`${this.apiBaseUrl}/auth/admin-login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(credentials)
            });

            if (!response.ok) {
                throw new Error('管理员登录失败');
            }

            const data = await response.json();

            localStorage.setItem('authToken', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            this.currentUser = data.user;

            this.showNotification('管理员登录成功', 'success');
            this.closeModal('adminLoginModal');
            this.updateUserInterface();

            // 打开管理员面板
            this.openAdminPanel();

        } catch (error) {
            console.error('Admin login failed:', error);
            this.showNotification('管理员登录失败，请检查账号密码', 'error');
        }
    }

    logout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        this.currentUser = null;
        this.tasks = [];

        this.updateUserInterface();
        this.renderTasks();
        this.showNotification('已退出登录', 'info');
    }

    checkAuthStatus() {
        const token = localStorage.getItem('authToken');
        const user = localStorage.getItem('user');

        if (token && user) {
            this.currentUser = JSON.parse(user);
            this.updateUserInterface();
        }
    }

    updateUserInterface() {
        const authSection = document.getElementById('authSection');
        const userSection = document.getElementById('userSection');
        const userName = document.getElementById('userName');

        if (this.currentUser && authSection && userSection && userName) {
            authSection.style.display = 'none';
            userSection.style.display = 'flex';

            if (this.currentUser.role === 'admin') {
                userName.innerHTML = `${this.currentUser.username} <span class="admin-badge">管理员</span>`;

                // 添加管理员面板按钮
                if (!document.getElementById('adminPanelBtn')) {
                    const adminBtn = document.createElement('button');
                    adminBtn.id = 'adminPanelBtn';
                    adminBtn.className = 'btn btn-primary';
                    adminBtn.innerHTML = '<i class="fas fa-crown"></i> 管理员面板';
                    adminBtn.onclick = () => this.openAdminPanel();
                    userSection.appendChild(adminBtn);
                }
            } else {
                userName.textContent = this.currentUser.username;

                // 移除管理员按钮（如果存在）
                const adminBtn = document.getElementById('adminPanelBtn');
                if (adminBtn) {
                    adminBtn.remove();
                }
            }
        } else if (authSection && userSection) {
            authSection.style.display = 'flex';
            userSection.style.display = 'none';

            // 添加管理员登录按钮
            if (!document.getElementById('adminLoginBtn')) {
                const adminLoginBtn = document.createElement('button');
                adminLoginBtn.id = 'adminLoginBtn';
                adminLoginBtn.className = 'btn admin-login-btn';
                adminLoginBtn.innerHTML = '<i class="fas fa-crown"></i> 管理员';
                adminLoginBtn.onclick = () => this.openModal('adminLoginModal');
                authSection.appendChild(adminLoginBtn);
            }
        }
    }

    // 工具方法
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    isOverdue(dateString) {
        if (!dateString) return false;
        return new Date(dateString) < new Date();
    }

    getPriorityText(priority) {
        const priorityMap = {
            'low': '低',
            'medium': '中',
            'high': '高',
            'urgent': '紧急'
        };
        return priorityMap[priority] || priority;
    }

    showNotification(message, type = 'info') {
        const notifications = document.getElementById('notifications');
        if (!notifications) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">&times;</button>
        `;

        notifications.appendChild(notification);

        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 3000);
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'block';
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // 编辑任务
    editTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            // 填充表单数据
            document.getElementById('title').value = task.title;
            document.getElementById('description').value = task.description || '';
            document.getElementById('priority').value = task.priority;
            document.getElementById('due_date').value = task.due_date ? task.due_date.slice(0, 16) : '';
            document.getElementById('estimated_hours').value = task.estimated_hours || '';
            document.getElementById('tags').value = task.tags ? task.tags.join(', ') : '';

            // 更改表单行为为更新
            const form = document.getElementById('taskForm');
            form.onsubmit = (e) => {
                e.preventDefault();
                this.updateTask(taskId);
            };

            // 更改模态框标题
            document.querySelector('#taskModal .modal-header h2').textContent = '编辑任务';

            this.openModal('taskModal');
        }
    }

    async updateTask(taskId) {
        const formData = new FormData(document.getElementById('taskForm'));
        const taskData = {
            title: formData.get('title'),
            description: formData.get('description'),
            priority: formData.get('priority'),
            due_date: formData.get('due_date'),
            estimated_hours: parseFloat(formData.get('estimated_hours')) || null,
            tags: formData.get('tags') ? formData.get('tags').split(',').map(tag => tag.trim()) : []
        };

        try {
            await this.makeRequest(`/tasks/${taskId}`, {
                method: 'PUT',
                body: JSON.stringify(taskData)
            });

            // 重置表单行为
            const form = document.getElementById('taskForm');
            form.onsubmit = (e) => {
                e.preventDefault();
                this.createTask();
            };
            form.reset();

            document.querySelector('#taskModal .modal-header h2').textContent = '新建任务';

            this.closeModal('taskModal');
            this.loadTasks();
            this.showNotification('任务更新成功', 'success');
        } catch (error) {
            console.error('Failed to update task:', error);
        }
    }

    // ==================== 管理员功能 ====================

    // 打开管理员面板
    openAdminPanel() {
        this.openModal('adminPanelModal');
        this.loadAdminDashboard();
    }

    // 打开管理员标签页
    openAdminTab(tabName) {
        // 隐藏所有标签内容
        document.querySelectorAll('.admin-tab-content').forEach(tab => {
            tab.classList.remove('active');
        });

        // 取消所有标签的激活状态
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // 显示选中的标签内容
        document.getElementById('admin' + this.capitalizeFirst(tabName) + 'Tab').classList.add('active');

        // 激活选中的标签
        event.target.classList.add('active');

        // 加载对应标签的数据
        switch(tabName) {
            case 'dashboard':
                this.loadAdminDashboard();
                break;
            case 'users':
                this.loadAdminUsers();
                break;
            case 'tasks':
                this.loadAdminTasks();
                break;
            case 'reports':
                this.loadAdminReports();
                break;
        }
    }

    // 加载管理员仪表板
    async loadAdminDashboard() {
        try {
            const data = await this.makeRequest('/admin/stats');

            // 更新基本统计
            document.getElementById('adminTotalUsers').textContent = data.totalUsers;
            document.getElementById('adminTotalTasks').textContent = data.totalTasks;
            document.getElementById('adminActiveUsers').textContent = data.activeUsers;

            const completionRate = data.totalTasks > 0 ?
                Math.round((data.tasksByStatus.completed || 0) / data.totalTasks * 100) : 0;
            document.getElementById('adminCompletionRate').textContent = completionRate + '%';

            // 更新状态图表
            this.updateStatusChart(data.tasksByStatus);

            // 更新优先级图表
            this.updatePriorityChart(data.tasksByPriority);

            // 更新最近用户列表
            this.updateRecentUsers(data.recentRegistrations);

            // 更新活跃用户列表
            this.updateTopUsers(data.topActiveUsers);

        } catch (error) {
            console.error('加载管理员仪表板失败:', error);
            this.showNotification('加载仪表板数据失败', 'error');
        }
    }

    // 更新状态图表
    updateStatusChart(statusData) {
        const chart = document.getElementById('adminStatusChart');
        const total = Object.values(statusData).reduce((sum, count) => sum + count, 0);

        chart.innerHTML = Object.entries(statusData).map(([status, count]) => {
            const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
            const height = total > 0 ? Math.max((count / total) * 100, 10) : 10;

            return `
                <div class="chart-bar" style="height: ${height}%; background: ${this.getStatusColor(status)}" 
                     title="${this.getStatusText(status)}: ${count} (${percentage}%)">
                    <div class="chart-value">${count}</div>
                    <div class="chart-label">${this.getStatusText(status)}</div>
                </div>
            `;
        }).join('');
    }

    // 更新优先级图表
    updatePriorityChart(priorityData) {
        const chart = document.getElementById('adminPriorityChart');
        const total = Object.values(priorityData).reduce((sum, count) => sum + count, 0);

        chart.innerHTML = Object.entries(priorityData).map(([priority, count]) => {
            const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
            const height = total > 0 ? Math.max((count / total) * 100, 10) : 10;

            return `
                <div class="chart-bar" style="height: ${height}%; background: ${this.getPriorityColor(priority)}" 
                     title="${this.getPriorityText(priority)}: ${count} (${percentage}%)">
                    <div class="chart-value">${count}</div>
                    <div class="chart-label">${this.getPriorityText(priority)}</div>
                </div>
            `;
        }).join('');
    }

    // 更新最近用户列表
    updateRecentUsers(users) {
        const list = document.getElementById('recentUsersList');

        list.innerHTML = users.map(user => `
            <div class="user-list-item">
                <div class="user-info">
                    <h5>${user.username}</h5>
                    <p>${user.email}</p>
                    <small>注册: ${new Date(user.created_at).toLocaleDateString()}</small>
                </div>
                <div class="user-stats">
                    <span class="count">${user.task_count}</span>
                    <div class="label">任务数</div>
                </div>
            </div>
        `).join('');
    }

    // 更新活跃用户列表
    updateTopUsers(users) {
        const list = document.getElementById('topUsersList');

        list.innerHTML = users.map(user => `
            <div class="user-list-item">
                <div class="user-info">
                    <h5>${user.username}</h5>
                    <p>${user.email}</p>
                </div>
                <div class="user-stats">
                    <span class="count">${user.total_tasks}</span>
                    <div class="label">总任务</div>
                    <div class="completion">${Math.round(user.completion_rate * 100)}% 完成</div>
                </div>
            </div>
        `).join('');
    }

    // 加载管理员用户列表
    async loadAdminUsers() {
        try {
            const search = document.getElementById('userSearch').value;
            const sort = document.getElementById('userSort').value;

            const data = await this.makeRequest(`/admin/users?search=${search}&sort=${sort}`);
            const tbody = document.getElementById('adminUsersTable');

            tbody.innerHTML = data.data.map(user => `
                <tr>
                    <td>${user.id}</td>
                    <td>${user.username}</td>
                    <td>${user.email}</td>
                    <td>${new Date(user.created_at).toLocaleDateString()}</td>
                    <td>${user.task_count}</td>
                    <td>${user.task_count > 0 ? Math.round((user.completed_tasks / user.task_count) * 100) : 0}%</td>
                    <td class="actions">
                        <button class="btn-info" onclick="taskManager.viewUserDetails(${user.id})">详情</button>
                        <button class="btn-danger" onclick="taskManager.deleteUser(${user.id}, '${user.username}')">删除</button>
                    </td>
                </tr>
            `).join('');

        } catch (error) {
            console.error('加载用户列表失败:', error);
            this.showNotification('加载用户列表失败', 'error');
        }
    }

    // 加载管理员任务列表
    async loadAdminTasks() {
        try {
            const search = document.getElementById('taskSearch').value;
            const userId = document.getElementById('taskUserFilter').value;
            const status = document.getElementById('taskStatusFilter').value;
            const sort = document.getElementById('taskSort').value;

            let url = `/admin/tasks?search=${search}&sort=${sort}`;
            if (userId) url += `&userId=${userId}`;
            if (status) url += `&status=${status}`;

            const data = await this.makeRequest(url);
            const tbody = document.getElementById('adminTasksTable');

            // 更新用户筛选器
            const userFilter = document.getElementById('taskUserFilter');
            if (userFilter.children.length === 1) {
                const users = await this.makeRequest('/admin/users');
                users.data.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.id;
                    option.textContent = user.username;
                    userFilter.appendChild(option);
                });
            }

            tbody.innerHTML = data.data.map(task => `
                <tr>
                    <td>${task.id}</td>
                    <td title="${task.description || '无描述'}">${task.title}</td>
                    <td>${task.username}</td>
                    <td><span class="status-badge status-${task.status}">${this.getStatusText(task.status)}</span></td>
                    <td><span class="priority-badge priority-${task.priority}">${this.getPriorityText(task.priority)}</span></td>
                    <td>${task.due_date ? new Date(task.due_date).toLocaleDateString() : '无'}</td>
                    <td>${new Date(task.created_at).toLocaleDateString()}</td>
                    <td class="actions">
                        <button class="btn-danger" onclick="taskManager.deleteAdminTask(${task.id}, '${task.title}')">删除</button>
                    </td>
                </tr>
            `).join('');

        } catch (error) {
            console.error('加载任务列表失败:', error);
            this.showNotification('加载任务列表失败', 'error');
        }
    }

    // 查看用户详情
    async viewUserDetails(userId) {
        try {
            const data = await this.makeRequest(`/admin/users/${userId}`);

            alert(`用户详情: ${data.username}
邮箱: ${data.email}
注册时间: ${new Date(data.created_at).toLocaleString()}
总任务数: ${data.statistics.total_tasks}
已完成: ${data.statistics.completed_tasks}
进行中: ${data.statistics.in_progress_tasks}
待处理: ${data.statistics.pending_tasks}
完成率: ${Math.round(data.statistics.completion_rate * 100)}%`);

        } catch (error) {
            console.error('查看用户详情失败:', error);
            this.showNotification('查看用户详情失败', 'error');
        }
    }

    // 删除用户
    async deleteUser(userId, username) {
        if (!confirm(`确定要删除用户 "${username}" 吗？此操作将删除该用户的所有任务且不可恢复！`)) {
            return;
        }

        try {
            await this.makeRequest(`/admin/users/${userId}`, {
                method: 'DELETE'
            });

            this.showNotification(`用户 "${username}" 删除成功`, 'success');
            this.loadAdminUsers();
            this.loadAdminDashboard(); // 刷新统计

        } catch (error) {
            console.error('删除用户失败:', error);
            this.showNotification('删除用户失败', 'error');
        }
    }

    // 删除任务（管理员）
    async deleteAdminTask(taskId, taskTitle) {
        if (!confirm(`确定要删除任务 "${taskTitle}" 吗？此操作不可恢复！`)) {
            return;
        }

        try {
            await this.makeRequest(`/admin/tasks/${taskId}`, {
                method: 'DELETE'
            });

            this.showNotification(`任务 "${taskTitle}" 删除成功`, 'success');
            this.loadAdminTasks();

        } catch (error) {
            console.error('删除任务失败:', error);
            this.showNotification('删除任务失败', 'error');
        }
    }

    // 加载统计报告
    async loadAdminReports() {
        try {
            const stats = await this.makeRequest('/admin/stats');
            const users = await this.makeRequest('/admin/users');
            const tasks = await this.makeRequest('/admin/tasks');

            const report = document.getElementById('systemReport');
            const completionRate = stats.totalTasks > 0 ?
                Math.round((stats.tasksByStatus.completed || 0) / stats.totalTasks * 100) : 0;

            report.innerHTML = `
                <div class="report-section">
                    <h4>系统概览</h4>
                    <div class="report-stats">
                        <div class="report-stat">
                            <span class="value">${stats.totalUsers}</span>
                            <span class="label">注册用户</span>
                        </div>
                        <div class="report-stat">
                            <span class="value">${stats.activeUsers}</span>
                            <span class="label">活跃用户</span>
                        </div>
                        <div class="report-stat">
                            <span class="value">${stats.totalTasks}</span>
                            <span class="label">总任务数</span>
                        </div>
                        <div class="report-stat">
                            <span class="value">${completionRate}%</span>
                            <span class="label">完成率</span>
                        </div>
                    </div>
                </div>
                
                <div class="report-section">
                    <h4>任务分布</h4>
                    <p><strong>状态分布:</strong></p>
                    <ul>
                        ${Object.entries(stats.tasksByStatus).map(([status, count]) => `
                            <li>${this.getStatusText(status)}: ${count} 个任务</li>
                        `).join('')}
                    </ul>
                    <p><strong>优先级分布:</strong></p>
                    <ul>
                        ${Object.entries(stats.tasksByPriority).map(([priority, count]) => `
                            <li>${this.getPriorityText(priority)}: ${count} 个任务</li>
                        `).join('')}
                    </ul>
                </div>
                
                <div class="report-section">
                    <h4>用户活跃度</h4>
                    <p>最活跃的前5名用户:</p>
                    <ol>
                        ${stats.topActiveUsers.slice(0, 5).map(user => `
                            <li>${user.username} - ${user.total_tasks} 个任务 (${Math.round(user.completion_rate * 100)}% 完成)</li>
                        `).join('')}
                    </ol>
                </div>
                
                <div class="report-section">
                    <h4>系统信息</h4>
                    <p>报告生成时间: ${new Date().toLocaleString()}</p>
                    <p>数据最后更新: ${new Date().toLocaleString()}</p>
                </div>
            `;

        } catch (error) {
            console.error('加载报告失败:', error);
            this.showNotification('加载报告失败', 'error');
        }
    }

    // 生成报告
    generateReport() {
        const reportContent = document.getElementById('systemReport').innerText;
        const blob = new Blob([reportContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `系统报告_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showNotification('报告已生成并下载', 'success');
    }

    // 管理员工具函数
    capitalizeFirst(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    getStatusColor(status) {
        const colors = {
            'pending': '#f39c12',
            'in_progress': '#3498db',
            'completed': '#27ae60',
            'cancelled': '#95a5a6'
        };
        return colors[status] || '#bdc3c7';
    }

    getPriorityColor(priority) {
        const colors = {
            'low': '#bdc3c7',
            'medium': '#3498db',
            'high': '#e67e22',
            'urgent': '#e74c3c'
        };
        return colors[priority] || '#bdc3c7';
    }

    getStatusText(status) {
        const statusMap = {
            'pending': '待办',
            'in_progress': '进行中',
            'completed': '已完成',
            'cancelled': '已取消'
        };
        return statusMap[status] || status;
    }
}

// 初始化应用
const taskManager = new TaskManager();

// 全局函数，用于HTML中的onclick事件
function openTaskModal() {
    // 重置表单
    document.getElementById('taskForm').reset();
    document.querySelector('#taskModal .modal-header h2').textContent = '新建任务';
    const form = document.getElementById('taskForm');
    form.onsubmit = (e) => {
        e.preventDefault();
        taskManager.createTask();
    };
    taskManager.openModal('taskModal');
}

function openLoginModal() {
    taskManager.openModal('loginModal');
}

function openRegisterModal() {
    taskManager.openModal('registerModal');
}

function openAdminLogin() {
    taskManager.openModal('adminLoginModal');
}

function openAdminPanel() {
    taskManager.openAdminPanel();
}

function openAdminTab(tabName) {
    taskManager.openAdminTab(tabName);
}

function closeModal(modalId) {
    taskManager.closeModal(modalId);
}

function logout() {
    taskManager.logout();
}

function loadAdminDashboard() {
    taskManager.loadAdminDashboard();
}

function loadAdminUsers() {
    taskManager.loadAdminUsers();
}

function loadAdminTasks() {
    taskManager.loadAdminTasks();
}

function loadAdminReports() {
    taskManager.loadAdminReports();
}

function generateReport() {
    taskManager.generateReport();
}

// 点击模态框外部关闭
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
};

// 用户搜索功能
document.addEventListener('DOMContentLoaded', function() {
    const userSearch = document.getElementById('userSearch');
    if (userSearch) {
        let searchTimeout;
        userSearch.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                taskManager.loadAdminUsers();
            }, 500);
        });
    }
});