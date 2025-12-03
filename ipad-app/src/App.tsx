import React, { useState, useEffect } from 'react';
import { Box, Container, Tabs, Tab, AppBar } from '@mui/material';
import { Dashboard as DashboardIcon, Book as BookIcon } from '@mui/icons-material';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import DiaryEntry from './components/DiaryEntry';
import ApiService from './services/ApiService';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState(0);

  useEffect(() => {
    // Check if we have a stored token
    const token = ApiService.getToken();
    if (token) {
      setIsAuthenticated(true);
      // Connect WebSocket
      ApiService.connectWebSocket((data) => {
        console.log('WebSocket message:', data);
      });
    }
    setLoading(false);
  }, []);

  const handleLogin = async (identifier: string, password: string) => {
    try {
      const result = await ApiService.login(identifier, password);
      setIsAuthenticated(true);
      // Connect WebSocket after login
      ApiService.connectWebSocket((data) => {
        console.log('WebSocket message:', data);
      });
      return { success: true, user: result.user };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  };

  const handleLogout = () => {
    ApiService.logout();
    setIsAuthenticated(false);
  };

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        Loading...
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Container maxWidth={false} disableGutters>
      <Box sx={{ width: '100%' }}>
        <AppBar position="static" color="default">
          <Tabs 
            value={currentTab} 
            onChange={(_, newValue) => setCurrentTab(newValue)}
            indicatorColor="primary"
            textColor="primary"
            variant="fullWidth"
          >
            <Tab icon={<DashboardIcon />} label="Dashboard" />
            <Tab icon={<BookIcon />} label="Daily Diary" />
          </Tabs>
        </AppBar>
        
        <Box sx={{ p: 0 }}>
          {currentTab === 0 && <Dashboard onLogout={handleLogout} />}
          {currentTab === 1 && <DiaryEntry />}
        </Box>
      </Box>
    </Container>
  );
}

export default App;
