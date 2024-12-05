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

## How it works

### Concepts

#### Tenant & TenantManager
In the Settlus blockchain, the concept of a "Tenant" represents an individual platform or service that utilizes the `Tenant.sol` contract.
Each tenant operates independently within the Settlus ecosystem, maintaining their distinct transaction records, revenue streams, and user interactions.

Tenant contract is created by "TenantManager", which can manage and check the status of each contract. 

#### Unspent Transaction Record (UTXR)
The Unspent Transaction Record (UTXR) is a simple record, created whenever a payment is made from a tenant to a recipient. Each UTXR contains details such as the NFT address, recipient's address, the amount of the transaction.
These records are the backbone of the settlement process and crucial in tracking the flow of funds and ensuring the accuracy of settlements.

- If the NFT is stored in Settlus, we directly determine the recipients of the NFT during the execution of a record transaction.
- If the NFT is stored on an external chain, we postpone determining the owners. The oracle module will later fill in these details through voting from feeders.