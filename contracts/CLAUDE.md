# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Settlus Contracts is a smart contract system for multi-tenant settlement on the Settlus blockchain (OP Stack L2). It manages UTXR (User Transaction Record) creation, payout periods, and batch settlement across multiple tenants.

## Build & Development Commands

```bash
# Install dependencies
bun install

# Build contracts
forge build

# Run tests
forge test
forge test --gas-report    # with gas analysis

# Coverage
bun run test:coverage             # terminal output
bun run test:coverage:report      # generates HTML in coverage/

# Lint & Format
bun run lint                      # check formatting
forge fmt                         # format Solidity files

# Deploy (requires PRIVATE_KEY and SETTLER_ADDRESS env vars)
forge script scripts/Deploy.s.sol:Deploy --rpc-url <mainnet|sepolia> --broadcast -vvvv
```

## Architecture

### Core Contracts

**TenantManager** (`src/TenantManager.sol`) - UUPS upgradeable factory contract
- Creates and manages Tenant instances via `createTenant()` or `createTenantWithMintableContract()`
- Orchestrates batch settlement across all tenants with `settleAll()`
- Role-based access: `SETTLER_ROLE` for settlement operations
- Deployed behind ERC1967 proxy (`TenantManagerProxy.sol`)

**Tenant** (`src/Tenant.sol`) - Individual settlement record manager
- Records payment requests as UTXRs with `record()` or `recordRaw()`
- Processes settlements after payout period expires via `settle()`
- Supports three currency types:
  - `ETH` - native currency transfers
  - `ERC20` - standard token transfers
  - `MINTABLES` - non-transferable tokens minted on settlement

**ERC20NonTransferable** (`src/ERC20NonTransferable.sol`) - Soulbound-like token
- Used for MINTABLES currency type
- Admin-controlled minting, no transfers allowed

### Settlement Flow

1. Recorder calls `record()` → creates UTXR with `timestamp = block.timestamp + payoutPeriod`
2. UTXR remains pending until payout period expires
3. `settle(batchSize)` processes eligible UTXRs (FIFO order)
4. Settlement transfers/mints currency to recipients

### Role System

- **DEFAULT_ADMIN_ROLE**: Tenant admin, can add/remove recorders
- **RECORDER_ROLE**: Can create and cancel UTXRs
- **SETTLER_ROLE**: Can call `settleAll()` on TenantManager

## Networks

- Settlus Mainnet: Chain ID 5371
- Settlus Testnet: Chain ID 5373
- RPC via Alchemy: requires `ALCHEMY_API_KEY` env var

## Configuration

- Solidity 0.8.25
- EVM version: Shanghai
- Optimizer enabled
- Fuzz runs: 1,000 default, 10,000 in CI

## Forge Test Patterns

### Assertions
```solidity
assertEq(a, b)           // equality
assertTrue(condition)    // boolean check
assertGt(a, b)           // greater than
assertLt(a, b)           // less than
```

### Cheat Codes
```solidity
vm.prank(addr)                      // next call as addr
vm.startPrank(addr)                 // all calls as addr until stopPrank
vm.expectRevert("error message")    // expect next call to revert
vm.expectRevert(CustomError.selector)
vm.warp(timestamp)                  // set block.timestamp
skip(seconds)                       // advance time
vm.deal(addr, amount)               // set ETH balance
deal(token, addr, amount)           // set ERC20 balance
vm.expectEmit(true, true, true, true)  // expect event
emit ExpectedEvent(args);           // then emit expected event
actualCall();                       // then make call that emits
```

### Test Structure
```solidity
contract ContractTest is Test {
    function setUp() public {
        // runs before each test
    }

    function test_description() public {
        // regular test (must start with test)
    }

    function testFuzz_description(uint256 x) public {
        // fuzz test - x is randomized
        vm.assume(x > 0 && x < 1000);  // bound inputs
    }
}
```

### Run Specific Tests
```bash
forge test --match-contract TenantTest
forge test --match-test test_settle
forge test -vvvv  # verbose with traces
```

## Test Structure

```
test/
├── Tenant.t.sol              # Tenant contract tests (23 tests)
├── TenantManager.t.sol       # TenantManager tests (15 tests)
├── TenantManagerProxy.t.sol  # Proxy/upgrade tests (5 tests)
└── utils/
    └── TestHelpers.sol       # Shared test utilities and fixtures
```
