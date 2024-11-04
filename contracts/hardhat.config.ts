import './env'
import type { HardhatUserConfig } from "hardhat/config";

import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-viem";
import "@nomicfoundation/hardhat-chai-matchers";

const getEndpoint = () => {
  const { ENDPOINT_URL } = process.env
  if (ENDPOINT_URL && ENDPOINT_URL !== '') {
    return ENDPOINT_URL
  }
  console.log('ENDPOINT_URL Not Set! Please set up .env')
  return ''
}

const getPrivateKey = () => {
  const { MNEMONIC, PRIVATE_KEY } = process.env
  if (PRIVATE_KEY && PRIVATE_KEY !== '') {
    return [PRIVATE_KEY]
  }
  if (MNEMONIC && MNEMONIC !== '') {
    return {
      mnemonic: MNEMONIC,
    }
  }
  console.log('Private Key or mnemonic Not Set! Please set up .env')
  return []
}

const config: HardhatUserConfig = {
  networks: {
    local: {
      url: getEndpoint(),
      accounts: getPrivateKey(),
      chainId: 900,
    },
  },
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
      },
    },
  }
};

export default config;