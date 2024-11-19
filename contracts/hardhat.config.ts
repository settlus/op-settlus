import './env'
import type { HardhatUserConfig } from "hardhat/config";

import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-viem";
import "@nomicfoundation/hardhat-chai-matchers";

//https://docs.optimism.io/chain/testing/dev-node#additional-info
const OP_PRIVATE_KEY = ['0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6'] 

const getEndpoint = () => {
  const { ENDPOINT_URL } = process.env
  if (ENDPOINT_URL && ENDPOINT_URL !== '') {
    return ENDPOINT_URL
  }
  console.log('ENDPOINT_URL Not Set! Please set up .env')
  return ''
}

const getPrivateKey = (env?: string) => {
  const { MNEMONIC, PRIVATE_KEY } = process.env
  if (env === 'local') {
    return OP_PRIVATE_KEY;
  }

  if (PRIVATE_KEY && PRIVATE_KEY !== '') {
    return [PRIVATE_KEY];
  }
  if (MNEMONIC && MNEMONIC !== '') {
    return {
      mnemonic: MNEMONIC,
    };
  }

  console.log('Private Key or mnemonic Not Set! Please set up .env');
  return [];
}

const config: HardhatUserConfig = {
  networks: {
    local: {
      url: getEndpoint(),
      accounts: getPrivateKey('local'),
      chainId: 901,
    },
    settlus: {
      url: 'http://3.38.163.215:8545',
      accounts: getPrivateKey(),
      chainId: 5372
    }
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