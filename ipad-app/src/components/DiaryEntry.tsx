import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Card,
  CardContent,
  Chip,
  Grid,
  IconButton,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemText,
  Divider,
  LinearProgress
} from '@mui/material';
import {
  Save as SaveIcon,
  Mic as MicIcon,
  MicOff as MicOffIcon,
  Today as TodayIcon,
  Analytics as AnalyticsIcon,
  Search as SearchIcon,
  TrendingUp as TrendingUpIcon,
  FitnessCenter as FitnessIcon,
  Restaurant as FoodIcon,
  LocalPharmacy as HealthIcon,
  Mood as MoodIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import ApiService from '../services/ApiService';

interface DiaryEntryProps {
  date?: Date;
}

interface ParsedData {
  wakeTime?: string;
  sleepTime?: string;
  mood?: number;
  energy?: number;
  activities: any[];
  products: any[];
  health: any[];
  nutrition: any[];
  keyEvents: string[];
}

const DiaryEntry: React.FC<DiaryEntryProps> = ({ date = new Date() }) => {
  const [entryText, setEntryText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [todayEntry, setTodayEntry] = useState<any>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [trends, setTrends] = useState<any>(null);
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    loadTodayEntry();
    setupSpeechRecognition();
  }, [date]);

  const setupSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'en-US';

      recognitionInstance.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          setEntryText(prev => prev + finalTranscript);
        }
      };

      recognitionInstance.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setError('Speech recognition error: ' + event.error);
        setIsRecording(false);
      };

      recognitionInstance.onend = () => {
        setIsRecording(false);
      };

      setRecognition(recognitionInstance);
    }
  };

  const loadTodayEntry = async () => {
    setLoading(true);
    try {
      const entry = await ApiService.getDiaryEntry(format(date, 'yyyy-MM-dd'));
      if (entry) {
        setTodayEntry(entry);
        setEntryText(entry.raw_text || '');
      }
    } catch (err) {
      // No entry for today is ok
      console.log('No entry for today yet');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!entryText.trim()) {
      setError('Please enter some text for your diary entry');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await ApiService.saveDiaryEntry(format(date, 'yyyy-MM-dd'), entryText);
      setParsedData(result.extracted);
      setSuccess('Diary entry saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save diary entry');
    } finally {
      setSaving(false);
    }
  };

  const toggleRecording = () => {
    if (!recognition) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    if (isRecording) {
      recognition.stop();
      setIsRecording(false);
    } else {
      recognition.start();
      setIsRecording(true);
    }
  };

  const loadTrends = async () => {
    try {
      const trendsData = await ApiService.getDiaryTrends(30);
      setTrends(trendsData);
      setShowAnalytics(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load trends');
    }
  };

  const exampleText = `Example: "Woke up at 7:00. Used Wella mask for 3 mins, hair was 9/10. Did 15-45s intervals for 50 minutes, burned 356 calories according to Whoop. Had eggs and avocado for breakfast. Energy level 8/10, mood 7/10. Signed up for 8sleep autopilot."`;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        <TodayIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
        Daily Diary - {format(date, 'EEEE, MMMM d, yyyy')}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Today's Entry
            </Typography>
            
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              {exampleText}
            </Typography>

            <TextField
              fullWidth
              multiline
              rows={12}
              variant="outlined"
              placeholder="Start typing or speaking your diary entry..."
              value={entryText}
              onChange={(e) => setEntryText(e.target.value)}
              disabled={saving}
            />

            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={saving || !entryText.trim()}
              >
                {saving ? 'Saving...' : 'Save Entry'}
              </Button>

              <IconButton
                color={isRecording ? 'error' : 'primary'}
                onClick={toggleRecording}
                disabled={saving}
                sx={{
                  backgroundColor: isRecording ? 'error.light' : 'primary.light',
                  '&:hover': {
                    backgroundColor: isRecording ? 'error.main' : 'primary.main',
                  }
                }}
              >
                {isRecording ? <MicOffIcon /> : <MicIcon />}
              </IconButton>

              <Button
                variant="outlined"
                startIcon={<AnalyticsIcon />}
                onClick={loadTrends}
              >
                View Trends
              </Button>
            </Box>

            {isRecording && (
              <Box sx={{ mt: 2 }}>
                <LinearProgress />
                <Typography variant="caption" color="error">
                  Recording... Click mic to stop
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          {parsedData && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Extracted Data
                </Typography>

                {parsedData.wakeTime && (
                  <Chip
                    label={`Wake: ${parsedData.wakeTime}`}
                    size="small"
                    sx={{ m: 0.5 }}
                  />
                )}

                {parsedData.mood && (
                  <Chip
                    icon={<MoodIcon />}
                    label={`Mood: ${parsedData.mood}/10`}
                    size="small"
                    color="primary"
                    sx={{ m: 0.5 }}
                  />
                )}

                {parsedData.energy && (
                  <Chip
                    label={`Energy: ${parsedData.energy}/10`}
                    size="small"
                    color="secondary"
                    sx={{ m: 0.5 }}
                  />
                )}

                {parsedData.activities.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2">
                      <FitnessIcon sx={{ fontSize: 16, mr: 0.5 }} />
                      Activities
                    </Typography>
                    <List dense>
                      {parsedData.activities.map((activity, idx) => (
                        <ListItem key={idx}>
                          <ListItemText
                            primary={activity.name}
                            secondary={`${activity.duration || 0} mins, ${activity.calories || 0} cal`}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                )}

                {parsedData.products.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2">Products Used</Typography>
                    {parsedData.products.map((product, idx) => (
                      <Chip
                        key={idx}
                        label={`${product.name}${product.rating ? ` (${product.rating}/10)` : ''}`}
                        size="small"
                        variant="outlined"
                        sx={{ m: 0.5 }}
                      />
                    ))}
                  </Box>
                )}

                {parsedData.nutrition.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2">
                      <FoodIcon sx={{ fontSize: 16, mr: 0.5 }} />
                      Nutrition
                    </Typography>
                    {parsedData.nutrition.map((meal, idx) => (
                      <Typography key={idx} variant="caption" display="block">
                        {meal.mealType}: {meal.items.join(', ')}
                      </Typography>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {todayEntry && !parsedData && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Today's Summary
                </Typography>
                <Typography variant="body2">
                  {todayEntry.day_summary}
                </Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      <Dialog open={showAnalytics} onClose={() => setShowAnalytics(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <TrendingUpIcon sx={{ mr: 1 }} />
          30-Day Trends & Analytics
        </DialogTitle>
        <DialogContent>
          {trends && (
            <Box>
              <Typography variant="h6" gutterBottom>Insights</Typography>
              <List>
                {trends.insights?.map((insight: string, idx: number) => (
                  <ListItem key={idx}>
                    <ListItemText primary={insight} />
                  </ListItem>
                ))}
              </List>

              <Divider sx={{ my: 2 }} />

              <Typography variant="h6" gutterBottom>Top Activities</Typography>
              <Grid container spacing={2}>
                {trends.activityStats?.map((activity: any, idx: number) => (
                  <Grid item xs={12} sm={6} key={idx}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle1">{activity.activity_name}</Typography>
                        <Typography variant="caption">
                          {activity.session_count} sessions, {activity.total_minutes} mins total
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>

              <Divider sx={{ my: 2 }} />

              <Typography variant="h6" gutterBottom>Top Products</Typography>
              {trends.topProducts?.map((product: any, idx: number) => (
                <Chip
                  key={idx}
                  label={`${product.product_name} (${product.usage_count}x, ⭐${product.avg_rating?.toFixed(1) || 'N/A'})`}
                  sx={{ m: 0.5 }}
                />
              ))}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default DiaryEntry;