#!/usr/bin/env bash
# Test script for inbox endpoints

BASE="http://localhost:3001/api"

echo "=== 1. Create test property ==="
PROP_RESPONSE=$(curl -s -X POST "$BASE/properties" \
  -H "Content-Type: application/json" \
  -d @/tmp/test_property.json)
echo "$PROP_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$PROP_RESPONSE"

PROP_ID=$(echo "$PROP_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['property']['id'])" 2>/dev/null)
echo "Property ID: $PROP_ID"

if [ -z "$PROP_ID" ]; then
  echo "Getting existing property..."
  PROP_RESPONSE=$(curl -s "$BASE/properties")
  PROP_ID=$(echo "$PROP_RESPONSE" | python3 -c "import sys,json; props=json.load(sys.stdin)['properties']; print(props[0]['id'] if props else '')" 2>/dev/null)
  echo "Property ID: $PROP_ID"
fi

if [ -z "$PROP_ID" ]; then
  echo "ERROR: No property available to test"
  exit 1
fi

echo ""
echo "=== 2. GET inbox (should be empty) ==="
curl -s "$BASE/properties/$PROP_ID/inbox" | python3 -m json.tool

echo ""
echo "=== 3. POST send email ==="
SEND_RESPONSE=$(curl -s -X POST "$BASE/properties/$PROP_ID/inbox/send" \
  -H "Content-Type: application/json" \
  -d "{\"to\":[\"test@example.com\"],\"subject\":\"Earnest money deposit\",\"body\":\"Hi, please find the earnest money details for 123 Test Street.\"}")
echo "$SEND_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$SEND_RESPONSE"

MSG_ID=$(echo "$SEND_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['message']['id'])" 2>/dev/null)
THREAD_ID=$(echo "$SEND_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['message']['thread_id'])" 2>/dev/null)
echo "Message ID: $MSG_ID"
echo "Thread ID: $THREAD_ID"

echo ""
echo "=== 4. GET inbox (should have 1 thread) ==="
curl -s "$BASE/properties/$PROP_ID/inbox" | python3 -m json.tool

echo ""
echo "=== 5. GET thread detail ==="
if [ -n "$THREAD_ID" ]; then
  curl -s "$BASE/properties/$PROP_ID/inbox/$THREAD_ID" | python3 -m json.tool
else
  echo "SKIP: No thread ID"
fi

echo ""
echo "=== 6. PATCH mark message as unread ==="
if [ -n "$MSG_ID" ]; then
  curl -s -X PATCH "$BASE/properties/$PROP_ID/inbox/emails/$MSG_ID" \
    -H "Content-Type: application/json" \
    -d '{"read":false}' | python3 -m json.tool
else
  echo "SKIP: No message ID"
fi

echo ""
echo "=== 7. GET inbox (thread should show unread) ==="
curl -s "$BASE/properties/$PROP_ID/inbox" | python3 -m json.tool

echo ""
echo "=== DONE ==="
