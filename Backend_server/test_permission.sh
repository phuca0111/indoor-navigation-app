#!/bin/bash
# Test Building Permission Middleware
# Dựa trên test data thực tế

# === CONFIG ===
SUPER_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OWMyNjcyMWNhNzM0MjczMGM0ODJiNTYiLCJyb2xlIjoiU1VQRVJfQURNSU4iLCJpYXQiOjE3ODI0MTYwNzYsImV4cCI6MTc4MzAyMDg3Nn0.OzFvQBzW9clY12SU3VWa0Z821UmD8BCHx_-4aVqCmZQ"
BA_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OWM3M2Y0N2FkMjgyOTJlNDFjZWQxZTUiLCJyb2xlIjoiQlVJTERJTkdfQURNSU4iLCJpYXQiOjE3ODI0MTYyMzIsImV4cCI6MTc4MzAyMTAzMn0.7UDdWffPwuzoDbX1NB8F-ejbLMzdHiUbVjsO49cvhY8"
BUILDING_A="69c73f76ad28292e41ced1ea"  # saigon - assigned
BUILDING_B="69c7410ead28292e41ced20d"  # ass - unassigned
BASE="http://localhost:5000"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0

test_request() {
  local method=$1
  local url=$2
  local token=$3
  local expected=$4
  local data=$5
  local name=$6

  echo -n "[$name] $method $url ... "

  if [ -z "$token" ]; then
    response=$(curl -s -X $method "$BASE$url" -H "Content-Type: application/json" -d "$data" -w "\n%{http_code}")
  else
    response=$(curl -s -X $method "$BASE$url" -H "Content-Type: application/json" -H "Authorization: Bearer $token" -d "$data" -w "\n%{http_code}")
  fi

  status_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$status_code" = "$expected" ]; then
    echo -e "${GREEN}PASS${NC} (status $status_code)"
    ((PASS_COUNT++))
  else
    echo -e "${RED}FAIL${NC} (got $status_code, expected $expected)"
    echo "  Body: $body"
    ((FAIL_COUNT++))
  fi
}

echo "=== BUILDING ROUTES ==="
test_request GET "/api/buildings" "$SUPER_TOKEN" "200" "" "TC-1 (SUPER list)"
test_request GET "/api/buildings" "$BA_TOKEN" "200" "" "TC-2 (BA list - assigned only)"
test_request PUT "/api/buildings/$BUILDING_A" "$BA_TOKEN" "200" "{\"name\":\"Updated Saigon\"}" "TC-3 (BA update assigned)"
test_request PUT "/api/buildings/$BUILDING_B" "$BA_TOKEN" "403" "{\"name\":\"Hacked\"}" "TC-4 (BA update unassigned)"
test_request DELETE "/api/buildings/$BUILDING_A" "$BA_TOKEN" "403" "" "TC-5 (BA delete denied)"

echo ""
echo "=== MAP ROUTES ==="
test_request GET "/api/maps/$BUILDING_A/1" "$BA_TOKEN" "200" "" "TC-6 (BA load assigned)"
test_request GET "/api/maps/$BUILDING_B/1" "$BA_TOKEN" "403" "" "TC-7 (BA load unassigned)"
test_request POST "/api/maps/$BUILDING_B/1/publish" "$BA_TOKEN" "403" "{\"map_data\":{\"rooms\":[]}}" "TC-8 (BA publish unassigned)"
test_request POST "/api/maps/$BUILDING_A/1/publish" "$BA_TOKEN" "200" "{\"map_data\":{\"rooms\":[]}}" "TC-9 (BA publish assigned)"

echo ""
echo "=== MAP VERSION ROUTES ==="
test_request GET "/api/map-versions/$BUILDING_A/1" "$BA_TOKEN" "200" "" "TC-10 (BA versions assigned)"
test_request GET "/api/map-versions/$BUILDING_B/1" "$BA_TOKEN" "403" "" "TC-11 (BA versions unassigned)"

echo ""
echo "=== PUBLIC ROUTES ==="
test_request GET "/api/maps/$BUILDING_A/1/public" "" "200" "" "TC-12 (public map)"
test_request GET "/api/maps/$BUILDING_A/download" "" "200" "" "TC-13 (public download)"
test_request GET "/api/buildings/public" "" "200" "" "TC-14 (public buildings)"
test_request GET "/api/buildings/check-location?lat=10.7&lng=106.6" "" "200" "" "TC-15 (check location)"

echo ""
echo "=== SUMMARY ==="
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"
