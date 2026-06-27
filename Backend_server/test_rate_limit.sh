#!/bin/bash
# Test Rate Limit cho Auth APIs
# Base URL
BASE="http://localhost:5000"
BA_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OWM3M2Y0N2FkMjgyOTJlNDFjZWQxZTUiLCJyb2xlIjoiQlVJTERJTkdfQURNSU4iLCJpYXQiOjE3ODI0MTYyMzIsImV4cCI6MTc4MzAyMTAzMn0.7UDdWffPwuzoDbX1NB8F-ejbLMzdHiUbVjsO49cvhY8"

echo "=== TEST RATE LIMIT ==="
echo ""

# Test 1: Login - 5 lần thành công (skipSuccessfulRequests nên không block)
echo "[Test 1] Login 5 lần với token hợp lệ (should skip, không block)"
for i in {1..5}; do
  status=$(curl -s -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"toanha2@gmail.com","password":"123456"}' \
    -w "\n%{http_code}" | tail -n1)
  echo "  Lần $i: status $status"
  sleep 0.5
done
echo ""

# Test 2: Login - 6 lần với email sai (đếm fails, block sau 5)
echo "[Test 2] Login 6 lần với email không tồn tại (sau 5 lần fail → 429)"
for i in {1..6}; do
  status=$(curl -s -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"nonexistent'$i'@test.com","password":"123456"}' \
    -w "\n%{http_code}" | tail -n1)
  echo "  Lần $i: status $status"
  sleep 0.5
done
echo ""

# Test 3: Public register - 3 lần
echo "[Test 3] Public register 4 lần (limit 3, lần 4 → 429)"
for i in {1..4}; do
  email="test${i}@example.com"
  status=$(curl -s -X POST "$BASE/api/auth/public-register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"Pass123!\",\"confirmPassword\":\"Pass123!\"}" \
    -w "\n%{http_code}" | tail -n1)
  echo "  Lần $i ($email): status $status"
  sleep 0.5
done
echo ""

# Test 4: Refresh token - 20 lần
echo "[Test 4] Refresh token 21 lần (limit 20, lần 21 → 429)"
for i in {1..21}; do
  status=$(curl -s -X POST "$BASE/api/auth/refresh" \
    -H "Content-Type: application/json" \
    -d "{\"refreshToken\":\"dummy$i\"}" \
    -w "\n%{http_code}" | tail -n1)
  echo "  Lần $i: status $status"
  if [ $i -eq 20 ]; then
    sleep 1
  fi
done
echo ""

# Test 5: Logout - không bị rate limit (không có limiter)
echo "[Test 5] Logout 3 lần (should always 200, no limit)"
for i in {1..3}; do
  status=$(curl -s -X POST "$BASE/api/auth/logout" \
    -H "Content-Type: application/json" \
    -d '{"refreshToken":"any"}' \
    -w "\n%{http_code}" | tail -n1)
  echo "  Lần $i: status $status"
done
echo ""

echo "=== TEST HOÀN TẤT ==="
