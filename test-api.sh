#!/bin/bash

# Test script for Kelly Assistant API endpoints

API_URL="http://localhost:3000"
USER_ID="kelly"

echo "🧪 Testing Kelly Assistant API..."
echo ""

# Test 1: Store a memory
echo "1. Testing memory storage..."
curl -s -X POST "$API_URL/api/memory" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'$USER_ID'",
    "content": "My calorie target is 1200 net calories",
    "category": "health",
    "tags": ["nutrition", "fitness"]
  }' | jq '.'
echo ""

# Test 2: Search memories
echo "2. Testing memory search..."
curl -s "$API_URL/api/memory/search?userId=$USER_ID&query=calorie%20target" | jq '.'
echo ""

# Test 3: Create a task
echo "3. Testing task creation..."
curl -s -X POST "$API_URL/api/task" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'$USER_ID'",
    "title": "Buy milk and eggs",
    "category": "shopping",
    "priority": 2,
    "dueDate": "'$(date -v+1d -u +"%Y-%m-%dT%H:%M:%SZ")'"
  }' | jq '.'
echo ""

# Test 4: Get tasks
echo "4. Getting tasks..."
curl -s "$API_URL/api/tasks?userId=$USER_ID" | jq '.'
echo ""

# Test 5: List protocols
echo "5. Listing protocols..."
curl -s "$API_URL/api/protocols?userId=$USER_ID" | jq '.'
echo ""

# Test 6: Update display
echo "6. Testing display update..."
curl -s -X POST "$API_URL/api/display/update" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'$USER_ID'",
    "deviceId": "ipad",
    "view": "dashboard",
    "data": {"message": "Test from API"}
  }' | jq '.'
echo ""

# Test 7: Get current display
echo "7. Getting current display state..."
curl -s "$API_URL/api/display/current?userId=$USER_ID&deviceId=ipad" | jq '.'
echo ""

echo "✅ API tests complete!"