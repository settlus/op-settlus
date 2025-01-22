import fs from 'fs'
import hre from 'hardhat'
import TenantManagerArtifact from '../artifacts/src/TenantManager.sol/TenantManager.json'
import { encodeFunctionData } from 'viem'
import { vars } from 'hardhat/config'

// Issue with viem https://github.com/NomicFoundation/hardhat/issues/5187
const deployFactory = async (contractName: string, ...args: string[]) => {
  console.log(`Deploying ${contractName}...`)
  const factory = await hre.ethers.getContractFactory(contractName)
  const contract = await factory.deploy(...args)

  await contract.waitForDeployment()

  console.log(`${contractName} deployed to ${await contract.getAddress()}`)

  return contract
}

async function main() {
  await hre.run('compile')
  console.log(`Compiling...`)
  const [deployer] = await hre.ethers.getSigners()
  const nftContractOwner = deployer
  const nftContractName = 'BasicERC721'
  const nftOwner = vars.get('NFT_OWNER')
  const tenantManagerName = 'TenantManager'
3
  // Deploy the NFT contract
  const nftContract = await deployFactory(nftContractName, nftContractOwner.address)

  // Mint an NFT to a specific address
  const mintTx = await nftContract.safeMint(nftOwner)
  await mintTx.wait()
  console.log(`NFT minted to: ${nftOwner}`)

  // Deploy the TenantManager implementation
  const tenantManagerImplementation = await deployFactory(tenantManagerName)
  const initData = encodeFunctionData({
    abi: TenantManagerArtifact.abi,
    functionName: 'initialize',
    args: [deployer.address], // owner address
  })

  // Deploy the Proxy pointing to TenantManager
  console.log(`Deploying TenantManager Proxy...`)
  const ProxyFactory = await hre.ethers.getContractFactory('TenantManagerProxy')
  const tenantManagerProxy = await ProxyFactory.deploy(tenantManagerImplementation.getAddress(), initData)
  await tenantManagerProxy.waitForDeployment()
  console.log(`TenantManager Proxy deployed to ${await tenantManagerProxy.getAddress()}`)

  const addresses = {
    sampleNft: await nftContract.getAddress(),
    tenantManagerImplementation: await tenantManagerImplementation.getAddress(),
    tenantManagerProxy: await tenantManagerProxy.getAddress(),
  }

  fs.writeFileSync('./scripts/contract-addresses.json', JSON.stringify(addresses, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
