import { useState, useEffect, useCallback } from 'react'
import './index.css'

const STORAGE_KEY = 'procrastino_tasks'
const NOTIFICATION_PERMISSIONS_KEY = 'procrastino_notifications'

const W1_MAP = {
  low: 10,
  medium: 30,
  high: 60,
  critical: 90
}

const REMINDER_INTERVALS = {
  low: 24 * 60 * 60 * 1000,
  medium: 4 * 60 * 60 * 1000,
  high: 2 * 60 * 60 * 1000,
  critical: 60 * 60 * 1000,
  overdue: 30 * 60 * 1000
}

function generateId() {
  return Math.random().toString(36).substr(2, 9)
}

function calculateUrgency(deadline, createdAt, w1, k) {
  const now = Date.now()
  const timeRemaining = deadline - now

  if (timeRemaining <= 0) return 100

  const totalDuration = deadline - createdAt

  if (totalDuration <= 0) return 100

  const rawUrgency = w1 + (k / (timeRemaining / (1000 * 60 * 60)))

  const normalized = Math.min(100, Math.max(0, rawUrgency))
  return Math.round(normalized)
}

function getUrgencyLevel(urgency) {
  if (urgency >= 80) return 'overdue'
  if (urgency >= 60) return 'critical'
  if (urgency >= 40) return 'high'
  if (urgency >= 20) return 'medium'
  return 'low'
}

function formatDeadline(timestamp) {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (isToday) return `Today at ${time}`

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isTomorrow = date.toDateString() === tomorrow.toDateString()

  if (isTomorrow) return `Tomorrow at ${time}`

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` at ${time}`
}

function App() {
  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    try {
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('procrastino_theme')
    return saved === 'dark'
  })
  const [formOpen, setFormOpen] = useState(true)
  const [notification, setNotification] = useState(null)

  const [newTask, setNewTask] = useState({
    name: '',
    deadline: '',
    importance: 'medium',
    k: 5
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('procrastino_theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) return false

    if (Notification.permission === 'granted') return true

    const permission = await Notification.requestPermission()
    localStorage.setItem(NOTIFICATION_PERMISSIONS_KEY, permission)
    return permission === 'granted'
  }, [])

  const showNotification = useCallback((task) => {
    if (!('Notification' in window)) return
    if (Notification.permission !== 'granted') return

    const urgency = calculateUrgency(task.deadline, task.createdAt, task.w1, task.k)
    const urgencyLevel = getUrgencyLevel(urgency)

    new Notification(`⚠️ ${task.name}`, {
      body: `Urgency: ${urgency}% - ${urgencyLevel.toUpperCase()}. Deadline: ${formatDeadline(task.deadline)}`,
      icon: '/favicon.svg',
      tag: task.id,
      requireInteraction: urgencyLevel === 'overdue'
    })
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setTasks(prev => [...prev])
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const checkReminders = () => {
      const lastReminder = parseInt(localStorage.getItem('procrastino_last_reminder') || '0', 10)
      const now = Date.now()

      tasks.filter(t => t.status === 'pending').forEach(task => {
        const urgency = calculateUrgency(task.deadline, task.createdAt, task.w1, task.k)
        const urgencyLevel = getUrgencyLevel(urgency)
        const interval = REMINDER_INTERVALS[urgencyLevel]

        if (now - lastReminder > interval) {
          showNotification(task)
          localStorage.setItem('procrastino_last_reminder', now.toString())
        }
      })
    }

    const interval = setInterval(checkReminders, 60000)
    checkReminders()

    return () => clearInterval(interval)
  }, [tasks, showNotification])

  const handleAddTask = async (e) => {
    e.preventDefault()

    if (!newTask.name.trim() || !newTask.deadline) return

    const deadlineTimestamp = new Date(newTask.deadline).getTime()
    const now = Date.now()

    if (deadlineTimestamp <= now) {
      setNotification({ type: 'error', message: 'Deadline must be in the future!' })
      setTimeout(() => setNotification(null), 3000)
      return
    }

    const task = {
      id: generateId(),
      name: newTask.name.trim(),
      deadline: deadlineTimestamp,
      createdAt: now,
      w1: W1_MAP[newTask.importance],
      k: parseInt(newTask.k, 10),
      status: 'pending'
    }

    setTasks(prev => [...prev, task])
    setNewTask({ name: '', deadline: '', importance: 'medium', k: 5 })

    await requestNotificationPermission()
  }

  const handleCompleteTask = (id) => {
    setTasks(prev =>
      prev.map(t => t.id === id ? { ...t, status: 'completed' } : t)
    )
  }

  const handleDeleteTask = (id) => {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'pending' ? -1 : 1
    }

    const urgencyA = calculateUrgency(a.deadline, a.createdAt, a.w1, a.k)
    const urgencyB = calculateUrgency(b.deadline, b.createdAt, b.w1, b.k)

    return urgencyB - urgencyA
  })

  const pendingTasks = tasks.filter(t => t.status === 'pending')
  const completedTasks = tasks.filter(t => t.status === 'completed')

  return (
    <div>
      <header className="app-header">
        <h1 className="app-title">
          Procrasti<span>No</span>
        </h1>
        <button
          className="theme-toggle"
          onClick={() => setDarkMode(!darkMode)}
        >
          {darkMode ? '☀️ Light' : '🌙 Dark'}
        </button>
      </header>

      <div className="stats">
        <div className="stat">
          <div className="stat-value">{pendingTasks.length}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat">
          <div className="stat-value">{completedTasks.length}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat">
          <div className="stat-value">
            {pendingTasks.length > 0
              ? Math.max(...pendingTasks.map(t =>
                  calculateUrgency(t.deadline, t.createdAt, t.w1, t.k)
                ))
              : 0}%
          </div>
          <div className="stat-label">Max Urgency</div>
        </div>
      </div>

      <form className="add-task-form" onSubmit={handleAddTask}>
        <button
          type="button"
          className={`form-toggle ${formOpen ? 'open' : ''}`}
          onClick={() => setFormOpen(!formOpen)}
        >
          <span>{formOpen ? 'Hide Add Task' : 'Add New Task'}</span>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M5 8l5-5 5 5H5z" />
          </svg>
        </button>

        {formOpen && (
          <div className="form-content">
            <div className="form-group full-width">
              <label className="form-label">Task Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="What needs to be done?"
                value={newTask.name}
                onChange={e => setNewTask({ ...newTask, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Deadline</label>
              <input
                type="datetime-local"
                className="form-input"
                value={newTask.deadline}
                onChange={e => setNewTask({ ...newTask, deadline: e.target.value })}
                min={new Date().toISOString().slice(0, 16)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Importance</label>
              <select
                className="form-select"
                value={newTask.importance}
                onChange={e => setNewTask({ ...newTask, importance: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">
                Time Sensitivity (K): <span className="range-value">{newTask.k}</span>
              </label>
              <input
                type="range"
                className="form-range"
                min="1"
                max="10"
                value={newTask.k}
                onChange={e => setNewTask({ ...newTask, k: e.target.value })}
              />
            </div>

            <button type="submit" className="submit-btn">
              Add Task
            </button>
          </div>
        )}
      </form>

      <div className="tasks-list">
        {sortedTasks.length === 0 ? (
          <div className="empty-state">
            <h3>No tasks yet</h3>
            <p>Add a task above to get started. Don't procrastinate!</p>
          </div>
        ) : (
          sortedTasks.map(task => {
            const urgency = calculateUrgency(task.deadline, task.createdAt, task.w1, task.k)
            const urgencyLevel = getUrgencyLevel(urgency)

            return (
              <div
                key={task.id}
                className={`task-card urgency-${urgencyLevel} ${task.status}`}
              >
                <div className="task-header">
                  <div>
                    <div className="task-name">{task.name}</div>
                    <div className="task-deadline">
                      Deadline: {formatDeadline(task.deadline)}
                    </div>
                  </div>
                </div>

                <div className="task-urgency">
                  <div className="urgency-bar">
                    <div className="urgency-fill" />
                  </div>
                  <div className="urgency-score">{urgency}%</div>
                </div>

                <div className="task-actions">
                  <button
                    className={`task-btn complete ${task.status}`}
                    onClick={() => handleCompleteTask(task.id)}
                  >
                    {task.status === 'completed' ? '✓ Done!' : 'Mark Done'}
                  </button>
                  <button
                    className="task-btn delete"
                    onClick={() => handleDeleteTask(task.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {notification && (
        <div className="notification-banner">
          <h4>{notification.type === 'error' ? '⚠️ Error' : '📬 Reminder'}</h4>
          <p>{notification.message}</p>
        </div>
      )}
    </div>
  )
}

export default App