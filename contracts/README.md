# Settlement Contracts

## Compile contract and test
```bash
pnpm compile
pnpm test
```

## Deploy Tenant Factory
 
```bash
# configure correct network in hardhat.config.ts
cp .env.development .env
npx hardhat run scripts/deploy.ts
```

## Test

```bash
# assume running OP devnet locally
npx hardhat run scripts/deploy.ts --network local
npx hardhat run scripts/tenant.ts --network local
```