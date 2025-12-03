import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Stepper,
  Step,
  StepLabel,
  LinearProgress,
  Chip,
  Stack,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  Stop,
  NavigateNext,
  Timer,
  Check
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';

import { protocolService } from '../services/protocolService';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTimer } from '../hooks/useTimer';

interface ProtocolStep {
  step: string;
  duration: number;
  instructions?: string;
}

interface Protocol {
  id: string;
  name: string;
  description: string;
  steps: ProtocolStep[];
  totalDuration: number;
  tags: string[];
}

interface ProtocolRun {
  id: string;
  protocolId: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  currentStep: number;
  startedAt: string;
}

export default function ProtocolView() {
  const { name } = useParams<{ name?: string }>();
  const navigate = useNavigate();
  const { sendMessage, lastMessage } = useWebSocket();
  
  const [activeRun, setActiveRun] = useState<ProtocolRun | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  
  const {
    time: stepTime,
    isRunning,
    start: startTimer,
    pause: pauseTimer,
    reset: resetTimer
  } = useTimer();
  
  // Fetch protocol details
  const { data: protocol, isLoading } = useQuery({
    queryKey: ['protocol', name],
    queryFn: () => protocolService.getProtocol(name || ''),
    enabled: !!name
  });
  
  // Start protocol mutation
  const startProtocolMutation = useMutation({
    mutationFn: (protocolId: string) => protocolService.startRun(protocolId),
    onSuccess: (data) => {
      setActiveRun(data);
      setCurrentStep(0);
      startStepTimer(0);
      sendMessage({
        type: 'protocol_started',
        protocol: name,
        runId: data.id
      });
    }
  });
  
  // Complete step mutation
  const completeStepMutation = useMutation({
    mutationFn: ({ runId, stepIndex }: { runId: string; stepIndex: number }) =>
      protocolService.updateStep(runId, stepIndex),
    onSuccess: (_, { stepIndex }) => {
      if (protocol && stepIndex < protocol.steps.length - 1) {
        setCurrentStep(stepIndex + 1);
        startStepTimer(stepIndex + 1);
      } else {
        completeProtocol();
      }
    }
  });
  
  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'protocol_command') {
        switch (lastMessage.action) {
          case 'start':
            handleStart();
            break;
          case 'pause':
            handlePause();
            break;
          case 'resume':
            handleResume();
            break;
          case 'next':
            handleNextStep();
            break;
          case 'stop':
            handleStop();
            break;
        }
      }
    }
  }, [lastMessage]);
  
  const startStepTimer = (stepIndex: number) => {
    if (protocol) {
      const duration = protocol.steps[stepIndex].duration * 60; // Convert to seconds
      resetTimer();
      startTimer(duration);
    }
  };
  
  const handleStart = () => {
    if (protocol && !activeRun) {
      startProtocolMutation.mutate(protocol.id);
    }
  };
  
  const handlePause = () => {
    pauseTimer();
    setIsPaused(true);
  };
  
  const handleResume = () => {
    startTimer();
    setIsPaused(false);
  };
  
  const handleNextStep = () => {
    if (activeRun && protocol) {
      completeStepMutation.mutate({
        runId: activeRun.id,
        stepIndex: currentStep
      });
    }
  };
  
  const handleStop = () => {
    if (activeRun) {
      protocolService.cancelRun(activeRun.id);
      setActiveRun(null);
      setCurrentStep(0);
      resetTimer();
      sendMessage({
        type: 'protocol_stopped',
        protocol: name
      });
    }
  };
  
  const completeProtocol = () => {
    if (activeRun) {
      protocolService.completeRun(activeRun.id);
      setActiveRun(null);
      sendMessage({
        type: 'protocol_completed',
        protocol: name
      });
      // Show completion message
      setTimeout(() => navigate('/dashboard'), 5000);
    }
  };
  
  // Auto-advance when timer completes
  useEffect(() => {
    if (stepTime === 0 && isRunning && activeRun) {
      handleNextStep();
    }
  }, [stepTime, isRunning]);
  
  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress size={60} />
      </Box>
    );
  }
  
  if (!protocol) {
    return (
      <Box p={4}>
        <Alert severity="error">Protocol not found</Alert>
      </Box>
    );
  }
  
  const progress = activeRun
    ? ((currentStep + 1) / protocol.steps.length) * 100
    : 0;
  
  const currentStepData = protocol.steps[currentStep];
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <Box p={4}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card elevation={3}>
          <CardContent>
            <Stack spacing={3}>
              {/* Header */}
              <Box>
                <Typography variant="h3" gutterBottom>
                  {protocol.name}
                </Typography>
                {protocol.description && (
                  <Typography variant="body1" color="text.secondary" paragraph>
                    {protocol.description}
                  </Typography>
                )}
                <Stack direction="row" spacing={1}>
                  {protocol.tags.map(tag => (
                    <Chip key={tag} label={tag} size="small" />
                  ))}
                  <Chip
                    icon={<Timer />}
                    label={`${protocol.totalDuration} minutes total`}
                    size="small"
                    variant="outlined"
                  />
                </Stack>
              </Box>
              
              {/* Progress */}
              {activeRun && (
                <Box>
                  <LinearProgress
                    variant="determinate"
                    value={progress}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                    Step {currentStep + 1} of {protocol.steps.length}
                  </Typography>
                </Box>
              )}
              
              {/* Stepper */}
              <Stepper activeStep={currentStep} alternativeLabel>
                {protocol.steps.map((step, index) => (
                  <Step key={index} completed={activeRun && index < currentStep}>
                    <StepLabel>
                      {step.step}
                      <Typography variant="caption" display="block">
                        {step.duration} min
                      </Typography>
                    </StepLabel>
                  </Step>
                ))}
              </Stepper>
              
              {/* Current Step Display */}
              {activeRun && currentStepData && (
                <Card sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                  <CardContent>
                    <Typography variant="h4" gutterBottom align="center">
                      {currentStepData.step}
                    </Typography>
                    <Typography variant="h1" align="center" sx={{ my: 4 }}>
                      {formatTime(stepTime)}
                    </Typography>
                    {currentStepData.instructions && (
                      <Typography variant="body1" align="center">
                        {currentStepData.instructions}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              )}
              
              {/* Controls */}
              <Stack direction="row" spacing={2} justifyContent="center">
                {!activeRun ? (
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<PlayArrow />}
                    onClick={handleStart}
                    sx={{ minWidth: 200 }}
                  >
                    Start Protocol
                  </Button>
                ) : (
                  <>
                    {isPaused ? (
                      <Button
                        variant="contained"
                        startIcon={<PlayArrow />}
                        onClick={handleResume}
                      >
                        Resume
                      </Button>
                    ) : (
                      <Button
                        variant="outlined"
                        startIcon={<Pause />}
                        onClick={handlePause}
                      >
                        Pause
                      </Button>
                    )}
                    <Button
                      variant="contained"
                      startIcon={<NavigateNext />}
                      onClick={handleNextStep}
                      disabled={currentStep >= protocol.steps.length - 1}
                    >
                      Next Step
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<Stop />}
                      onClick={handleStop}
                    >
                      Stop
                    </Button>
                  </>
                )}
              </Stack>
              
              {/* Completion Message */}
              {activeRun?.status === 'completed' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                >
                  <Alert
                    severity="success"
                    icon={<Check />}
                    sx={{ fontSize: '1.2rem' }}
                  >
                    Protocol completed successfully! Great job!
                  </Alert>
                </motion.div>
              )}
            </Stack>
          </CardContent>
        </Card>
      </motion.div>
    </Box>
  );
}