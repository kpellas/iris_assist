# Kelly Assistant - Voice-Driven Personal Automation System

## Project Overview
A comprehensive personal assistant platform that uses Alexa as the voice interface, backed by intelligent services for memory, task management, routine automation, and visual coordination.

## Architecture Components

### 1. **Alexa Skill** (`/alexa-skill`)
- Custom voice interface
- Intent routing to backend
- Timer and reminder integration

### 2. **Backend Service** (`/backend`)
- Core brain hosted on AWS Lambda
- LLM integration for NLP and reasoning
- Memory management system
- Protocol/routine engine
- Task and rule management
- WebSocket server for real-time updates

### 3. **Database Layer**
- PostgreSQL with pgvector for semantic search
- Stores: memories, preferences, protocols, tasks, rules
- Version history and conflict resolution

### 4. **iPad Interface** (`/ipad-app`)
- Real-time visual companion
- Displays recipes, routines, tasks, dashboards
- WebSocket connection for instant updates

### 5. **Local Automation Agent** (`/local-agent`)
- Secure browser automation
- Handles web-only tasks (Woolworths, etc.)
- Credentials never leave local machine

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+ with pgvector extension
- AWS CLI configured
- Alexa Developer Console account

### Installation
```bash
# Install all dependencies
npm run setup

# Configure environment variables
cp .env.example .env
# Edit .env with your credentials

# Initialize database
cd backend && npm run db:migrate

# Start development servers
npm run dev
```

### Deployment
```bash
# Deploy backend to AWS Lambda
npm run deploy

# Deploy Alexa skill
cd alexa-skill && ask deploy

# Deploy iPad app
cd ipad-app && npm run deploy
```

## Core Features

### 1. Natural Language Memory
- "Remember that my calorie target is 1200"
- "What did I say about Mark's coffee preference?"
- Semantic search for flexible retrieval

### 2. Multi-Step Routines
- Create protocols with voice commands
- Timer-based step progression
- Visual guidance on iPad

### 3. Intelligent Planning
- "Plan my evening with Zwift and dinner"
- Context-aware recommendations
- Integration with calendar and tasks

### 4. Task Management
- Voice-created tasks and reminders
- Rule-based automation
- Daily briefings

### 5. Visual Coordination
- "Show the recipe on my iPad"
- Real-time state synchronization
- Interactive dashboards

## Project Structure
```
kelly-assistant/
├── alexa-skill/          # Alexa custom skill
├── backend/              # Core service (AWS Lambda)
├── ipad-app/            # Web-based iPad interface
├── local-agent/         # Desktop automation tool
├── docs/                # Documentation
└── infrastructure/      # AWS CDK/Terraform configs
```

## Development Workflow

1. **Voice Input**: Test with Alexa simulator or device
2. **Backend Logic**: Run locally with hot-reload
3. **Database**: Local PostgreSQL with Docker
4. **iPad UI**: React app with live preview
5. **Integration**: End-to-end testing suite

## Security & Privacy

- All personal data encrypted at rest
- Credentials stored locally only
- No third-party data sharing
- Audit logs for all operations
- Confirmation required for sensitive actions

## Future Enhancements

- Fitness tracker integration
- Financial dashboard
- Calendar synchronization
- Smart home control
- Multi-user support with voice recognition

## License
MIT - Private use only