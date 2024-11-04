import '../env'
import fs from 'fs'
import hre from 'hardhat'

// issue with viem https://github.com/NomicFoundation/hardhat/issues/5187
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
  const deployer = process.env.PUBLIC_KEY || ''
  const nftContractOwner = deployer
  const nftContractName = 'BasicERC721'
  const nftOwner = process.env.NFT_OWNER || ''
  const tenantFactoryname = 'TenantFactory'
  const nftContract = await deployFactory(nftContractName, nftContractOwner!)

  // Mint an NFT to a specific address
  const mintTx = await nftContract.safeMint(nftOwner)
  await mintTx.wait()
  console.log(`NFT minted to: ${nftOwner}`)

  const tenantFactory = await deployFactory(tenantFactoryname)

  const addresses = {
    sampleNft: await nftContract.getAddress(),
    tenantFactory: await tenantFactory.getAddress(),
  }

  fs.writeFileSync('./scripts/contract-addresses.json', JSON.stringify(addresses, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
