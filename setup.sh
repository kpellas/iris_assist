#!/bin/bash

# Kelly Assistant Setup Script
# For iPad POC and Raspberry Pi deployment

set -e

echo "🚀 Kelly Assistant Setup"
echo "========================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env
    
    echo -e "${YELLOW}Generating secure keys...${NC}"
    JWT_SECRET=$(openssl rand -hex 32)
    TOKEN_KEY=$(openssl rand -hex 32)
    
    # Update .env with generated keys
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/JWT_SECRET=/JWT_SECRET=$JWT_SECRET/" .env
        sed -i '' "s/TOKEN_ENCRYPTION_KEY=/TOKEN_ENCRYPTION_KEY=$TOKEN_KEY/" .env
    else
        # Linux
        sed -i "s/JWT_SECRET=/JWT_SECRET=$JWT_SECRET/" .env
        sed -i "s/TOKEN_ENCRYPTION_KEY=/TOKEN_ENCRYPTION_KEY=$TOKEN_KEY/" .env
    fi
    
    echo -e "${GREEN}✓ Generated secure keys${NC}"
    echo -e "${RED}⚠️  Please edit .env to add:${NC}"
    echo "   - Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)"
    echo "   - Update GOOGLE_REDIRECT_URI for your environment"
fi

# Function to setup backend
setup_backend() {
    echo -e "\n${YELLOW}Setting up Backend...${NC}"
    cd backend
    
    # Install dependencies
    npm install
    
    # Check PostgreSQL
    if ! command -v psql &> /dev/null; then
        echo -e "${RED}PostgreSQL not found. Please install PostgreSQL first.${NC}"
        exit 1
    fi
    
    # Create database if not exists
    psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'kelly_assistant'" | grep -q 1 || {
        echo "Creating database..."
        createdb -U postgres kelly_assistant
    }
    
    # Run migrations
    echo "Running database migrations..."
    for migration in database/*.sql; do
        echo "Running $migration..."
        psql -U postgres -d kelly_assistant -f "$migration" 2>/dev/null || true
    done
    
    echo -e "${GREEN}✓ Backend setup complete${NC}"
    cd ..
}

# Function to setup iPad app
setup_ipad() {
    echo -e "\n${YELLOW}Setting up iPad App...${NC}"
    cd ipad-app
    
    # Install dependencies
    npm install
    
    # Create config if not exists
    if [ ! -f src/config.ts ]; then
        cat > src/config.ts << 'EOF'
export const config = {
  // Update these for your environment
  BACKEND_URL: process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000',
  WS_URL: process.env.REACT_APP_WS_URL || 'ws://localhost:3000',
  
  // For production/Pi deployment
  // BACKEND_URL: 'https://your-backend.com',
  // WS_URL: 'wss://your-backend.com',
};
EOF
    fi
    
    echo -e "${GREEN}✓ iPad app setup complete${NC}"
    cd ..
}

# Function to start development servers
start_dev() {
    echo -e "\n${YELLOW}Starting development servers...${NC}"
    
    # Load environment variables
    set -a
    source .env
    set +a
    
    # Start backend in background
    echo "Starting backend on port 3000..."
    (cd backend && npm run dev) &
    BACKEND_PID=$!
    
    # Wait for backend to start
    echo "Waiting for backend to start..."
    sleep 5
    
    # Check if backend started successfully
    if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "${RED}Backend failed to start. Check logs above.${NC}"
        kill $BACKEND_PID 2>/dev/null
        exit 1
    fi
    
    # Start iPad app
    echo "Starting iPad app on port 3001..."
    (cd ipad-app && PORT=3001 npm start) &
    IPAD_PID=$!
    
    echo -e "${GREEN}✓ Services started${NC}"
    echo -e "Backend: http://localhost:3000"
    echo -e "iPad App: http://localhost:3001"
    echo -e "\n${YELLOW}Press Ctrl+C to stop all services${NC}"
    
    # Wait for interrupt
    trap "kill $BACKEND_PID $IPAD_PID 2>/dev/null; exit" INT
    wait
}

# Function to get auth token
get_token() {
    echo -e "\n${YELLOW}Getting authentication token...${NC}"
    
    # First register/login
    response=$(curl -s -X POST http://localhost:3000/api/auth/login \
        -H "Content-Type: application/json" \
        -d '{"identifier": "admin", "password": "changeme123!"}')
    
    token=$(echo $response | grep -o '"token":"[^"]*' | cut -d'"' -f4)
    
    if [ -n "$token" ]; then
        echo -e "${GREEN}✓ Token obtained${NC}"
        echo -e "Token: ${token:0:50}..."
        echo $token > .auth-token
        echo -e "Token saved to .auth-token"
    else
        echo -e "${RED}Failed to get token. Check your credentials.${NC}"
    fi
}

# Function to test Google OAuth
test_google() {
    echo -e "\n${YELLOW}Testing Google OAuth...${NC}"
    
    if [ ! -f .auth-token ]; then
        echo -e "${RED}No auth token found. Run './setup.sh token' first${NC}"
        exit 1
    fi
    
    token=$(cat .auth-token)
    
    response=$(curl -s -X GET http://localhost:3000/api/google/auth/url \
        -H "Authorization: Bearer $token")
    
    auth_url=$(echo $response | grep -o '"authUrl":"[^"]*' | cut -d'"' -f4)
    
    if [ -n "$auth_url" ]; then
        echo -e "${GREEN}✓ Google OAuth URL obtained${NC}"
        echo -e "\n${YELLOW}Open this URL in your browser to authorize:${NC}"
        echo "$auth_url"
    else
        echo -e "${RED}Failed to get OAuth URL. Check your Google credentials.${NC}"
    fi
}

# Main menu
case "$1" in
    backend)
        setup_backend
        ;;
    ipad)
        setup_ipad
        ;;
    dev)
        start_dev
        ;;
    token)
        get_token
        ;;
    google)
        test_google
        ;;
    all)
        setup_backend
        setup_ipad
        echo -e "\n${GREEN}✓ Complete setup done!${NC}"
        echo -e "Run './setup.sh dev' to start development servers"
        ;;
    *)
        echo "Usage: $0 {all|backend|ipad|dev|token|google}"
        echo ""
        echo "  all     - Setup everything (backend + iPad app)"
        echo "  backend - Setup backend only"
        echo "  ipad    - Setup iPad app only"
        echo "  dev     - Start development servers"
        echo "  token   - Get authentication token"
        echo "  google  - Test Google OAuth flow"
        exit 1
        ;;
esac