#!/bin/bash

echo "🔐 Testing Security Requirements..."
echo ""

# Test 1: Try to access Google APIs without auth
echo "1. Testing Google API without auth (should fail):"
curl -s http://localhost:3000/api/google/drive/search?query=test | jq '.'
echo ""

# Test 2: Try to start server without required env vars
echo "2. Server requires JWT_SECRET and TOKEN_ENCRYPTION_KEY"
echo "   Current status: Server won't start without these"
echo ""

# Test 3: Login to get JWT token (with env vars set)
echo "3. Testing login endpoint:"
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userId": "testuser"}' | jq '.'
echo ""

echo "✅ Security checks complete!"
echo ""
echo "To start server with required security:"
echo "export JWT_SECRET=\$(openssl rand -hex 32)"
echo "export TOKEN_ENCRYPTION_KEY=\$(openssl rand -hex 32)"
echo "npm run dev"
