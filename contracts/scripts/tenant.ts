import '../env'
import addresses from './contract-addresses.json'
import hre from 'hardhat'
import { zeroAddress, parseEther } from 'viem'

// This script is for testing purpose only
async function main() {
  const tenantFactory = await hre.ethers.getContractAt('TenantFactory', addresses.tenantFactory)

  // Change tenant name if needed
  const tenantNames = ['TenantOne', 'TenantTwo', 'TenantThree']
  const signers = await hre.ethers.getSigners()

  for (let i = 0; i < tenantNames.length; i++) {
    const tenantName = tenantNames[i]
    const signer = signers[i + 1] // Skip the deployer, use t1, t2, t3

    const tx = await tenantFactory.connect(signer).createTenant(tenantName, 0, zeroAddress, BigInt(10))
    await tx.wait()
    console.log(`Created tenant: ${tenantName} by signer: ${signer.address}`)

    const tenantAddress = await tenantFactory.getTenantAddress(tenantName)
    const sendTx = await signer.sendTransaction({
      to: tenantAddress,
      value: parseEther('10'),
    })
    await sendTx.wait()
    console.log(`Sent 10 ETH to tenant: ${tenantAddress} by signer: ${signer.address}`)
  }

  const tenants = tenantNames.map((tenantName) => tenantFactory.getTenantAddress(tenantName))
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
