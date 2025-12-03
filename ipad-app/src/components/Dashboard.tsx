import React, { useEffect, useState } from 'react';
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as CheckCircleIcon,
  Cloud as CloudIcon,
  Event as EventIcon,
  HelpOutline as HelpIcon,
  Logout as LogoutIcon,
  MailOutline as MailIcon,
  Memory as MemoryIcon,
  PlayArrow as PlayArrowIcon,
  Refresh as RefreshIcon,
  Schedule as ScheduleIcon,
  Send as SendIcon,
  Task as TaskIcon,
  Book as BookIcon
} from '@mui/icons-material';
import ApiService from '../services/ApiService';
import UsageTracker from '../services/UsageTracker';
import { RoutineSuggestion } from '../services/UsageTracker';

interface DashboardProps {
  onLogout: () => void;
}

interface Memory {
  id: string;
  title?: string;
  content?: string;
  category?: string;
}

interface Task {
  id: string;
  title: string;
  completed: boolean;
  due?: string;
}

interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

interface Email {
  id?: string;
  subject?: string;
  from?: string;
  snippet?: string;
}

interface DriveFile {
  id?: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

interface Protocol {
  id?: string;
  name: string;
  description?: string;
  totalDuration?: number;
}

const Dashboard: React.FC<DashboardProps> = ({ onLogout }) => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [newMemory, setNewMemory] = useState('');
  const [newTask, setNewTask] = useState('');
  const [quickProtocol, setQuickProtocol] = useState('');
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [assistantResult, setAssistantResult] = useState<string | null>(null);
  const [learningEnabled, setLearningEnabled] = useState<boolean>(UsageTracker.isLearningEnabled());
  const [proposedRoutines, setProposedRoutines] = useState<RoutineSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    setProposedRoutines(UsageTracker.getRoutineSuggestions());
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [memoriesData, tasksData, eventsData, emailsData, filesData, protocolsData] = await Promise.all([
        ApiService.getMemories(),
        ApiService.getTasks(),
        ApiService.getCalendarEvents(),
        ApiService.getUnreadEmails(5),
        ApiService.getRecentFiles(5),
        ApiService.getProtocols()
      ]);
      setMemories(memoriesData.results || memoriesData || []);
      setTasks(Array.isArray(tasksData) ? tasksData : tasksData.tasks || []);
      setEvents(Array.isArray(eventsData) ? eventsData : []);
      setEmails(Array.isArray(emailsData) ? emailsData : emailsData.messages || []);
      setFiles(Array.isArray(filesData) ? filesData : filesData.files || []);
      setProtocols(Array.isArray(protocolsData) ? protocolsData : protocolsData.protocols || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMemory = async () => {
    if (!newMemory.trim()) return;
    try {
      const response = await ApiService.addMemory(newMemory);
      const memory = response.memory || response;
      setMemories([memory, ...memories]);
      setNewMemory('');
      setSuccessMessage('Memory added');
      setTimeout(() => setSuccessMessage(null), 2500);
      UsageTracker.log('memory', 'Memory captured');
      setProposedRoutines(UsageTracker.getRoutineSuggestions());
    } catch (err: any) {
      setError(err.message || 'Failed to add memory');
    }
  };

  const handleAddTask = async () => {
    if (!newTask.trim()) return;
    try {
      const response = await ApiService.addTask(newTask);
      const task = response.task || response;
      setTasks([...tasks, task]);
      setNewTask('');
      setSuccessMessage('Task added');
      setTimeout(() => setSuccessMessage(null), 2500);
      UsageTracker.log('task', 'Task added');
      setProposedRoutines(UsageTracker.getRoutineSuggestions());
    } catch (err: any) {
      setError(err.message || 'Failed to add task');
    }
  };

  const handleToggleTask = async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;
      const updatedTask = await ApiService.updateTask(taskId, !task.completed);
      setTasks(tasks.map(t => t.id === taskId ? updatedTask : t));
    } catch (err: any) {
      setError(err.message || 'Failed to update task');
    }
  };

  const handleStartProtocol = async (name?: string) => {
    const target = name || quickProtocol;
    if (!target.trim()) return;
    try {
      await ApiService.startProtocol(target);
      setSuccessMessage(`Started protocol: ${target}`);
      setQuickProtocol('');
      UsageTracker.log('protocol', target);
      setProposedRoutines(UsageTracker.getRoutineSuggestions());
    } catch (err: any) {
      setError(err.message || 'Failed to start protocol');
    }
  };

  const handleAssistantPrompt = async () => {
    if (!assistantPrompt.trim()) return;
    try {
      const result = await ApiService.processCommand(assistantPrompt);
      setAssistantResult(JSON.stringify(result, null, 2));
      setAssistantPrompt('');
      setSuccessMessage('Assistant responded');
      UsageTracker.log('assistant', 'Prompt');
      setProposedRoutines(UsageTracker.getRoutineSuggestions());
    } catch (err: any) {
      setError(err.message || 'Assistant request failed');
    }
  };

  const formatEventTime = (event: CalendarEvent) => {
    const start = event.start.dateTime || event.start.date;
    if (!start) return '';
    const date = new Date(start);
    if (event.start.date) return date.toLocaleDateString();
    return date.toLocaleString();
  };

  const nextUpItems = () => {
    const items: Array<{ title: string; time?: string; type: 'task' | 'event' }> = [];
    tasks.filter(t => !t.completed).slice(0, 3).forEach(t => items.push({ title: t.title, time: t.due, type: 'task' }));
    events.slice(0, 3).forEach(ev => items.push({ title: ev.summary, time: ev.start.dateTime || ev.start.date, type: 'event' }));
    return items.slice(0, 5);
  };

  const toggleLearning = () => {
    const next = !learningEnabled;
    UsageTracker.setLearning(next);
    setLearningEnabled(next);
    setProposedRoutines(UsageTracker.getRoutineSuggestions());
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Kelly Assistant Mission Control
          </Typography>
          <IconButton color="inherit" onClick={loadData} disabled={loading}>
            <RefreshIcon />
          </IconButton>
          <Button color="inherit" onClick={onLogout} startIcon={<LogoutIcon />}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3, flexGrow: 1 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {successMessage && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        )}
        {loading && (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        )}

        <Grid container spacing={3}>
          {/* What’s next */}
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6">What’s Next</Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip label="Online" color="success" size="small" />
                    <Tooltip title="Refresh all">
                      <IconButton onClick={loadData} disabled={loading}>
                        <RefreshIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Learning mode">
                      <Chip
                        label={learningEnabled ? 'Learning week' : 'Learning off'}
                        color={learningEnabled ? 'primary' : 'default'}
                        size="small"
                        onClick={toggleLearning}
                        variant={learningEnabled ? 'filled' : 'outlined'}
                        sx={{ cursor: 'pointer' }}
                      />
                    </Tooltip>
                  </Stack>
                </Box>
                <List dense>
                  {nextUpItems().map((item, idx) => (
                    <ListItem key={`${item.title}-${idx}`}>
                      <Avatar sx={{ mr: 1, bgcolor: item.type === 'task' ? 'primary.main' : 'secondary.main' }}>
                        {item.type === 'task' ? <TaskIcon fontSize="small" /> : <EventIcon fontSize="small" />}
                      </Avatar>
                      <ListItemText
                        primary={item.title}
                        secondary={item.time ? new Date(item.time).toLocaleString() : undefined}
                      />
                    </ListItem>
                  ))}
                  {nextUpItems().length === 0 && (
                    <ListItem>
                      <ListItemText primary="Nothing urgent right now" secondary="Enjoy the calm" />
                    </ListItem>
                  )}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Assistant panel */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Assistant</Typography>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Ask or instruct..."
                  value={assistantPrompt}
                  onChange={(e) => setAssistantPrompt(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAssistantPrompt()}
                  InputProps={{
                    endAdornment: (
                      <Tooltip title="Send">
                        <IconButton onClick={handleAssistantPrompt}>
                          <SendIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )
                  }}
                  sx={{ mb: 1 }}
                />
                {assistantResult && (
                  <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 150, overflow: 'auto', fontSize: 12 }}>
                    {assistantResult}
                  </Paper>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Tasks */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6">
                    <TaskIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Tasks
                  </Typography>
                  <Tooltip title="Add task">
                    <IconButton size="small" onClick={handleAddTask}>
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Add a task..."
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTask()}
                  />
                </Box>
                <List sx={{ maxHeight: 320, overflow: 'auto' }}>
                  {tasks.map((task) => (
                    <React.Fragment key={task.id}>
                      <ListItem>
                        <IconButton 
                          edge="start" 
                          onClick={() => handleToggleTask(task.id)}
                          color={task.completed ? 'success' : 'default'}
                        >
                          {task.completed ? <CheckCircleIcon /> : <ScheduleIcon />}
                        </IconButton>
                        <ListItemText
                          primary={task.title}
                          secondary={task.due ? `Due: ${new Date(task.due).toLocaleDateString()}` : null}
                          sx={{ 
                            textDecoration: task.completed ? 'line-through' : 'none',
                            opacity: task.completed ? 0.6 : 1
                          }}
                        />
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  ))}
                  {tasks.length === 0 && (
                    <ListItem>
                      <ListItemText primary="No tasks yet" secondary="Add your first task to get started" />
                    </ListItem>
                  )}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Routines */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <ScheduleIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Routines
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Protocol name to start..."
                    value={quickProtocol}
                    onChange={(e) => setQuickProtocol(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleStartProtocol()}
                  />
                  <IconButton color="primary" onClick={() => handleStartProtocol()}>
                    <PlayArrowIcon />
                  </IconButton>
                </Box>
                <List dense sx={{ maxHeight: 320, overflow: 'auto' }}>
                  {protocols.map((p) => (
                    <ListItem
                      key={p.id || p.name}
                      secondaryAction={
                        <Tooltip title="Start">
                          <IconButton edge="end" onClick={() => handleStartProtocol(p.name)}>
                            <PlayArrowIcon />
                          </IconButton>
                        </Tooltip>
                      }
                    >
                      <ListItemText
                        primary={p.name}
                        secondary={p.description || (p.totalDuration ? `${p.totalDuration} min` : undefined)}
                      />
                    </ListItem>
                  ))}
                  {protocols.length === 0 && (
                    <ListItem>
                      <ListItemText primary="No routines yet" secondary="Create one via voice or backend" />
                    </ListItem>
                  )}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Memories */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6">
                    <MemoryIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Memories
                  </Typography>
                  <Tooltip title="Add memory">
                    <IconButton size="small" onClick={handleAddMemory}>
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Add a memory..."
                    value={newMemory}
                    onChange={(e) => setNewMemory(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddMemory()}
                  />
                </Box>
                <List sx={{ maxHeight: 320, overflow: 'auto' }}>
                  {memories.map((memory) => (
                    <React.Fragment key={memory.id}>
                      <ListItem>
                        <ListItemText
                          primary={memory.title || (memory.content ? memory.content.substring(0, 50) : 'Memory')}
                          secondary={
                            <Box>
                              {memory.content && (
                                <Typography variant="caption" display="block">
                                  {memory.content}
                                </Typography>
                              )}
                              {memory.category && (
                                <Chip 
                                  label={memory.category} 
                                  size="small" 
                                  sx={{ mt: 0.5 }} 
                                />
                              )}
                            </Box>
                          }
                        />
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  ))}
                  {memories.length === 0 && (
                    <ListItem>
                      <ListItemText primary="No memories yet" secondary="Capture your first memory" />
                    </ListItem>
                  )}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Email + Drive */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <MailIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Unread Email
                </Typography>
                <List dense sx={{ maxHeight: 160, overflow: 'auto' }}>
                  {emails.map((mail) => (
                    <React.Fragment key={mail.id || mail.subject}>
                      <ListItem>
                        <ListItemText
                          primary={mail.subject || 'No subject'}
                          secondary={mail.from || mail.snippet}
                        />
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  ))}
                  {emails.length === 0 && (
                    <ListItem>
                      <ListItemText primary="Inbox is clear" />
                    </ListItem>
                  )}
                </List>
              </CardContent>
            </Card>

            <Card sx={{ mt: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <CloudIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Drive Recents
                </Typography>
                <List dense sx={{ maxHeight: 150, overflow: 'auto' }}>
                  {files.map((file) => (
                    <React.Fragment key={file.id || file.name}>
                      <ListItem button component="a" href={file.webViewLink} target="_blank">
                        <ListItemText
                          primary={file.name}
                          secondary={file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : undefined}
                        />
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  ))}
                  {files.length === 0 && (
                    <ListItem>
                      <ListItemText primary="No recent files" />
                    </ListItem>
                  )}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Quick actions + Proposed routines */}
          <Grid item xs={12} md={4}>
            <Stack spacing={2} sx={{ height: '100%' }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>Quick Actions</Typography>
                <Stack spacing={1.5}>
                  <Button
                    variant="contained"
                    startIcon={<HelpIcon />}
                    onClick={handleAssistantPrompt}
                    disabled={!assistantPrompt}
                  >
                    Send assistant prompt
                  </Button>
                  <Button variant="outlined" onClick={() => ApiService.syncGoogle()}>
                    Sync Google
                  </Button>
                  <Button variant="outlined" onClick={loadData}>
                    Refresh all data
                  </Button>
                  <Button
                    variant={learningEnabled ? 'contained' : 'outlined'}
                    color={learningEnabled ? 'primary' : 'inherit'}
                    onClick={toggleLearning}
                  >
                    {learningEnabled ? 'Stop learning week' : 'Start learning week'}
                  </Button>
                  <Button variant="text" onClick={() => { UsageTracker.clear(); setProposedRoutines([]); }}>
                    Clear learning data
                  </Button>
                </Stack>
              </Paper>

              <Paper sx={{ p: 2, flexGrow: 1 }}>
                <Typography variant="h6" gutterBottom>Proposed routines</Typography>
                {proposedRoutines.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Keep using the assistant for a week. We’ll suggest routines based on repeated patterns.
                  </Typography>
                )}
                <List dense sx={{ maxHeight: 220, overflow: 'auto' }}>
                  {proposedRoutines.map((r, idx) => (
                    <React.Fragment key={`${r.title}-${idx}`}>
                      <ListItem
                        secondaryAction={
                          <Button size="small" onClick={() => handleStartProtocol(r.title)}>
                            Start
                          </Button>
                        }
                      >
                        <ListItemText
                          primary={r.title}
                          secondary={`${r.when} • confidence ${(r.confidence * 100).toFixed(0)}% (${r.samples} samples)`}
                        />
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  ))}
                </List>
              </Paper>
            </Stack>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default Dashboard;
