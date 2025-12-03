#!/bin/bash

# Kelly Assistant - Startup Script
# This script starts all components of the Kelly Assistant system

set -e

echo "🚀 Starting Kelly Assistant..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "Please copy .env.example to .env and add your API keys"
    exit 1
fi

# Check if OpenAI API key is set
if ! grep -q "OPENAI_API_KEY=sk-" .env; then
    echo -e "${YELLOW}⚠️  Warning: OpenAI API key not configured${NC}"
    echo "Please add your OpenAI API key to the .env file"
fi

# Check PostgreSQL
echo -e "${GREEN}✓ Checking PostgreSQL...${NC}"
if ! pg_isready -h localhost -U kellypellas -d kelly_assistant > /dev/null 2>&1; then
    echo -e "${RED}❌ PostgreSQL is not running or database is not accessible${NC}"
    echo "Run: brew services start postgresql@14"
    exit 1
fi

# Function to start a service in background
start_service() {
    local name=$1
    local dir=$2
    local cmd=$3
    
    echo -e "${GREEN}Starting $name...${NC}"
    cd "$dir"
    
    # Kill existing process if running
    pkill -f "$cmd" 2>/dev/null || true
    
    # Start in background and save PID
    nohup $cmd > "../logs/${name}.log" 2>&1 &
    echo $! > "../logs/${name}.pid"
    
    cd - > /dev/null
    echo -e "${GREEN}✓ $name started (PID: $(cat logs/${name}.pid))${NC}"
}

# Create logs directory
mkdir -p logs

# Start Backend
echo -e "${YELLOW}Starting Backend Service...${NC}"
cd backend
if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
fi
npm run dev > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../logs/backend.pid
cd ..
echo -e "${GREEN}✓ Backend started on http://localhost:3000 (PID: $BACKEND_PID)${NC}"

# Wait for backend to start
sleep 3

# Start iPad App (optional)
read -p "Start iPad interface? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Starting iPad Interface...${NC}"
    cd ipad-app
    if [ ! -d "node_modules" ]; then
        echo "Installing iPad app dependencies..."
        npm install
    fi
    npm run dev > ../logs/ipad.log 2>&1 &
    IPAD_PID=$!
    echo $IPAD_PID > ../logs/ipad.pid
    cd ..
    echo -e "${GREEN}✓ iPad interface started on http://localhost:5173 (PID: $IPAD_PID)${NC}"
fi

# Start Local Agent (optional)
read -p "Start local automation agent? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Starting Local Agent...${NC}"
    cd local-agent
    if [ ! -d "node_modules" ]; then
        echo "Installing local agent dependencies..."
        npm install
    fi
    npm run dev > ../logs/local-agent.log 2>&1 &
    AGENT_PID=$!
    echo $AGENT_PID > ../logs/local-agent.pid
    cd ..
    echo -e "${GREEN}✓ Local agent started on http://localhost:3001 (PID: $AGENT_PID)${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Kelly Assistant is running!${NC}"
echo ""
echo "Services:"
echo "  Backend API: http://localhost:3000/health"
[ -f logs/ipad.pid ] && echo "  iPad Interface: http://localhost:5173"
[ -f logs/local-agent.pid ] && echo "  Local Agent: http://localhost:3001/health"
echo ""
echo "Logs:"
echo "  Backend: tail -f logs/backend.log"
[ -f logs/ipad.pid ] && echo "  iPad: tail -f logs/ipad.log"
[ -f logs/local-agent.pid ] && echo "  Agent: tail -f logs/local-agent.log"
echo ""
echo "To stop all services, run: ./stop.sh"
echo ""
echo -e "${YELLOW}⚠️  Remember to:${NC}"
echo "  1. Add your OpenAI API key to .env file"
echo "  2. Deploy the Alexa skill using ASK CLI"
echo "  3. Test with: 'Alexa, ask Kelly Assistant to remember...'"