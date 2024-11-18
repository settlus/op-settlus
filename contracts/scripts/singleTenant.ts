import '../env'
import addresses from './contract-addresses.json'
import hre from 'hardhat'
import { zeroAddress, parseEther } from 'viem'

// This script is for testing purpose only, especially for single-tenant setup on devnet
async function main() {
  const [signer] = await hre.ethers.getSigners()
  const tenantManager = await hre.ethers.getContractAt('TenantManager', addresses.tenantManagerProxy)

  // Tenanthqdmz Tenantjjnhn Tenantpkfxq
  const tenantName = 'Tenanthqdmz'
  const tenantAddress = await tenantManager.getTenantAddress(tenantName)

  // // Change tenant name if needed
  // const tenantName = 'Tenant' + Math.random().toString(36).substring(2, 7)

  // const tx = await tenantManager.connect(signer).createTenantWithMintableContract(tenantName, 2, BigInt(15), "Mintable", "MTB")
  // await tx.wait()
  // const tenantAddress = await tenantManager.getTenantAddress(tenantName, { gasLimit: 100000000 })
  // console.log(`Created tenant: ${tenantName} by signer: ${signer.address}, tx: ${tx.hash}`)
  // const sendTx = await signer.sendTransaction({
  //   to: tenantAddress,
  //   value: parseEther('1', 'gwei'),
  // })
  // await sendTx.wait()
  // console.log(`Sent 1 gwei to tenant: ${tenantAddress} by signer: ${signer.address}, hash: ${sendTx.hash}`)

  const interval = 10000
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
