import '../env'
import addresses from './contract-addresses.json'
import hre from 'hardhat'
import { formatEther } from 'viem'

async function main() {
  const tm = await hre.ethers.getContractAt('TenantManager', addresses.tenantManagerProxy)
  const tenants = await tm.getTenantAddresses()

  // Check each tenant's lastSettledIndex and treasury balance
  for (const tenantAddress of tenants) {
    try {
      const tenant = await hre.ethers.getContractAt('Tenant', tenantAddress)
      const lastSettledIdx = await tenant.lastSettledIdx()
      const utxrs = await tenant.getUtxrsLength()
      const treasuryBalance = await hre.ethers.provider.getBalance(tenantAddress)
      console.log(
        `Tenant: ${tenantAddress}, UTXR length: ${utxrs}, Last Settled Index: ${lastSettledIdx}, Treasury Balance (ETH): ${formatEther(treasuryBalance)}`
      )
    } catch (error) {
      console.error(`Error fetching data for tenant: ${tenantAddress}`, error)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
