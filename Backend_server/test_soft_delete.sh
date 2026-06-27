#!/bin/bash
# Test Soft Delete Buildings
BASE="http://localhost:5000"
SUPER_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OWMyNjcyMWNhNzM0MjczMGM0ODJiNTYiLCJyb2xlIjoiU1VQRVJfQURNSU4iLCJpYXQiOjE3ODI0MTYwNzYsImV4cCI6MTc4MzAyMDg3Nn0.OzFvQBzW9clY12SU3VWa0Z821UmD8BCHx_-4aVqCmZQ"
BUILDING_A="69c73f76ad28292e41ced1ea"  # saigon - sẽ deactivate

echo "=== TEST SOFT DELETE BUILDINGS ==="
echo ""

# TC-1: Super Admin delete building (soft delete)
echo "[TC-1] SUPER_ADMIN DELETE building (soft delete)"
response=$(curl -s -X DELETE "$BASE/api/buildings/$BUILDING_A" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -w "\n%{http_code}")
status=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')
if [ "$status" = "200" ]; then
  echo "  ✅ PASS: status $status, message: $(echo "$body" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)"
else
  echo "  ❌ FAIL: status $status, body: $body"
fi
echo ""

# TC-2: GET /api/buildings (Super Admin, default) - không thấy inactive
echo "[TC-2] SUPER_ADMIN GET /api/buildings (default) - inactive phải biến mất"
buildings=$(curl -s "$BASE/api/buildings" -H "Authorization: Bearer $SUPER_TOKEN" | grep -o "\"_id\":\"$BUILDING_A\"" | wc -l)
if [ "$buildings" -eq "0" ]; then
  echo "  ✅ PASS: Building inactive không có trong list"
else
  echo "  ❌ FAIL: Building inactive vẫn xuất hiện ($buildings lần)"
fi
echo ""

# TC-3: GET /api/buildings?include_inactive=true - thấy inactive
echo "[TC-3] SUPER_ADMIN GET /api/buildings?include_inactive=true - phải thấy inactive"
buildings=$(curl -s "$BASE/api/buildings?include_inactive=true" -H "Authorization: Bearer $SUPER_TOKEN" | grep -o "\"_id\":\"$BUILDING_A\"" | wc -l)
if [ "$buildings" -ge "1" ]; then
  echo "  ✅ PASS: Building inactive xuất hiện ($buildings lần)"
else
  echo "  ❌ FAIL: Building inactive không thấy"
fi
echo ""

# TC-4: GET /api/buildings/public - không thấy inactive
echo "[TC-4] Public GET /api/buildings/public - không thấy inactive"
buildings=$(curl -s "$BASE/api/buildings/public" | grep -o "\"_id\":\"$BUILDING_A\"" | wc -l)
if [ "$buildings" -eq "0" ]; then
  echo "  ✅ PASS: Building inactive không có trong public list"
else
  echo "  ❌ FAIL: Building inactive vẫn xuất hiện ($buildings lần)"
fi
echo ""

# TC-5: BUILDING_ADMIN DELETE building (đã có middleware 403)
BA_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OWM3M2Y0N2FkMjgyOTJlNDFjZWQxZTUiLCJyb2xlIjoiQlVJTERJTkdfQURNSU4iLCJpYXQiOjE3ODI0MTYyMzIsImV4cCI6MTc4MzAyMTAzMn0.7UDdWffPwuzoDbX1NB8F-ejbLMzdHiUbVjsO49cvhY8"
echo "[TC-5] BUILDING_ADMIN DELETE building (đã có 403 từ 1B.1)"
status=$(curl -s -X DELETE "$BASE/api/buildings/$BUILDING_A" \
  -H "Authorization: Bearer $BA_TOKEN" \
  -w "%{http_code}")
if [ "$status" = "403" ]; then
  echo "  ✅ PASS: status $status"
else
  echo "  ❌ FAIL: status $status (expected 403)"
fi
echo ""

# TC-6: BUILDING_ADMIN GET map của building inactive (phải 403 từ buildingAccess)
echo "[TC-6] BUILDING_ADMIN GET /api/maps/$BUILDING_A/1 - building inactive → 403"
status=$(curl -s "$BASE/api/maps/$BUILDING_A/1" \
  -H "Authorization: Bearer $BA_TOKEN" \
  -w "%{http_code}")
if [ "$status" = "403" ]; then
  echo "  ✅ PASS: status $status"
else
  echo "  ❌ FAIL: status $status (expected 403)"
fi
echo ""

# TC-7: Kiểm tra ActivityLog có DEACTIVATE_BUILDING
echo "[TC-7] ActivityLog có DEACTIVATE_BUILDING"
node -e "require('dotenv').config(); const mongoose=require('mongoose'); const ActivityLog=require('./models/ActivityLog'); (async()=>{await mongoose.connect(process.env.MONGO_URI); const log=await ActivityLog.findOne({action:'DEACTIVATE_BUILDING',target_id:'$BUILDING_A'}).sort({createdAt:-1}).lean(); if(log){console.log('✅ PASS: DEACTIVATE_BUILDING log found:',log._id);}else{console.log('❌ FAIL: No DEACTIVATE_BUILDING log');} process.exit(0);})();"
echo ""

echo "=== TEST HOÀN TẤT ==="
