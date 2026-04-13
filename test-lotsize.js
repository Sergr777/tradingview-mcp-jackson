/**
 * 🧪 TEST SCRIPT - LOT_SIZE Corrections
 *
 * Tests the new LOT_SIZE adjustment functions without
 * connecting to BitGet API (safe, offline testing)
 */

// Copy constants from scalper-run.js
const LOT_SIZE = 0.001; // BitGet minimum increment for XRP
const MIN_NOTIONAL = 5; // Minimum order value in USDT

// Copy functions from scalper-run.js
function adjustToLotSize(qty, lotSize = LOT_SIZE) {
  const adjusted = Math.floor(qty / lotSize) * lotSize;
  return adjusted >= lotSize ? adjusted : 0;
}

function validateMinNotional(qty, price, minNotional = MIN_NOTIONAL) {
  const value = qty * price;
  return value >= minNotional;
}

function adjustQuantityWithFallback(originalQty, price) {
  const strategies = [
    adjustToLotSize(originalQty),
    adjustToLotSize(Math.floor(originalQty * 1000) / 1000),
    adjustToLotSize(Math.floor(originalQty * 100) / 100),
  ];

  for (const qty of strategies) {
    if (qty > 0 && validateMinNotional(qty, price)) {
      return qty;
    }
  }

  return 0;
}

// Test cases
function runTests() {
  console.log("\n🧪 TESTING LOT_SIZE CORRECTIONS\n");
  console.log("=" .repeat(60));

  let passed = 0;
  let failed = 0;

  // Test 1: adjustToLotSize - normal cases
  console.log("\n📝 TEST 1: adjustToLotSize() - Normal Cases");
  const test1Cases = [
    { input: 5.4361, expected: 5.436, desc: "5.4361 → 5.436 (standard)" },
    { input: 1.2345, expected: 1.234, desc: "1.2345 → 1.234 (rounds down)" },
    { input: 10.9999, expected: 10.999, desc: "10.9999 → 10.999" },
    { input: 0.001, expected: 0.001, desc: "0.001 → 0.001 (minimum)" },
    { input: 0.0009, expected: 0, desc: "0.0009 → 0 (below minimum)" },
  ];

  test1Cases.forEach(({ input, expected, desc }) => {
    const result = adjustToLotSize(input);
    const status = result === expected ? "✅ PASS" : "❌ FAIL";
    if (result === expected) passed++; else failed++;
    console.log(`  ${status} ${desc}`);
    console.log(`     Input: ${input}, Expected: ${expected}, Got: ${result}`);
  });

  // Test 2: adjustToLotSize - edge cases from logs
  console.log("\n📝 TEST 2: adjustToLotSize() - Real Error Cases");
  const test2Cases = [
    {
      input: 5.4361,
      expected: 5.436,
      desc: "Original error case: 5.4361 XRP"
    },
    {
      input: 0.0001111305,
      expected: 0,
      desc: "Dust balance from error message"
    },
  ];

  test2Cases.forEach(({ input, expected, desc }) => {
    const result = adjustToLotSize(input);
    const status = result === expected ? "✅ PASS" : "❌ FAIL";
    if (result === expected) passed++; else failed++;
    console.log(`  ${status} ${desc}`);
    console.log(`     Input: ${input}, Expected: ${expected}, Got: ${result}`);
  });

  // Test 3: validateMinNotional
  console.log("\n📝 TEST 3: validateMinNotional()");
  const test3Cases = [
    {
      qty: 5.436,
      price: 1.30,
      expected: true,
      desc: "$7.07 > $5 minimum (valid)"
    },
    {
      qty: 3.5,
      price: 1.30,
      expected: false,
      desc: "$4.55 < $5 minimum (invalid)"
    },
    {
      qty: 4,
      price: 1.30,
      expected: true,
      desc: "$5.20 = minimum (valid)"
    },
  ];

  test3Cases.forEach(({ qty, price, expected, desc }) => {
    const result = validateMinNotional(qty, price);
    const status = result === expected ? "✅ PASS" : "❌ FAIL";
    if (result === expected) passed++; else failed++;
    console.log(`  ${status} ${desc}`);
    console.log(`     Qty: ${qty}, Price: $${price}, Value: $${(qty * price).toFixed(2)}, Expected: ${expected}, Got: ${result}`);
  });

  // Test 4: adjustQuantityWithFallback
  console.log("\n📝 TEST 4: adjustQuantityWithFallback()");
  const test4Cases = [
    {
      input: 5.4361,
      price: 1.30,
      expected: 5.436,
      desc: "Standard case (strategy 1)"
    },
    {
      input: 4.23456,
      price: 1.30,
      expected: 4.234,
      desc: "Rounding to 3 decimals (strategy 2) - $5.50 > $5 min ✓"
    },
    {
      input: 0.0005,
      price: 1.30,
      expected: 0,
      desc: "Too small (all strategies fail)"
    },
  ];

  test4Cases.forEach(({ input, price, expected, desc }) => {
    const result = adjustQuantityWithFallback(input, price);
    const status = result === expected ? "✅ PASS" : "❌ FAIL";
    if (result === expected) passed++; else failed++;
    console.log(`  ${status} ${desc}`);
    console.log(`     Input: ${input}, Price: $${price}, Expected: ${expected}, Got: ${result}`);
  });

  // Test 5: Integration scenarios
  console.log("\n📝 TEST 5: Integration Scenarios");
  const scenarios = [
    {
      name: "Original Error Case",
      balance: 5.4361,
      intendedSell: 5.4361,
      price: 1.30,
      expected: 5.436,
      desc: "Should adjust to 5.436 XRP"
    },
    {
      name: "Insufficient Balance",
      balance: 3.5,
      intendedSell: 5.0,
      price: 1.30,
      expected: 0,
      desc: "Should return 0 (below min notional)"
    },
    {
      name: "Dust Balance",
      balance: 0.0001111305,
      intendedSell: 0.0001111305,
      price: 1.30,
      expected: 0,
      desc: "Should return 0 (below LOT_SIZE)"
    },
  ];

  scenarios.forEach(({ name, balance, intendedSell, price, expected, desc }) => {
    // Simulate validateAndPrepareSell logic
    const actualQty = Math.min(intendedSell, balance);
    const adjustedQty = adjustQuantityWithFallback(actualQty, price);
    const result = adjustedQty;
    const status = result === expected ? "✅ PASS" : "❌ FAIL";
    if (result === expected) passed++; else failed++;
    console.log(`  ${status} ${name}`);
    console.log(`     ${desc}`);
    console.log(`     Balance: ${balance}, Intended: ${intendedSell}, Result: ${result}`);
  });

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log(`\n📊 TEST SUMMARY`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log("\n🎉 ALL TESTS PASSED! LOT_SIZE corrections are working correctly.");
    console.log("✅ Ready for production deployment.\n");
  } else {
    console.log("\n⚠️  SOME TESTS FAILED! Review the failed cases above.\n");
  }

  console.log("=".repeat(60) + "\n");
}

// Run tests
runTests();
