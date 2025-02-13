import addresses from "./contract-addresses.json";
import fs from "fs";
import path from "path";
import hre from "hardhat";

// This script is for testing purpose only, especially for single-tenant setup on devnet
const CHAIN_ID = 5373;
const JSON_PATH = path.resolve(__dirname, "./contract-addresses.json");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const tenantManager = await hre.ethers.getContractAt("TenantManager", addresses.tenantManagerProxy);

  const tenantName = "Tenant" + Math.random().toString(36).substring(2, 7); // change tenant name if needed

  const tx = await tenantManager
    .connect(signer)
    .createTenantWithMintableContract(tenantName, 2, BigInt(15), "AcmyMtb", "AMT", {
      value: hre.ethers.parseEther("0.01"),
    });
  await tx.wait();
  const tenantAddress = await tenantManager.getTenantAddress(tenantName);
  console.log(`Created tenant: ${tenantName} by signer: ${signer.address}, tx: ${tx.hash}`);

  updateAddressesJSON(tenantAddress, tenantName);

  const interval = 5000;
  setInterval(async () => {
    try {
      const reqId = new Date().getTime().toString() + tenantAddress.slice(2);
      const tx = await tenantManager.connect(signer).record(tenantAddress, reqId, 10, CHAIN_ID, addresses.sampleNft, 0);
      await tx.wait();
      console.log(`Recorded transaction for tenant: ${tenantAddress} by signer: ${signer.address}, tx: ${tx.hash}`);
    } catch (error) {
      console.error("Error recording transaction:", error);
    }
  }, interval);
}

function updateAddressesJSON(tenantAddress: string, tenantName: string) {
  fs.readFile(JSON_PATH, "utf-8", (err, data) => {
    if (err) {
      console.error("Error reading JSON file:", err);
      return;
    }

    try {
      const jsonData = JSON.parse(data);

      jsonData.alchemyTestnetTenantAddress = tenantAddress;
      jsonData.alchemyTestnetTenantName = tenantName;

      fs.writeFile(JSON_PATH, JSON.stringify(jsonData, null, 2), (writeErr) => {
        if (writeErr) {
          console.error("Error writing to JSON file:", writeErr);
        } else {
          console.log("Updated alchemyTestnetTenantAddress and alchemyTestnetTenantName in contract-addresses.json");
        }
      });
    } catch (parseErr) {
      console.error("Error parsing JSON:", parseErr);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
