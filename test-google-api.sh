#!/bin/bash

# Test script for Google integration API endpoints

API_URL="http://localhost:3000"
USER_ID="kelly"

echo "🧪 Testing Google Integration API..."
echo ""

# Test 1: Get Google Auth URL
echo "1. Getting Google Auth URL..."
curl -s "$API_URL/api/google/auth/url" | jq '.'
echo ""

# Test 2: Search Drive (will fail without auth)
echo "2. Testing Drive search (expecting auth required)..."
curl -s "$API_URL/api/google/drive/search?query=test" | jq '.'
echo ""

# Test 3: Check unread emails (will fail without auth)
echo "3. Testing Gmail unread check (expecting auth required)..."
curl -s "$API_URL/api/google/gmail/unread" | jq '.'
echo ""

echo ""
echo "⚠️  To complete authentication:"
echo "1. Visit the auth URL from test #1"
echo "2. Authorize the application"
echo "3. Copy the authorization code"
echo "4. Call the callback endpoint with the code:"
echo ""
echo "curl -X POST '$API_URL/api/google/auth/callback' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"code\": \"YOUR_AUTH_CODE_HERE\"}'"
echo ""
echo "✅ Google API tests complete!"