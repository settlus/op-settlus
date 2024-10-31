import hre from "hardhat";
import fs from "fs";

async function main() {
  const tenantFactory = await hre.viem.deployContract("TenantFactory");
  console.log(tenantFactory.address);
  const contractAddress = {
    address: tenantFactory.address,
  }
  const addressJSON = JSON.stringify(contractAddress, null, 2)

  fs.writeFileSync('./scripts/factory-address.json', addressJSON)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });