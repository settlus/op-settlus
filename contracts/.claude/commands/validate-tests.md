Run and validate Forge tests for the specified contract or test file.

Steps:
1. Run `forge test --match-contract $ARGUMENTS -vvv` to execute the tests
2. If tests fail, analyze the error output and identify the root cause
3. Check for common issues:
   - Missing vm.prank() for access control tests
   - Incorrect vm.expectRevert() placement (must be before the failing call)
   - Time-dependent tests missing vm.warp() or skip()
   - Missing deal() for ETH/token balances
4. Report test results with pass/fail summary
5. If all tests pass, run with `--gas-report` to show gas usage

Usage: /validate-tests TenantTest
       /validate-tests TenantManagerTest
