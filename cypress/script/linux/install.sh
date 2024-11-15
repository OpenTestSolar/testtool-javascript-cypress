#! /bin/bash

set -exu -o pipefail

# 使用COS上的安装脚本安装uniSDK，后续修改为testsolar的独立域名
curl -Lk https://testsolar-1321258242.cos.ap-guangzhou.myqcloud.com/cli/testtools_sdk-install/stable/install.sh | bash

TOOL_ROOT=$(dirname $(dirname $(dirname $(readlink -fm $0))))
echo ${TOOL_ROOT}

cd ${TOOL_ROOT}

npm install pnpm -g

pnpm install

pnpm install typescript

npx tsc

npx cypress install 

apt-get update
apt-get install -y xvfb
apt-get install -y libnss3 libgconf-2-4 libxss1 libasound2 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libpangocairo-1.0-0
apt-get install -y libgtk-3-0 libnss3 libgconf-2-4 libxss1 libasound2 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libpangocairo-1.0-0
