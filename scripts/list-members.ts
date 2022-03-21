/* eslint-disable prettier/prettier */
import axios from 'axios';

/*
ts-node scripts/list-members.ts3
*/
async function main() {
    // replace with your Alchemy api key
    const apiKey = "xx";
    const baseURL = `https://eth-mainnet.alchemyapi.io/v2/${apiKey}/getOwnersForToken`;
    const contractAddr = "0xd22f83e8a1502b1d41c0b40cf64b291a6eabc44d";
    const tokenId = "0";

    const config: any = {
        method: 'get',
        url: `${baseURL}?contractAddress=${contractAddr}&tokenId=${tokenId}`,
        headers: {}
    };

    axios(config)
        .then(response => console.log(JSON.stringify(response.data, null, 2)))
        .catch(error => console.log(error));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
