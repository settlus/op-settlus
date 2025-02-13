import '../env'
import addresses from './contract-addresses.json'
import hre from 'hardhat'
import { zeroAddress, parseEther } from 'viem'

// This script is for testing purpose only, especially for multi-tenant setup on devnet
async function main() {
  const tenantManager = await hre.ethers.getContractAt('TenantManager', addresses.tenantManagerProxy)

  // Change tenant name if needed
  const tenantNames = ['TenantOne', 'TenantTwo', 'TenantThree']
  const signers = await hre.ethers.getSigners()

  for (let i = 0; i < tenantNames.length; i++) {
    const tenantName = tenantNames[i]
    const signer = signers[i + 1] // Skip the deployer, use t1, t2, t3

    const tx = await tenantManager.connect(signer).createTenant(tenantName, 0, zeroAddress, BigInt(10))
    await tx.wait()
    console.log(`Created tenant: ${tenantName} by signer: ${signer.address}`)

    const tenantAddress = await tenantManager.getTenantAddress(tenantName)
    const sendTx = await signer.sendTransaction({
      to: tenantAddress,
      value: parseEther('10'),
    })
    await sendTx.wait()
    console.log(`Sent 10 ETH to tenant: ${tenantAddress} by signer: ${signer.address}`)
  }

  const tenants = tenantNames.map((tenantName) => tenantManager.getTenantAddress(tenantName))
  const interval = 10000

  setInterval(async () => {
    try {
      for (let i = 0; i < tenants.length; i++) {
        const tenantAddress = await tenants[i]
        const tenant = await hre.ethers.getContractAt('Tenant', tenantAddress)
        const signer = signers[i + 1] // Use corresponding signer for each tenant
        const reqId = new Date().getTime().toString() + tenantAddress.slice(2)
        const tx = await tenant.connect(signer).record(reqId, 10, 1, addresses.sampleNft, 0)
        await tx.wait()
        console.log(`Recorded transaction for tenant: ${tenantAddress} by signer: ${signer.address}`)
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
