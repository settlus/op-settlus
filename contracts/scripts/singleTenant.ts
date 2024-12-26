import addresses from './contract-addresses.json'
import hre from 'hardhat'

// This script is for testing purpose only, especially for single-tenant setup on devnet
async function main() {
  const [signer] = await hre.ethers.getSigners()
  const tenantManager = await hre.ethers.getContractAt('TenantManager', addresses.tenantManagerProxy)

  // Tenantrmgsi alchemy testnet
  //
  // const tenantName = 'Tenantrmgsi'
  // const tenantAddress = await tenantManager.getTenantAddress(tenantName)

  // // Change tenant name if needed
  // const tenantName = 'Tenant' + Math.random().toString(36).substring(2, 7)

  const tx = await tenantManager
    .connect(signer)
    .createTenantWithMintableContract(tenantName, 2, BigInt(15), 'Mintable', 'MTB', {
      value: hre.ethers.parseEther('0.01'),
    })
  await tx.wait()
  const tenantAddress = await tenantManager.getTenantAddress(tenantName)
  console.log(`Created tenant: ${tenantName} by signer: ${signer.address}, tx: ${tx.hash}`)

  const interval = 5000
  setInterval(async () => {
    try {
      const tenant = await hre.ethers.getContractAt('Tenant', tenantAddress)
      const reqId = new Date().getTime().toString() + tenantAddress.slice(2)
      const tx = await tenant.connect(signer).record(reqId, 10, 1, addresses.sampleNft, 0)
      await tx.wait()
      console.log(`Recorded transaction for tenant: ${tenantAddress} by signer: ${signer.address}, tx: ${tx.hash}`)
    } catch (error) {
      console.error('Error recording transaction:', error)
    }
  }, interval)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
