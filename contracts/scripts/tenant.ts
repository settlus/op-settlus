import '../env'
import addresses from './contract-addresses.json'
import hre from 'hardhat'
import { zeroAddress, parseEther } from 'viem'

async function main() {
  const tenantFactory = await hre.ethers.getContractAt('TenantFactory', addresses.tenantFactory)

  // Change tenant name if needed. Given names can already exist.
  const tenantNames = ['T1', 'T2', 'T3']
  for (const tenantName of tenantNames) {
    const tx = await tenantFactory.createTenant(tenantName, 0, zeroAddress, BigInt(10))
    await tx.wait()
    console.log(`Created tenant: ${tenantName}`)

    const tenantAddress = await tenantFactory.getTenantAddress(tenantName)
    // sent by master account, test purpose only
    const [sender] = await hre.ethers.getSigners()
    const sendTx = await sender.sendTransaction({
      to: tenantAddress,
      value: parseEther('10'),
    })
    await sendTx.wait()
    console.log(`Sent 10 ETH to tenant: ${tenantAddress}`)
  }

  const tenants = await tenantFactory.getTenantAddresses()
  const interval = 10000

  setInterval(async () => {
    try {
      for (const tenantAddress of tenants) {
        const tenant = await hre.ethers.getContractAt('Tenant', tenantAddress)
        const reqId = new Date().getTime().toString() + tenantAddress.slice(2)
        // TODO: avoid ProviderError: replacement transaction underpriced error, add more signers
        const tx = await tenant.record(reqId, 10, 1, addresses.sampleNft, 0)
        await tx.wait()
        console.log(`Recorded transaction for tenant: ${tenantAddress}`)
      }
    } catch (error) {
      console.error('Error recording transaction:', error)
    }
  }, interval)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
