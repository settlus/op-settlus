import '../env'
import fs from 'fs'
import hre from "hardhat";

const deployTenantFactory = async (contractName: string) => {
  console.log(`Deploying ${contractName}...`)
  const factory = await hre.ethers.getContractFactory(contractName)
  const contract = await factory.deploy()
  
  await contract.waitForDeployment()

  console.log(`${contractName} deployed to ${await contract.getAddress()}`)

  const contractsJSON = JSON.stringify({address: await contract.getAddress()}, null, 2)
  fs.writeFileSync('./scripts/factory-address.json', contractsJSON)
}

async function main() {
  await hre.run('compile')
  console.log(`Compiling...`)
  const contractName = 'TenantFactory'
  await deployTenantFactory(contractName)
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });