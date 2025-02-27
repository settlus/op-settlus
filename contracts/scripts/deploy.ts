import fs from 'fs'
import hre from 'hardhat'
import TenantManagerArtifact from '../artifacts/src/TenantManager.sol/TenantManager.json'
import { encodeFunctionData, keccak256, encodePacked } from 'viem'
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
  const settlerAddress = vars.get('SETTLER_ADDRESS')
  const tenantManagerName = 'TenantManager'

  if (!settlerAddress) {
    throw new Error('SETTLER_ADDRESS not set in environment variables')
  }

  // Deploy the NFT contract
  const nftContract = await deployFactory(nftContractName, nftContractOwner.address)

  // Mint an NFT to a specific address
  const mintTx = await nftContract.safeMint(nftOwner)
  await mintTx.wait()
  console.log(`NFT minted to: ${nftOwner}`)

  // Deploy the TenantManager implementation and proxy
  const tenantManagerImplementation = await deployFactory(tenantManagerName)
  const initData = encodeFunctionData({
    abi: TenantManagerArtifact.abi,
    functionName: 'initialize',
    args: [deployer.address], // owner address
  })

  console.log(`Deploying TenantManager Proxy...`)
  const ProxyFactory = await hre.ethers.getContractFactory('TenantManagerProxy')
  const tenantManagerProxy = await ProxyFactory.deploy(tenantManagerImplementation.getAddress(), initData)
  await tenantManagerProxy.waitForDeployment()
  console.log(`TenantManager Proxy deployed to ${await tenantManagerProxy.getAddress()}`)

  // Grant SETTLER_ROLE to the specified address
  const tenantManager = await hre.ethers.getContractAt('TenantManager', await tenantManagerProxy.getAddress())
  const SETTLER_ROLE = keccak256(encodePacked(['string'], ['SETTLER_ROLE']))
  
  console.log(`Granting SETTLER_ROLE to ${settlerAddress}...`)
  const grantRoleTx = await tenantManager.grantRole(SETTLER_ROLE, settlerAddress)
  await grantRoleTx.wait()
  console.log(`SETTLER_ROLE granted to ${settlerAddress}`)

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
