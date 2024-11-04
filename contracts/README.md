# Settlement Contracts

## Compile contract and test
```bash
pnpm build
pnpm test
```

## Deploy Tenant Factory
 
```bash
# configure network in hardhat.config.ts
npx hardhat run scripts/deploy.ts --network local
```

## Test

```bash
# assume running OP devnet locally
npx hardhat run scripts/deploy.ts --network local
npx hardhat run scripts/tenant.ts --network local
```