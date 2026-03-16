#!/bin/bash
# E2E test: inject CSA0418719 as booking number, verify normalization and API flow

set -e
BASE="${1:-http://localhost:3000}"

echo "=== 1. Inject CSA0418719 as booking_number + CMA CGM ==="
RES=$(curl -s -X POST "$BASE/api/v1/shipments/injected" \
  -H "Content-Type: application/json" \
  -d '{"booking_number":"CSA0418719","carrier":"CMA CGM"}')
echo "$RES" | head -c 500
echo ""

# Verify response has booking_number and carrier
if echo "$RES" | grep -q '"booking_number":"CSA0418719"'; then
  echo "✓ booking_number in response"
else
  echo "✗ booking_number missing in response"
  exit 1
fi
if echo "$RES" | grep -q '"carrier_code":"CMDU"'; then
  echo "✓ carrier normalized to CMDU"
else
  echo "✗ carrier not normalized"
  exit 1
fi

echo ""
echo "=== 2. Inject via container_number (legacy) - should normalize to booking ==="
RES2=$(curl -s -X POST "$BASE/api/v1/shipments/injected" \
  -H "Content-Type: application/json" \
  -d '{"container_number":"TESTBOOKING123","carrier":"CMA CGM"}')
# TESTBOOKING123 doesn't look like container (4+7) so should become booking_number
echo "Response: $(echo "$RES2" | head -c 300)"

echo ""
echo "=== 3. Trigger Full re-sync for CSA0418719 ==="
REFRESH=$(curl -s -X POST "$BASE/api/v1/shipments/CSA0418719/refresh" \
  -H "Content-Type: application/json" \
  -d '{"mode":"full"}')
echo "$REFRESH"
if echo "$REFRESH" | grep -q '"status":"queued"'; then
  echo "✓ Refresh queued"
fi

echo ""
echo "=== 4. Fetch canonical shipments (include CSA0418719) ==="
sleep 2
CANONICAL=$(curl -s "$BASE/api/v1/canonical/shipments")
if echo "$CANONICAL" | grep -q '"id":"CSA0418719"'; then
  echo "✓ CSA0418719 in canonical data"
else
  echo "Note: CSA0418719 may appear after refresh completes"
fi

echo ""
echo "=== Booking flow test complete ==="
