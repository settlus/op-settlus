import '../env'
import addresses from './contract-addresses.json'
import hre from 'hardhat'
import { formatEther } from 'viem'

async function main() {
  const tf = await hre.ethers.getContractAt('TenantFactory', addresses.tenantFactory)
  const tenants = await tf.getTenantAddresses()

  // Check each tenant's lastSettledIndex and treasury balance
  for (const tenantAddress of tenants) {
    try {
      const tenant = await hre.ethers.getContractAt('Tenant', tenantAddress)
      const lastSettledIndex = await tenant.lastSettledIndex()
      const treasuryBalance = await hre.ethers.provider.getBalance(tenantAddress)
      console.log(
        `Tenant: ${tenantAddress}, Last Settled Index: ${lastSettledIndex}, Treasury Balance (ETH): ${formatEther(treasuryBalance)}`
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
